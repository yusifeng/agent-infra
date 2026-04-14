'use client';

import type {
  MessageDto,
  RunDto,
  RunStreamEventDto,
  RunTimelineResponseDto,
  RuntimePiMetaDto,
  ThreadDto
} from '@agent-infra/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { assistantMessageHasVisibleContent } from '@/components/chat-shell/helpers';
import type { LiveAssistantDraft } from '@/components/chat-shell/types';
import {
  createThreadResponse,
  fetchRunTimelineResponse,
  fetchRuntimeMetaResponse,
  fetchThreadMessagesResponse,
  fetchThreadRunsResponse,
  fetchThreadsResponse,
  openThreadRunStream
} from '@/features/durable-chat/repo/chat-api';
import { persistSelectedRunId, readPersistedRunId } from '@/features/durable-chat/repo/run-selection-storage';
import {
  applyRunStateToTimeline,
  buildAssistantMessageFromSnapshot,
  chooseInitialRunId,
  compareRunsByCreatedAt,
  includeSelectedRun,
  isPrimaryChatAssistantEventType,
  normalizeRuntimeMeta,
  parseSseChunk,
  RECENT_RUNS_LIMIT,
  upsertMessage,
  upsertRun
} from '@/features/durable-chat/service/chat-runtime';
import type { ChatPhase, DurableChatRuntimeOptions } from '@/features/durable-chat/types/runtime';

const PENDING_NEW_THREAD_LOADING_ID = '__pending-new-thread__';

export function useDurableChatRuntime({ initialThreadId = null }: DurableChatRuntimeOptions) {
  const router = useRouter();
  const [threads, setThreads] = useState<ThreadDto[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [draft, setDraft] = useState('');
  const [optimisticUserMessage, setOptimisticUserMessage] = useState<MessageDto | null>(null);
  const [meta, setMeta] = useState<RuntimePiMetaDto | null>(null);
  const [selectedModelKey, setSelectedModelKey] = useState('');
  const [chatPhase, setChatPhase] = useState<ChatPhase>('idle');
  const [persistingTurn, setPersistingTurn] = useState(false);
  const [loadingThreadId, setLoadingThreadId] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [recentRuns, setRecentRuns] = useState<RunDto[]>([]);
  const [recentRunsLoading, setRecentRunsLoading] = useState(false);
  const [recentRunsError, setRecentRunsError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<RunTimelineResponseDto | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [liveStreamRunId, setLiveStreamRunId] = useState<string | null>(null);
  const [liveAssistantDraft, setLiveAssistantDraft] = useState<LiveAssistantDraft | null>(null);
  const [durableRecoveryNotice, setDurableRecoveryNotice] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth >= 1024));
  const [logOpen, setLogOpen] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const runSelectionPersistenceReadyRef = useRef(false);
  const activeThreadIdRef = useRef<string | null>(null);
  const logOpenRef = useRef(false);
  const selectedRunIdRef = useRef<string | null>(null);
  const timelineRef = useRef<RunTimelineResponseDto | null>(null);
  const messagesRequestIdRef = useRef(0);
  const messagesAbortControllerRef = useRef<AbortController | null>(null);
  const logInspectorRequestIdRef = useRef(0);
  const logInspectorAbortControllerRef = useRef<AbortController | null>(null);
  const timelineRequestIdRef = useRef(0);
  const timelineAbortControllerRef = useRef<AbortController | null>(null);
  const sendRequestIdRef = useRef(0);
  const sendAbortControllerRef = useRef<AbortController | null>(null);
  const reconcileRequestIdRef = useRef(0);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeThread = useMemo(() => threads.find((thread) => thread.id === activeThreadId) ?? null, [threads, activeThreadId]);
  const selectedModelOption = useMemo(
    () => meta?.modelOptions.find((option) => option.key === selectedModelKey) ?? meta?.modelOptions[0] ?? null,
    [meta, selectedModelKey]
  );
  const selectedRun = timeline?.run ?? null;
  const runEvents = timeline?.runEvents ?? [];
  const toolInvocations = timeline?.toolInvocations ?? [];
  const currentThreadTitle = activeThread?.title?.trim() || activeThreadId || 'New chat';
  const isSending = chatPhase === 'thinking';
  const isStreamingText = chatPhase === 'streaming';
  const isFinalizingTranscript = chatPhase === 'transcript-final';
  const isChatResponding = isSending || isStreamingText;
  const isLoadingForActiveThread =
    loadingThreadId !== null && (loadingThreadId === activeThreadId || (loadingThreadId === PENDING_NEW_THREAD_LOADING_ID && activeThreadId === null));
  const showResponseLoading = (isChatResponding || isFinalizingTranscript || persistingTurn) && isLoadingForActiveThread;
  const sendDisabled = !draft.trim() || isChatResponding || !meta?.runtimeConfigured || !selectedModelOption;
  const inputLocked = isChatResponding;
  const displayedMessages = useMemo(
    () => (optimisticUserMessage ? upsertMessage(messages, optimisticUserMessage) : messages),
    [messages, optimisticUserMessage]
  );

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    logOpenRef.current = logOpen;
  }, [logOpen]);

  useEffect(() => {
    selectedRunIdRef.current = selectedRunId;
  }, [selectedRunId]);

  useEffect(() => {
    timelineRef.current = timeline;
  }, [timeline]);

  useEffect(() => {
    if (!runSelectionPersistenceReadyRef.current) {
      return;
    }

    if (!logOpenRef.current && selectedRunId === null) {
      return;
    }

    persistSelectedRunId(activeThreadId, selectedRunId);
  }, [activeThreadId, selectedRunId]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [draft]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, []);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    const handleScroll = () => {
      const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      const nearBottom = distance < 140;
      shouldAutoScrollRef.current = nearBottom;
      setShowScrollToBottom(!nearBottom);
    };

    handleScroll();
    viewport.addEventListener('scroll', handleScroll);
    return () => {
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport || !shouldAutoScrollRef.current) {
      return;
    }

    window.requestAnimationFrame(() => {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: messages.length > 0 ? 'smooth' : 'auto'
      });
    });
  }, [messages, liveAssistantDraft?.partialText, liveAssistantDraft?.partialReasoning, activeThreadId, loadingMessages]);

  function scrollToMessagesBottom() {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    shouldAutoScrollRef.current = true;
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: 'smooth'
    });
  }

  function resetDraftThreadState() {
    messagesRequestIdRef.current += 1;
    messagesAbortControllerRef.current?.abort();
    logInspectorRequestIdRef.current += 1;
    logInspectorAbortControllerRef.current?.abort();
    timelineRequestIdRef.current += 1;
    timelineAbortControllerRef.current?.abort();
    sendRequestIdRef.current += 1;
    sendAbortControllerRef.current?.abort();
    setChatPhase('idle');
    setPersistingTurn(false);
    setLoadingThreadId(null);
    setActiveThreadId(null);
    setDraft('');
    setOptimisticUserMessage(null);
    setMessages([]);
    setRecentRuns([]);
    setSelectedRunId(null);
    setTimeline(null);
    setTimelineError(null);
    setTimelineLoading(false);
    setLiveAssistantDraft(null);
    setLiveStreamRunId(null);
    setRecentRunsLoading(false);
    setRecentRunsError(null);
    setLoadingMessages(false);
    shouldAutoScrollRef.current = true;
  }

  function resetLogInspectorState(options?: { clearSelectedRun?: boolean }) {
    logInspectorRequestIdRef.current += 1;
    logInspectorAbortControllerRef.current?.abort();
    timelineRequestIdRef.current += 1;
    timelineAbortControllerRef.current?.abort();
    setRecentRuns([]);
    if (options?.clearSelectedRun !== false) {
      setSelectedRunId(null);
    }
    setTimeline(null);
    setTimelineError(null);
    setTimelineLoading(false);
    setRecentRunsLoading(false);
    setRecentRunsError(null);
  }

  function stopViewingLiveResponse() {
    sendAbortControllerRef.current?.abort();
    setChatPhase('idle');
    setLiveStreamRunId(null);
    setPersistingTurn(false);
    setLoadingThreadId(null);
  }

  async function activateThread(threadId: string, options?: { preferredRunId?: string | null }) {
    setActiveThreadId(threadId);
    activeThreadIdRef.current = threadId;
    shouldAutoScrollRef.current = true;
    const restoredRunId = await loadThreadMessages(threadId, options);
    if (options?.preferredRunId) {
      setDurableRecoveryNotice(
        restoredRunId
          ? 'Restored the focused run from durable records. Live stream drafts are transient and may not survive refresh.'
          : null
      );
    } else {
      setDurableRecoveryNotice(null);
    }

    return restoredRunId;
  }

  function navigateToThread(threadId: string, options?: { replace?: boolean }) {
    if (options?.replace) {
      router.replace(`/chat/${threadId}`);
    } else {
      router.push(`/chat/${threadId}`);
    }
  }

  function navigateToNewChat(options?: { replace?: boolean }) {
    if (options?.replace) {
      router.replace('/new');
    } else {
      router.push('/new');
    }
  }

  function replaceCurrentPath(pathname: string) {
    if (typeof window === 'undefined') {
      router.replace(pathname);
      return;
    }

    window.history.replaceState(window.history.state, '', pathname);
  }

  async function refreshThreads() {
    const { data, response } = await fetchThreadsResponse();
    if (!response.ok) {
      throw new Error(data.error ?? `Failed to load threads (${response.status})`);
    }

    setThreads(data.threads);
    return data.threads;
  }

  async function loadLogInspector(
    threadId: string,
    messagesSnapshot: MessageDto[],
    options?: { preferredRunId?: string | null; preserveExistingTimeline?: boolean }
  ) {
    logInspectorRequestIdRef.current += 1;
    const requestId = logInspectorRequestIdRef.current;
    logInspectorAbortControllerRef.current?.abort();
    const controller = new AbortController();
    logInspectorAbortControllerRef.current = controller;
    setRecentRunsLoading(true);
    setRecentRunsError(null);

    try {
      const nextRuns = await hydrateRecentRuns(threadId, controller.signal);
      if (controller.signal.aborted || requestId !== logInspectorRequestIdRef.current || activeThreadIdRef.current !== threadId) {
        return null;
      }

      const resolved = await resolveSelectedRun(
        threadId,
        options?.preferredRunId,
        messagesSnapshot,
        nextRuns,
        controller.signal
      );

      if (controller.signal.aborted || requestId !== logInspectorRequestIdRef.current || activeThreadIdRef.current !== threadId) {
        return null;
      }

      setRecentRuns(resolved.nextRuns);
      setSelectedRunId(resolved.nextSelectedRunId);
      setRecentRunsError(null);

      await loadRunTimeline(resolved.nextSelectedRunId, {
        preserveExisting: options?.preserveExistingTimeline === true
      });
      return resolved.nextSelectedRunId;
    } catch (loadError) {
      if (controller.signal.aborted || requestId !== logInspectorRequestIdRef.current || activeThreadIdRef.current !== threadId) {
        return null;
      }

      setRecentRuns([]);
      setRecentRunsError(loadError instanceof Error ? loadError.message : 'Failed to load thread runs');
      setTimeline(null);
      setTimelineError(null);
      setTimelineLoading(false);
      return null;
    } finally {
      if (requestId === logInspectorRequestIdRef.current) {
        logInspectorAbortControllerRef.current = null;
        setRecentRunsLoading(false);
      }
    }
  }

  async function loadRunTimeline(runId: string | null, options?: { preserveExisting?: boolean }) {
    timelineRequestIdRef.current += 1;
    const requestId = timelineRequestIdRef.current;
    timelineAbortControllerRef.current?.abort();
    const previousSelectedRunId = selectedRunIdRef.current;
    setSelectedRunId(runId);

    if (!runId) {
      selectedRunIdRef.current = runId;
      timelineAbortControllerRef.current = null;
      setTimeline(null);
      setTimelineError(null);
      setTimelineLoading(false);
      return;
    }

    const controller = new AbortController();
    timelineAbortControllerRef.current = controller;
    if (!options?.preserveExisting || previousSelectedRunId !== runId) {
      setTimeline(null);
    }
    selectedRunIdRef.current = runId;
    setTimelineLoading(true);
    setTimelineError(null);

    try {
      const { data, response } = await fetchRunTimelineResponse(runId, controller.signal);
      if (!response.ok) {
        throw new Error(data.error ?? `Failed to load run timeline (${response.status})`);
      }

      if (requestId !== timelineRequestIdRef.current) {
        return;
      }

      setTimeline(data);
    } catch (loadError) {
      if (controller.signal.aborted || requestId !== timelineRequestIdRef.current) {
        return;
      }

      setTimeline(null);
      setTimelineError(loadError instanceof Error ? loadError.message : 'Failed to load run timeline');
    } finally {
      if (requestId === timelineRequestIdRef.current) {
        timelineAbortControllerRef.current = null;
        setTimelineLoading(false);
      }
    }
  }

  async function tryResolvePreferredRun(threadId: string, runId: string, signal: AbortSignal) {
    try {
      const { data, response } = await fetchRunTimelineResponse(runId, signal);
      if (!response.ok || !data.run || data.run.threadId !== threadId) {
        return null;
      }

      return data.run;
    } catch {
      return null;
    }
  }

  async function refreshMeta() {
    const { data, response } = await fetchRuntimeMetaResponse();
    const normalized = normalizeRuntimeMeta(data);
    setMeta(normalized);
    if (!response.ok) {
      setError(normalized.runtimeConfigError ?? `Failed to load runtime metadata (${response.status})`);
      return;
    }

    setSelectedModelKey((current) => {
      if (current && normalized.modelOptions.some((option) => option.key === current)) {
        return current;
      }

      return normalized.defaultModelKey ?? normalized.modelOptions[0]?.key ?? '';
    });
  }

  async function hydrateTranscript(threadId: string, signal: AbortSignal) {
    const { data, response } = await fetchThreadMessagesResponse(threadId, signal);
    if (!response.ok) {
      throw new Error(data.error ?? `Failed to load messages (${response.status})`);
    }

    return data.messages ?? [];
  }

  async function hydrateRecentRuns(threadId: string, signal: AbortSignal) {
    const { data, response } = await fetchThreadRunsResponse(threadId, RECENT_RUNS_LIMIT, signal);
    if (!response.ok) {
      throw new Error(data.error ?? `Failed to load thread runs (${response.status})`);
    }

    return (data.runs ?? []).slice().sort(compareRunsByCreatedAt);
  }

  async function resolveSelectedRun(
    threadId: string,
    preferredRunId: string | null | undefined,
    messages: MessageDto[],
    runs: RunDto[],
    signal: AbortSignal
  ) {
    let nextRuns = runs;
    let preferredResolvedRun: RunDto | null = null;

    if (preferredRunId && !nextRuns.some((run) => run.id === preferredRunId)) {
      preferredResolvedRun = await tryResolvePreferredRun(threadId, preferredRunId, signal);
      nextRuns = includeSelectedRun(nextRuns, preferredResolvedRun);
    }

    return {
      nextRuns,
      nextSelectedRunId: chooseInitialRunId(messages, nextRuns, preferredResolvedRun?.id ?? preferredRunId ?? null)
    };
  }

  function applyHydratedTranscript(messages: MessageDto[], selectedRunId: string | null, runs: RunDto[]) {
    const hasPersistedAssistantForSelectedRun =
      selectedRunId !== null && messages.some((message) => message.runId === selectedRunId && assistantMessageHasVisibleContent(message));

    setMessages(messages);
    setRecentRuns(runs);
    setSelectedRunId(selectedRunId);
    setOptimisticUserMessage(null);
    setLiveAssistantDraft((current) => {
      if (!current) {
        return null;
      }

      if (current.runId !== selectedRunId) {
        return null;
      }

      return hasPersistedAssistantForSelectedRun ? null : current;
    });
    setRecentRunsError(null);
    setError(null);
    if (messages.some(assistantMessageHasVisibleContent)) {
      setChatPhase('idle');
    }
  }

  async function loadThreadMessages(
    threadId: string,
    options?: {
      preferredRunId?: string | null;
      background?: boolean;
      skipTimelineReload?: boolean;
      preserveExistingTimeline?: boolean;
    }
  ) {
    const background = options?.background === true;
    messagesRequestIdRef.current += 1;
    const requestId = messagesRequestIdRef.current;
    messagesAbortControllerRef.current?.abort();
    const controller = new AbortController();
    messagesAbortControllerRef.current = controller;
    if (!background) {
      setLoadingMessages(true);
    }
    if (!logOpenRef.current) {
      resetLogInspectorState();
    } else {
      setRecentRunsLoading(true);
      setRecentRunsError(null);
    }

    try {
      const nextMessages = await hydrateTranscript(threadId, controller.signal);

      if (controller.signal.aborted || requestId !== messagesRequestIdRef.current) {
        return;
      }

      if (!logOpenRef.current) {
        applyHydratedTranscript(nextMessages, null, []);
        return null;
      }

      applyHydratedTranscript(nextMessages, null, []);
      if (options?.skipTimelineReload) {
        return null;
      }

      return await loadLogInspector(threadId, nextMessages, {
        preferredRunId: options?.preferredRunId,
        preserveExistingTimeline: options?.preserveExistingTimeline === true
      });
    } catch (loadError) {
      if (controller.signal.aborted || requestId !== messagesRequestIdRef.current) {
        return;
      }

      resetLogInspectorState();
      setLiveAssistantDraft(null);
      setOptimisticUserMessage(null);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load thread messages');
      return null;
    } finally {
      if (requestId === messagesRequestIdRef.current) {
        messagesAbortControllerRef.current = null;
        if (!background) {
          setLoadingMessages(false);
        }
      }
    }
  }

  async function reconcileCompletedTurn(
    threadId: string,
    preferredRunId: string | null,
    requestId: number,
    options?: { recoverTranscript?: boolean }
  ) {
    reconcileRequestIdRef.current += 1;
    const reconcileRequestId = reconcileRequestIdRef.current;
    const reconcileController = new AbortController();
    const isReconcileThreadStale = () => activeThreadIdRef.current !== threadId;
    const isLatestReconcile = () => reconcileRequestId === reconcileRequestIdRef.current;
    const isCurrentSend = () => requestId === sendRequestIdRef.current;
    const inspectorEnabled = logOpenRef.current;
    if (inspectorEnabled) {
      setRecentRunsLoading(true);
      setRecentRunsError(null);
    }
    const requestedRunId = preferredRunId ?? (inspectorEnabled ? selectedRunIdRef.current : null);
    let nextSelectedRunId: string | null = null;
    let reconciledMessages = messages;

    try {
      if (options?.recoverTranscript) {
        const { data: messagesData, response: messagesResponse } = await fetchThreadMessagesResponse(threadId, reconcileController.signal);

        if (isReconcileThreadStale()) {
          return;
        }
        if (!messagesResponse.ok) {
          throw new Error(messagesData.error ?? `Failed to recover thread messages (${messagesResponse.status})`);
        }
        if (!isLatestReconcile()) {
          return;
        }

        reconciledMessages = messagesData.messages ?? [];
        setMessages(reconciledMessages);
        if (isCurrentSend()) {
          setOptimisticUserMessage(null);
          setLiveAssistantDraft(null);
        }
      }

      if (inspectorEnabled) {
        const { data: runsData, response: runsResponse } = await fetchThreadRunsResponse(threadId, RECENT_RUNS_LIMIT, reconcileController.signal);
        if (isReconcileThreadStale()) {
          return;
        }
        if (!runsResponse.ok) {
          throw new Error(runsData.error ?? `Failed to load thread runs (${runsResponse.status})`);
        }

        let nextRuns = (runsData.runs ?? []).slice().sort(compareRunsByCreatedAt);
        if (requestedRunId && !nextRuns.some((run) => run.id === requestedRunId)) {
          const preferredResolvedRun = await tryResolvePreferredRun(threadId, requestedRunId, reconcileController.signal);
          if (isReconcileThreadStale()) {
            return;
          }

          nextRuns = includeSelectedRun(nextRuns, preferredResolvedRun);
        }

        if (!isLatestReconcile()) {
          return;
        }

        nextSelectedRunId = chooseInitialRunId(reconciledMessages, nextRuns, requestedRunId);
        setRecentRuns(nextRuns);
        setRecentRunsError(null);
        if (isCurrentSend()) {
          setSelectedRunId(nextSelectedRunId);
        }
      }

      if (inspectorEnabled && nextSelectedRunId && isCurrentSend()) {
        setTimelineLoading(true);
        setTimelineError(null);
        try {
          const { data: timelineData, response: timelineResponse } = await fetchRunTimelineResponse(nextSelectedRunId);
          if (isReconcileThreadStale() || !isLatestReconcile()) {
            return;
          }
          if (!timelineResponse.ok) {
            throw new Error(timelineData.error ?? `Failed to load run timeline (${timelineResponse.status})`);
          }

          if (
            activeThreadIdRef.current === threadId &&
            requestId === sendRequestIdRef.current &&
            selectedRunIdRef.current === nextSelectedRunId
          ) {
            setTimeline(timelineData);
            setTimelineError(null);
          }
        } catch (timelineRefreshError) {
          if (
            activeThreadIdRef.current === threadId &&
            requestId === sendRequestIdRef.current &&
            selectedRunIdRef.current === nextSelectedRunId
          ) {
            setTimelineError(timelineRefreshError instanceof Error ? timelineRefreshError.message : 'Failed to reconcile run timeline');
          }
        }
      } else if (inspectorEnabled && activeThreadIdRef.current === threadId && isCurrentSend()) {
        setTimeline(null);
        setTimelineError(null);
      }
    } catch (reconcileError) {
      if (isReconcileThreadStale() || !isLatestReconcile()) {
        return;
      }

      if (inspectorEnabled) {
        setRecentRunsError(reconcileError instanceof Error ? reconcileError.message : 'Failed to reconcile recent runs');
        if (nextSelectedRunId && isCurrentSend() && selectedRunIdRef.current === nextSelectedRunId) {
          setTimelineError(reconcileError instanceof Error ? reconcileError.message : 'Failed to reconcile run timeline');
        }
      }
    } finally {
      reconcileController.abort();
      if (requestId === sendRequestIdRef.current) {
        setPersistingTurn(false);
        setChatPhase((current) => (current === 'failed' ? 'failed' : 'idle'));
        setLoadingThreadId(null);
      }
      if (inspectorEnabled && activeThreadIdRef.current === threadId && reconcileRequestId === reconcileRequestIdRef.current) {
        setRecentRunsLoading(false);
        if (nextSelectedRunId && selectedRunIdRef.current === nextSelectedRunId) {
          setTimelineLoading(false);
        }
      }
    }
  }

  async function createThreadRecord() {
    const { data, response } = await createThreadResponse();
    if (!response.ok || !data.thread) {
      throw new Error(data.error ?? `Failed to create thread (${response.status})`);
    }

    const createdThread = data.thread;
    setThreads((current) => [...current, createdThread].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()));
    return createdThread;
  }

  async function sendMessage() {
    if (!draft.trim() || isChatResponding || !selectedModelOption) {
      return;
    }

    let threadId = activeThreadId;
    const text = draft.trim();
    const requestId = sendRequestIdRef.current + 1;
    sendRequestIdRef.current = requestId;
    sendAbortControllerRef.current?.abort();
    const controller = new AbortController();
    sendAbortControllerRef.current = controller;

    let streamedRunId: string | null = null;
    let streamSessionStarted = false;
    let terminalStreamError: string | null = null;
    let readyEventReceived = false;
    let requiresTranscriptRecovery = false;

    const applyAssistantSnapshot = (event: Extract<RunStreamEventDto, { type: 'run.assistant' }>) => {
      if (event.assistant.eventType.startsWith('toolcall')) {
        requiresTranscriptRecovery = true;
      }

      if (!isPrimaryChatAssistantEventType(event.assistant.eventType)) {
        setLiveAssistantDraft({
          runId: event.runId,
          messageId: event.assistant.messageId,
          partialText: event.assistant.partialText,
          partialReasoning: event.assistant.partialReasoning,
          eventType: event.assistant.eventType
        });
        return;
      }

      if (event.assistant.eventType === 'text_end') {
        setLiveStreamRunId(null);
        setChatPhase('transcript-final');
        if (threadId && !requiresTranscriptRecovery) {
          setMessages((current) =>
            upsertMessage(current, buildAssistantMessageFromSnapshot(current, threadId as string, event.runId, event.assistant))
          );
        }
        if (!requiresTranscriptRecovery) {
          setLiveAssistantDraft(null);
        }
        return;
      }

      if (event.assistant.partialText) {
        setChatPhase('streaming');
        setLiveAssistantDraft({
          runId: event.runId,
          messageId: event.assistant.messageId,
          partialText: event.assistant.partialText,
          partialReasoning: event.assistant.partialReasoning,
          eventType: event.assistant.eventType
        });
        return;
      }

      setChatPhase('thinking');
      setLiveAssistantDraft({
        runId: event.runId,
        messageId: event.assistant.messageId,
        partialText: event.assistant.partialText,
        partialReasoning: event.assistant.partialReasoning,
        eventType: event.assistant.eventType
      });
    };

    const processStreamEvent = (event: RunStreamEventDto) => {
      streamedRunId = event.runId;
      setLiveStreamRunId(event.runId);

      if (event.type === 'run.ready' && logOpenRef.current && selectedRunIdRef.current === null) {
        selectedRunIdRef.current = event.runId;
        setSelectedRunId(event.runId);
        setTimeline(applyRunStateToTimeline(null, event));
      }

      if (event.type !== 'run.assistant' && logOpenRef.current && selectedRunIdRef.current === event.runId) {
        setTimeline((current) => applyRunStateToTimeline(current, event));
      }

      if (event.type === 'run.ready') {
        readyEventReceived = true;
        setOptimisticUserMessage(null);
        setMessages((current) => upsertMessage(current, event.userMessage));
        setRecentRuns((current) => upsertRun(current, event.run));
        setLiveAssistantDraft((current) =>
          current
            ? {
                ...current,
                runId: event.runId
              }
            : current
        );
        return;
      }

      if (event.type === 'run.assistant') {
        applyAssistantSnapshot(event);
        return;
      }

      if (event.type === 'run.state' || event.type === 'run.completed') {
        setRecentRuns((current) => upsertRun(current, event.run));
      }

      if (event.type === 'run.failed' && event.run) {
        const failedRun = event.run;
        setRecentRuns((current) => upsertRun(current, failedRun));
      }

      if (event.type === 'run.failed') {
        requiresTranscriptRecovery = true;
        terminalStreamError = event.error;
        setError(event.error);
        setLiveStreamRunId(null);
        setPersistingTurn(false);
        setChatPhase('failed');
        setLiveAssistantDraft((current) => (current?.runId === event.runId ? null : current));
        return;
      }

      if (event.type === 'run.completed') {
        setError(null);
        setLiveStreamRunId(null);
        setChatPhase((current) => (current === 'failed' ? current : current === 'transcript-final' ? current : 'idle'));
      }
    };

    setChatPhase('thinking');
    setPersistingTurn(false);
    setLoadingThreadId(threadId ?? PENDING_NEW_THREAD_LOADING_ID);
    setError(null);
    setLiveStreamRunId(null);
    setDraft('');
    timelineRequestIdRef.current += 1;
    timelineAbortControllerRef.current?.abort();
    setTimelineLoading(false);
    setTimelineError(null);
    shouldAutoScrollRef.current = true;

    try {
      if (!threadId) {
        const nextThread = await createThreadRecord();
        threadId = nextThread.id;
        setActiveThreadId(threadId);
        activeThreadIdRef.current = threadId;
        setLoadingThreadId(threadId);
        replaceCurrentPath(`/chat/${threadId}`);
      }

      const optimisticMessage: MessageDto = {
        id: `optimistic-user-${requestId}`,
        threadId,
        runId: null,
        role: 'user',
        seq: (messages[messages.length - 1]?.seq ?? 0) + 1,
        status: 'created',
        metadata: { optimistic: true },
        createdAt: new Date().toISOString(),
        parts: [
          {
            id: `optimistic-user-part-${requestId}`,
            messageId: `optimistic-user-${requestId}`,
            partIndex: 0,
            type: 'text',
            textValue: text,
            jsonValue: null,
            createdAt: new Date().toISOString()
          }
        ]
      };
      setOptimisticUserMessage(optimisticMessage);
      setLiveAssistantDraft({
        runId: `pending-${requestId}`,
        messageId: `pending-assistant-${requestId}`,
        partialText: '',
        partialReasoning: null,
        eventType: 'start'
      });

      const response = await openThreadRunStream(
        threadId,
        {
          text,
          provider: selectedModelOption.provider,
          model: selectedModelOption.model
        },
        controller.signal
      );

      if (!response.ok) {
        const { error } = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(error ?? `request failed (${response.status})`);
      }

      if (!response.body) {
        throw new Error('stream response body is unavailable');
      }

      streamSessionStarted = true;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        if (controller.signal.aborted || requestId !== sendRequestIdRef.current) {
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseChunk(buffer);
        buffer = parsed.remainder;

        for (const event of parsed.events) {
          if (controller.signal.aborted || requestId !== sendRequestIdRef.current) {
            return;
          }

          processStreamEvent(event);
        }
      }

      const finalChunk = decoder.decode();
      if (finalChunk) {
        const parsed = parseSseChunk(`${buffer}${finalChunk}\n\n`);
        for (const event of parsed.events) {
          processStreamEvent(event);
        }
      }
    } catch (sendError) {
      if (controller.signal.aborted || requestId !== sendRequestIdRef.current) {
        return;
      }

      if (!readyEventReceived) {
        setDraft(text);
        setOptimisticUserMessage(null);
        setLiveAssistantDraft(null);
      } else {
        requiresTranscriptRecovery = true;
      }
      setChatPhase('failed');
      setPersistingTurn(false);
      setLoadingThreadId(null);
      setError(sendError instanceof Error ? sendError.message : 'Failed to send message');
    } finally {
      if (requestId === sendRequestIdRef.current) {
        sendAbortControllerRef.current = null;
        setLiveStreamRunId(null);
        setChatPhase((current) => (current === 'failed' ? 'failed' : current === 'transcript-final' ? 'transcript-final' : 'idle'));
      }

      if (!controller.signal.aborted && requestId === sendRequestIdRef.current && (streamSessionStarted || streamedRunId)) {
        if (threadId && activeThreadIdRef.current === threadId) {
          const preferredRunId = streamedRunId ?? selectedRunIdRef.current;
          setPersistingTurn(true);
          void reconcileCompletedTurn(threadId, preferredRunId, requestId, {
            recoverTranscript: requiresTranscriptRecovery
          });
        }

        void refreshThreads().catch((refreshError) => {
          setError(refreshError instanceof Error ? refreshError.message : 'Failed to refresh threads');
        });

        if (terminalStreamError) {
          setError(terminalStreamError);
        }
      }

    }
  }

  function startNewChat() {
    stopViewingLiveResponse();
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
    navigateToNewChat();
  }

  function openThread(threadId: string) {
    stopViewingLiveResponse();
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
    navigateToThread(threadId);
  }

  useEffect(() => {
    void (async () => {
      try {
        await refreshThreads();

        if (initialThreadId) {
          await activateThread(initialThreadId, {
            preferredRunId: readPersistedRunId(initialThreadId)
          });
        } else {
          resetDraftThreadState();
          setDurableRecoveryNotice(null);
          setError(null);
        }
      } catch (refreshError) {
        setError(refreshError instanceof Error ? refreshError.message : 'Failed to load threads');
      } finally {
        runSelectionPersistenceReadyRef.current = true;
      }
    })();

    void refreshMeta();
  }, [initialThreadId]);

  useEffect(() => {
    if (!logOpen) {
      resetLogInspectorState();
      return;
    }

    if (!activeThreadId) {
      return;
    }

    void loadLogInspector(activeThreadId, messages, {
      preferredRunId: readPersistedRunId(activeThreadId) ?? selectedRunIdRef.current,
      preserveExistingTimeline: true
    });
  }, [activeThreadId, logOpen]);

  useEffect(
    () => () => {
      stopViewingLiveResponse();
      sendAbortControllerRef.current?.abort();
      messagesAbortControllerRef.current?.abort();
      logInspectorAbortControllerRef.current?.abort();
      timelineAbortControllerRef.current?.abort();
    },
    []
  );

  return {
    activeThreadId,
    currentThreadTitle,
    displayedMessages,
    draft,
    durableRecoveryNotice,
    error,
    inputLocked,
    isChatResponding,
    liveAssistantDraft,
    liveStreamRunId,
    loadingMessages,
    logOpen,
    messagesViewportRef,
    meta,
    onCloseSidebar: () => setSidebarOpen(false),
    onDraftChange: setDraft,
    onNewChat: startNewChat,
    onOpenSidebar: () => setSidebarOpen(true),
    onOpenThread: openThread,
    onScrollToBottom: scrollToMessagesBottom,
    onSelectedModelKeyChange: setSelectedModelKey,
    onSelectRun: (runId: string) => {
      void loadRunTimeline(runId);
    },
    onSend: () => {
      void sendMessage();
    },
    onStop: stopViewingLiveResponse,
    onToggleLog: () => setLogOpen((current) => !current),
    persistingTurn,
    recentRuns,
    recentRunsError,
    recentRunsLoading,
    runEvents,
    selectedModelKey,
    selectedModelOption,
    selectedRun,
    selectedRunId,
    sendAbortControllerRef,
    sendDisabled,
    showResponseLoading,
    showScrollToBottom,
    sidebarOpen,
    textareaRef,
    threads,
    timelineError,
    timelineLoading,
    toolInvocations
  };
}
