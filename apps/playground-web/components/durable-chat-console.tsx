'use client';

import type {
  CreateThreadResponseDto,
  MessageDto,
  RunStreamAssistantSnapshotDto,
  RunDto,
  RunStreamEventDto,
  RunTimelineResponseDto,
  RuntimePiMetaDto,
  ThreadMessagesResponseDto,
  ThreadRunsResponseDto,
  ThreadDto,
  ThreadsResponseDto
} from '@agent-infra/contracts';
import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ChatHeader } from './chat-shell/chat-header';
import { assistantMessageHasVisibleContent } from './chat-shell/helpers';
import { ChatMessageList } from './chat-shell/message-list';
import { ComposerDock } from './chat-shell/composer-dock';
import { DurableLogPane } from './chat-shell/durable-log-pane';
import { ChatSidebar } from './chat-shell/sidebar';
import type { LiveAssistantDraft } from './chat-shell/types';
import { ui } from './chat-shell/ui';

const SELECTED_RUN_STORAGE_KEY_PREFIX = 'agent-infra.chat-console.selected-run-id';
const RECENT_RUNS_LIMIT = 8;

function normalizeRuntimeMeta(data: Partial<RuntimePiMetaDto>): RuntimePiMetaDto {
  const modelOptions = Array.isArray(data.modelOptions) ? data.modelOptions : [];

  return {
    dbMode: data.dbMode ?? 'unknown',
    dbConnection: data.dbConnection ?? 'unknown',
    runtimeConfigured: data.runtimeConfigured ?? false,
    runtimeProvider: data.runtimeProvider ?? modelOptions[0]?.provider ?? 'unknown',
    runtimeModel: data.runtimeModel ?? modelOptions[0]?.model ?? 'unknown',
    defaultModelKey: data.defaultModelKey ?? modelOptions[0]?.key ?? null,
    modelOptions,
    runtimeConfigError: data.runtimeConfigError ?? null
  };
}

function deriveLatestRunId(messages: MessageDto[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const runId = messages[index]?.runId;
    if (runId) {
      return runId;
    }
  }

  return null;
}

function chooseInitialRunId(messages: MessageDto[], runs: RunDto[], preferredRunId: string | null) {
  if (preferredRunId && runs.some((run) => run.id === preferredRunId)) {
    return preferredRunId;
  }

  return runs[0]?.id ?? deriveLatestRunId(messages);
}

function getSelectedRunStorageKey(threadId: string) {
  return `${SELECTED_RUN_STORAGE_KEY_PREFIX}:${threadId}`;
}

function readPersistedRunId(threadId: string | null | undefined) {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!threadId) {
    return null;
  }

  try {
    return window.localStorage.getItem(getSelectedRunStorageKey(threadId));
  } catch {
    return null;
  }
}

function persistSelectedRunId(threadId: string | null | undefined, runId: string | null) {
  if (typeof window === 'undefined') {
    return;
  }

  if (!threadId) {
    return;
  }

  const storageKey = getSelectedRunStorageKey(threadId);

  try {
    if (runId) {
      window.localStorage.setItem(storageKey, runId);
    } else {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // Storage may be unavailable in privacy-restricted contexts.
  }
}

function readThreadIdFromPathname(pathname: string) {
  const match = pathname.match(/^\/chat\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function compareRunsByCreatedAt(left: RunDto, right: RunDto) {
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

function upsertMessage(messages: MessageDto[], nextMessage: MessageDto) {
  const existingIndex = messages.findIndex((message) => message.id === nextMessage.id);
  if (existingIndex === -1) {
    return [...messages, nextMessage].sort((left, right) => left.seq - right.seq);
  }

  const nextMessages = [...messages];
  nextMessages[existingIndex] = nextMessage;
  return nextMessages;
}

function buildAssistantMessageFromSnapshot(
  currentMessages: MessageDto[],
  threadId: string,
  runId: string,
  assistant: RunStreamAssistantSnapshotDto
): MessageDto {
  const textParts = [
    assistant.partialReasoning
      ? {
          id: `${assistant.messageId}:reasoning`,
          messageId: assistant.messageId,
          partIndex: 0,
          type: 'reasoning' as const,
          textValue: assistant.partialReasoning,
          jsonValue: null,
          createdAt: new Date().toISOString()
        }
      : null,
    assistant.partialText
      ? {
          id: `${assistant.messageId}:text`,
          messageId: assistant.messageId,
          partIndex: assistant.partialReasoning ? 1 : 0,
          type: 'text' as const,
          textValue: assistant.partialText,
          jsonValue: null,
          createdAt: new Date().toISOString()
        }
      : null
  ].filter((part): part is NonNullable<typeof part> => part !== null);

  return {
    id: assistant.messageId,
    threadId,
    runId,
    role: 'assistant',
    seq: (currentMessages[currentMessages.length - 1]?.seq ?? 0) + 1,
    status: 'completed',
    metadata: null,
    createdAt: new Date().toISOString(),
    parts: textParts
  };
}

function upsertRun(runs: RunDto[], nextRun: RunDto) {
  const existingIndex = runs.findIndex((run) => run.id === nextRun.id);
  if (existingIndex === -1) {
    return [...runs, nextRun].sort(compareRunsByCreatedAt).slice(0, RECENT_RUNS_LIMIT);
  }

  const nextRuns = [...runs];
  nextRuns[existingIndex] = nextRun;
  return nextRuns.sort(compareRunsByCreatedAt).slice(0, RECENT_RUNS_LIMIT);
}

function includeSelectedRun(runs: RunDto[], selectedRun: RunDto | null) {
  if (!selectedRun) {
    return runs;
  }

  const existing = runs.some((run) => run.id === selectedRun.id);
  if (existing) {
    return runs;
  }

  return [...runs, selectedRun].sort(compareRunsByCreatedAt);
}

function applyRunStateToTimeline(current: RunTimelineResponseDto | null, event: Exclude<RunStreamEventDto, { type: 'run.assistant' }>): RunTimelineResponseDto {
  switch (event.type) {
    case 'run.ready':
      return {
        run: event.run,
        runEvents: [],
        toolInvocations: []
      };
    case 'run.state':
      return {
        run: event.run,
        runEvents: current?.runEvents ?? [],
        toolInvocations: current?.toolInvocations ?? []
      };
    case 'run.completed':
      return {
        run: event.run,
        runEvents: current?.runEvents ?? [],
        toolInvocations: current?.toolInvocations ?? []
      };
    case 'run.failed':
      return {
        run: event.run,
        runEvents: current?.runEvents ?? [],
        toolInvocations: current?.toolInvocations ?? []
      };
    default:
      return current ?? {
        run: null,
        runEvents: [],
        toolInvocations: []
      };
  }
}

function parseSseChunk(buffer: string) {
  const frames = buffer.split('\n\n');
  const remainder = frames.pop() ?? '';
  const events: RunStreamEventDto[] = [];

  for (const frame of frames) {
    const lines = frame.split('\n');
    let eventName = '';
    let data = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
        continue;
      }

      if (line.startsWith('data:')) {
        data += line.slice(5).trim();
      }
    }

    if (!eventName || !data) {
      continue;
    }

    try {
      const parsed = JSON.parse(data) as RunStreamEventDto;
      if (parsed.type === eventName) {
        events.push(parsed);
      }
    } catch {
      continue;
    }
  }

  return {
    events,
    remainder
  };
}

type DurableChatConsoleProps = {
  initialThreadId?: string | null;
};

type ChatPhase = 'idle' | 'thinking' | 'streaming' | 'transcript-final' | 'failed';

export function DurableChatConsole({ initialThreadId = null }: DurableChatConsoleProps) {
  const [threads, setThreads] = useState<ThreadDto[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [draft, setDraft] = useState('');
  const [optimisticUserMessage, setOptimisticUserMessage] = useState<MessageDto | null>(null);
  const [meta, setMeta] = useState<RuntimePiMetaDto | null>(null);
  const [selectedModelKey, setSelectedModelKey] = useState('');
  const [chatPhase, setChatPhase] = useState<ChatPhase>('idle');
  const [persistingTurn, setPersistingTurn] = useState(false);
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
  const isChatResponding = isSending || isStreamingText;
  const sendDisabled = !draft.trim() || isChatResponding || !meta?.runtimeConfigured || !selectedModelOption;
  const inputLocked = isChatResponding;
  const composerLoadingLabel = isSending ? 'waiting for response' : isStreamingText ? 'streaming response' : null;
  const displayedMessages = useMemo(
    () => (optimisticUserMessage ? upsertMessage(messages, optimisticUserMessage) : messages),
    [messages, optimisticUserMessage]
  );

  async function readJsonOrEmpty<T>(response: Response): Promise<Partial<T>> {
    const text = await response.text();
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text) as Partial<T>;
    } catch {
      return {};
    }
  }

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
  }, [selectedRunId]);

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

  function updateHistoryPath(pathname: string, options?: { replace?: boolean }) {
    if (typeof window === 'undefined') {
      return;
    }

    const method = options?.replace ? 'replaceState' : 'pushState';
    window.history[method](window.history.state, '', pathname);
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

  async function navigateToThread(threadId: string, options?: { replace?: boolean; preferredRunId?: string | null }) {
    updateHistoryPath(`/chat/${threadId}`, options);
    await activateThread(threadId, options);
  }

  async function navigateToNewChat(options?: { replace?: boolean }) {
    updateHistoryPath('/new', options);
    resetDraftThreadState();
    setDurableRecoveryNotice(null);
    setError(null);
    await refreshThreads();
  }

  async function refreshThreads() {
    const response = await fetch('/api/threads');
    const data = (await readJsonOrEmpty<ThreadsResponseDto>(response)) as ThreadsResponseDto;
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
      const response = await fetch(`/api/runs/${runId}/timeline`, {
        signal: controller.signal
      });
      const data = (await response.json()) as RunTimelineResponseDto;
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
      const response = await fetch(`/api/runs/${runId}/timeline`, {
        signal
      });
      const data = (await response.json()) as RunTimelineResponseDto;
      if (!response.ok || !data.run || data.run.threadId !== threadId) {
        return null;
      }

      return data.run;
    } catch {
      return null;
    }
  }

  async function refreshMeta() {
    const response = await fetch('/api/meta');
    const data = normalizeRuntimeMeta((await readJsonOrEmpty<RuntimePiMetaDto>(response)) as Partial<RuntimePiMetaDto>);
    setMeta(data);
    if (!response.ok) {
      setError(data.runtimeConfigError ?? `Failed to load runtime metadata (${response.status})`);
      return;
    }

    setSelectedModelKey((current) => {
      if (current && data.modelOptions.some((option) => option.key === current)) {
        return current;
      }

      return data.defaultModelKey ?? data.modelOptions[0]?.key ?? '';
    });
  }

  async function hydrateTranscript(threadId: string, signal: AbortSignal) {
    const response = await fetch(`/api/threads/${threadId}/messages`, {
      signal
    });
    const data = (await response.json()) as ThreadMessagesResponseDto;
    if (!response.ok) {
      throw new Error(data.error ?? `Failed to load messages (${response.status})`);
    }

    return data.messages ?? [];
  }

  async function hydrateRecentRuns(threadId: string, signal: AbortSignal) {
    const response = await fetch(`/api/threads/${threadId}/runs?limit=${RECENT_RUNS_LIMIT}`, {
      signal
    });
    const data = (await readJsonOrEmpty<ThreadRunsResponseDto>(response)) as ThreadRunsResponseDto;
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
        const messagesResponse = await fetch(`/api/threads/${threadId}/messages`, { signal: reconcileController.signal });

        if (isReconcileThreadStale()) {
          return;
        }

        const messagesData = (await readJsonOrEmpty<ThreadMessagesResponseDto>(messagesResponse)) as ThreadMessagesResponseDto;
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
        const runsResponse = await fetch(`/api/threads/${threadId}/runs?limit=${RECENT_RUNS_LIMIT}`, { signal: reconcileController.signal });
        const runsData = (await readJsonOrEmpty<ThreadRunsResponseDto>(runsResponse)) as ThreadRunsResponseDto;
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
          const timelineResponse = await fetch(`/api/runs/${nextSelectedRunId}/timeline`);
          const timelineData = (await readJsonOrEmpty<RunTimelineResponseDto>(timelineResponse)) as RunTimelineResponseDto;
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
      if (requestId === sendRequestIdRef.current && activeThreadIdRef.current === threadId) {
        setPersistingTurn(false);
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
    const response = await fetch('/api/threads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = (await response.json()) as CreateThreadResponseDto;
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
      } else if (event.assistant.partialText) {
        setChatPhase('streaming');
        setLiveAssistantDraft({
          runId: event.runId,
          messageId: event.assistant.messageId,
          partialText: event.assistant.partialText,
          partialReasoning: event.assistant.partialReasoning,
          eventType: event.assistant.eventType
        });
        return;
      } else {
        setChatPhase('thinking');
      }

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
        updateHistoryPath(`/chat/${threadId}`, { replace: true });
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

      const response = await fetch(`/api/threads/${threadId}/runs/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          provider: selectedModelOption.provider,
          model: selectedModelOption.model
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `request failed (${response.status})`);
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
  }, [logOpen]);

  useEffect(() => {
    const handlePopState = () => {
      const pathname = window.location.pathname;
      const threadId = readThreadIdFromPathname(window.location.pathname);
      void (async () => {
        try {
          stopViewingLiveResponse();

          if (threadId) {
            await activateThread(threadId, {
              preferredRunId: readPersistedRunId(threadId)
            });
            return;
          }

          if (pathname === '/new') {
            resetDraftThreadState();
            setDurableRecoveryNotice(null);
            setError(null);
            await refreshThreads();
          }
        } catch (navigationError) {
          setError(navigationError instanceof Error ? navigationError.message : 'Failed to load thread');
        }
      })();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      stopViewingLiveResponse();
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(
    () => () => {
      sendAbortControllerRef.current?.abort();
      messagesAbortControllerRef.current?.abort();
      logInspectorAbortControllerRef.current?.abort();
      timelineAbortControllerRef.current?.abort();
    },
    []
  );

  return (
    <main className={clsx('flex h-full min-h-0 overflow-hidden', ui.shell)}>
      <ChatSidebar
        sidebarOpen={sidebarOpen}
        threads={threads}
        activeThreadId={activeThreadId}
        onClose={() => setSidebarOpen(false)}
        onNewChat={() => {
          stopViewingLiveResponse();
          if (window.innerWidth < 1024) {
            setSidebarOpen(false);
          }
          void navigateToNewChat();
        }}
        onOpenThread={(threadId) => {
          stopViewingLiveResponse();
          if (window.innerWidth < 1024) {
            setSidebarOpen(false);
          }
          void navigateToThread(threadId);
        }}
      />

      <div className="flex flex-1 min-h-0 min-w-0 relative overflow-hidden">
        <div className={clsx('flex flex-1 min-h-0 min-w-0 relative flex-col overflow-hidden', ui.chatPane)}>
          <ChatHeader
            currentThreadTitle={currentThreadTitle}
            sidebarOpen={sidebarOpen}
            onOpenSidebar={() => setSidebarOpen(true)}
            onToggleLog={() => setLogOpen((current) => !current)}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              ref={messagesViewportRef}
              className={clsx('relative flex min-h-0 flex-1 flex-col overflow-y-auto', ui.messageViewport)}
            >
              <ChatMessageList
                meta={meta}
                error={error}
                durableRecoveryNotice={durableRecoveryNotice}
                loadingMessages={loadingMessages}
                activeThreadId={activeThreadId}
                messages={displayedMessages}
                liveAssistantDraft={liveAssistantDraft}
              />
            </div>
            <ComposerDock
              activeThreadId={activeThreadId}
              draft={draft}
              isResponding={isChatResponding}
              sendDisabled={sendDisabled}
              inputLocked={inputLocked}
              selectedModelKey={selectedModelKey}
              selectedModelOption={selectedModelOption}
              meta={meta}
              showScrollToBottom={showScrollToBottom}
              loadingLabel={composerLoadingLabel}
              textareaRef={textareaRef}
              sendAbortControllerRef={sendAbortControllerRef}
              onDraftChange={setDraft}
              onSelectedModelKeyChange={setSelectedModelKey}
              onSend={() => {
                void sendMessage();
              }}
              onStop={stopViewingLiveResponse}
              onScrollToBottom={scrollToMessagesBottom}
            />
          </div>
        </div>

        <DurableLogPane
          logOpen={logOpen}
          meta={meta}
          recentRuns={recentRuns}
          recentRunsLoading={recentRunsLoading}
          recentRunsError={recentRunsError}
          activeThreadId={activeThreadId}
          selectedRunId={selectedRunId}
          selectedRun={selectedRun}
          runEvents={runEvents}
          toolInvocations={toolInvocations}
          liveStreamRunId={liveStreamRunId}
          persistingTurn={persistingTurn}
          timelineLoading={timelineLoading}
          timelineError={timelineError}
          onSelectRun={(runId) => {
            void loadRunTimeline(runId);
          }}
        />
      </div>
    </main>
  );
}
