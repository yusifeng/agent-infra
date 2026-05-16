'use client';

import type { LoadThreadMessagesResult } from '@agent-infra/durable-chat-client';
import { installChatRenderDiagnostics } from '@agent-infra/durable-chat-client';
import type {
  MessageDto,
  RunAttachStreamEventDto,
  RuntimePiMetaDto,
  ThreadDto
} from '@agent-infra/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { assistantMessageHasVisibleContent, copyTextToClipboard } from '@/components/chat-shell/helpers';
import {
  archiveThread,
  createThreadSnapshotShare,
  fetchCurrentThreadShare,
  fetchPlaygroundThreads,
  fetchPlaygroundThread,
  fetchThreadMessagesResponse,
  openThreadRunAttachStream,
  pinThread,
  renameThread,
  revokeThreadSnapshotShare,
  unpinThread,
  type PlaygroundThreadDto
} from '@/features/durable-chat/repo/chat-api';
import { persistSelectedRunId, readPersistedRunId } from '@/features/durable-chat/repo/run-selection-storage';
import { normalizePlaygroundStreamEvent, parsePlaygroundSseChunk } from '@/features/durable-chat/schema/playground-stream';
import {
  runCreateThreadRecord,
  runInitializeRuntime,
  runRefreshMeta,
  runResetDraftThreadState,
  runStopViewingLiveResponse
} from '@/features/durable-chat/runtime/chat-session-flow';
import { applyAttachRunEvent } from '@/features/durable-chat/runtime/attach-run-flow';
import {
  applyHydratedTranscriptState,
  runActivateThread,
  runLoadOlderMessages,
  runLoadThreadMessages
} from '@/features/durable-chat/runtime/load-thread-flow';
import {
  runLoadLogInspectorFlow,
  runLoadRunTimeline,
  runResetLogInspectorState
} from '@/features/durable-chat/runtime/load-log-inspector-flow';
import { runSendMessageFlow } from '@/features/durable-chat/runtime/send-message-flow';
import { runReconcileCompletedTurn } from '@/features/durable-chat/runtime/reconcile-completed-turn';
import { useChatSessionController } from '@/features/durable-chat/runtime/use-chat-session-controller';
import { useRunInspectorController } from '@/features/durable-chat/runtime/use-run-inspector-controller';
import {
  deriveMainChatResponseStatus,
  INITIAL_MESSAGE_PAGE_LIMIT,
  parseRunAttachSseChunk,
  shouldShowMainChatLoading
} from '@/features/durable-chat/service/chat-runtime';
import { buildAnswerContainers } from '@/features/durable-chat/service/build-answer-containers';
import { buildDeepseekModePresentation } from '@/features/durable-chat/service/deepseek-mode-presentation';
import { collectCompletedLiveSearchToolCallIds } from '@/features/durable-chat/service/research-activity';
import { buildTranscriptPresentation } from '@/features/durable-chat/service/transcript-presentation';
import { useSearchPanelState } from '@/features/durable-chat/runtime/use-search-panel-state';
import { useChatViewportController } from '@/features/durable-chat/runtime/use-chat-viewport-controller';
import { useThreadTitleRefreshController } from '@/features/durable-chat/runtime/use-thread-title-refresh-controller';
import type { DurableChatRuntimeOptions } from '@/features/durable-chat/types/runtime';
import { isDefaultThreadTitle } from '@/features/thread-title/default-thread-title';

const PENDING_NEW_THREAD_LOADING_ID = '__pending-new-thread__';
const DEFAULT_DOCUMENT_TITLE = 'playground-next-web';

export function useDurableChatRuntime({ initialThreadId = null }: DurableChatRuntimeOptions) {
  const router = useRouter();
  const {
    state: {
      threads,
      activeThreadId,
      messages,
      draft,
      optimisticUserMessage,
      meta,
      selectedModelKey,
      selectedWebSearchEnabled,
      selectedThinkingEnabled,
      selectedReasoningEffort,
      chatPhase,
      persistingTurn,
      loadingThreadId,
      loadingMessages,
      historyLoading,
      error,
      liveStreamRunId,
      liveAssistantDraft,
      messagePageInfo,
      activeResponseRun,
      durableRecoveryState,
      sidebarOpen,
      showScrollToBottom
    },
    setThreads,
    setActiveThreadId,
    setMessages,
    setDraft,
    setOptimisticUserMessage,
    setMeta,
    setSelectedModelKey,
    setSelectedWebSearchEnabled,
    setSelectedThinkingEnabled,
    setSelectedReasoningEffort,
    setChatPhase,
    setPersistingTurn,
    setLoadingThreadId,
    setLoadingMessages,
    setHistoryLoading,
    setError,
    setLiveStreamRunId,
    setLiveAssistantDraft,
    setMessagePageInfo,
    setActiveResponseRun,
    setDurableRecoveryState,
    setSidebarOpen,
    setShowScrollToBottom
  } = useChatSessionController();
  const {
    state: {
      logOpen,
      selectedRunId,
      recentRuns,
      recentRunsLoading,
      recentRunsError,
      timeline,
      timelineLoading,
      timelineError
    },
    setLogOpen,
    setSelectedRunId,
    setRecentRuns,
    setRecentRunsLoading,
    setRecentRunsError,
    setTimeline,
    setTimelineLoading,
    setTimelineError
  } = useRunInspectorController();
  const runtimeBootstrappedRef = useRef(false);
  const routeChangeRequestIdRef = useRef(0);
  const runSelectionPersistenceReadyRef = useRef(false);
  const activeThreadIdRef = useRef<string | null>(null);
  const threadsRef = useRef<ThreadDto[]>([]);
  const logOpenRef = useRef(false);
  const messagePageInfoRef = useRef<typeof messagePageInfo>(null);
  const messagesRef = useRef<MessageDto[]>([]);
  const selectedRunIdRef = useRef<string | null>(null);
  const messagesRequestIdRef = useRef(0);
  const messagesAbortControllerRef = useRef<AbortController | null>(null);
  const logInspectorRequestIdRef = useRef(0);
  const logInspectorAbortControllerRef = useRef<AbortController | null>(null);
  const timelineRequestIdRef = useRef(0);
  const timelineAbortControllerRef = useRef<AbortController | null>(null);
  const currentShareRequestIdRef = useRef(0);
  const attachRequestIdRef = useRef(0);
  const attachAbortControllerRef = useRef<AbortController | null>(null);
  const attachRunIdRef = useRef<string | null>(null);
  const attachVersionRef = useRef(0);
  const sendRequestIdRef = useRef(0);
  const sendAbortControllerRef = useRef<AbortController | null>(null);
  const reconcileRequestIdRef = useRef(0);
  const previousDocumentTitleRef = useRef<string | null>(null);
  const [threadActionBusy, setThreadActionBusy] = useState(false);
  const [renameDialogThreadId, setRenameDialogThreadId] = useState<string | null>(null);
  const [renameDraftTitle, setRenameDraftTitle] = useState('');
  const [archiveDialogThreadId, setArchiveDialogThreadId] = useState<string | null>(null);
  const [threadActionError, setThreadActionError] = useState<string | null>(null);
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [archivingThreadId, setArchivingThreadId] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [loadingCurrentShare, setLoadingCurrentShare] = useState(false);
  const [creatingShare, setCreatingShare] = useState(false);
  const [revokingShare, setRevokingShare] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareThreadId, setShareThreadId] = useState<string | null>(null);
  const [sharePublicId, setSharePublicId] = useState<string | null>(null);

  const activeThread = useMemo(
    () => (threads.find((thread) => thread.id === activeThreadId) as PlaygroundThreadDto | undefined) ?? null,
    [threads, activeThreadId]
  );
  const selectedModelOption = useMemo(
    () => meta?.modelOptions.find((option) => option.key === selectedModelKey) ?? meta?.modelOptions[0] ?? null,
    [meta, selectedModelKey]
  );
  const deepseekModePresentation = useMemo(
    () =>
      buildDeepseekModePresentation({
        modelOptions: meta?.modelOptions ?? [],
        selectedModelKey
      }),
    [meta?.modelOptions, selectedModelKey]
  );
  const selectedRun = timeline?.run ?? null;
  const runEvents = timeline?.runEvents ?? [];
  const toolInvocations = timeline?.toolInvocations ?? [];
  const currentThreadTitle = activeThread?.title?.trim() || activeThreadId || null;
  const currentThreadPinned = activeThread?.pinned === true;
  const responseStatus = deriveMainChatResponseStatus({
    activeResponseRun,
    activeThreadId,
    loadingThreadId,
    chatPhase,
    persistingTurn,
    pendingNewThreadLoadingId: PENDING_NEW_THREAD_LOADING_ID
  });
  const isChatResponding = shouldShowMainChatLoading(responseStatus);
  const showResponseLoading = shouldShowMainChatLoading(responseStatus);
  const liveAssistantActionsAvailable = liveAssistantDraft !== null && persistingTurn && !isChatResponding;
  const sendDisabled = !draft.trim() || isChatResponding || !meta?.runtimeConfigured || !selectedModelOption;
  const inputLocked = isChatResponding;
  const { displayedMessages, displayedTranscriptBlocks } = useMemo(
    () =>
      buildTranscriptPresentation({
        messages,
        optimisticUserMessage,
        liveAssistantDraft
      }),
    [liveAssistantDraft, messages, optimisticUserMessage]
  );
  const displayedAnswerContainers = useMemo(
    () => buildAnswerContainers(displayedTranscriptBlocks),
    [displayedTranscriptBlocks]
  );
  const hasOlderMessages = messagePageInfo?.hasOlder === true;
  const {
    applyThreadTitleUpdate,
    currentVisibleThreadTitle,
    refreshThreadAfterCompletedRun,
    stopTypingTitleAnimation,
    visibleThreads
  } = useThreadTitleRefreshController({
    activeThreadId,
    currentThreadTitle: currentThreadTitle ?? '',
    displayedThreads: threads,
    fetchThreadById: async (threadId, signal) => fetchPlaygroundThread(threadId, signal).catch(() => null),
    isDefaultTitle: isDefaultThreadTitle,
    setThreads
  });
  const threadActionsDisabled =
    !activeThreadId ||
    isChatResponding ||
    threadActionBusy ||
    renamingThreadId !== null ||
    archivingThreadId !== null;
  const {
    activeSearchResult,
    getCachedSearchResult,
    prefetchSearchResult,
    searchPanelError,
    searchPanelLoading,
    searchPanelOpen,
    onCloseSearchPanel,
    onOpenSearchResult
  } = useSearchPanelState(activeThreadId);
  const {
    messagesViewportRef,
    pendingPrependAnchorRef,
    scrollToMessagesBottom,
    shouldAutoScrollRef,
    textareaRef
  } = useChatViewportController({
    activeThreadId,
    draft,
    historyLoading,
    liveAssistantDraft,
    loadingMessages,
    messages,
    setShowScrollToBottom
  });

  useEffect(() => {
    installChatRenderDiagnostics();
  }, []);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    previousDocumentTitleRef.current = document.title;

    return () => {
      document.title = previousDocumentTitleRef.current || DEFAULT_DOCUMENT_TITLE;
      previousDocumentTitleRef.current = null;
    };
  }, []);

  useEffect(() => {
    document.title = currentVisibleThreadTitle || DEFAULT_DOCUMENT_TITLE;
  }, [currentVisibleThreadTitle]);

  useEffect(() => {
    logOpenRef.current = logOpen;
  }, [logOpen]);

  useEffect(() => {
    messagePageInfoRef.current = messagePageInfo;
  }, [messagePageInfo]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const runId = liveAssistantDraft?.runId;
    if (!runId) {
      return;
    }

    const completedSearchToolCallIdGroups = liveAssistantDraft.segments
      .map((segment) => collectCompletedLiveSearchToolCallIds(segment.tools))
      .filter((toolCallIds) => toolCallIds.length > 0);
    if (completedSearchToolCallIdGroups.length === 0) {
      return;
    }

    void Promise.all(
      completedSearchToolCallIdGroups.map((toolCallIds) => prefetchSearchResult(runId, toolCallIds).catch(() => null))
    );
  }, [liveAssistantDraft, prefetchSearchResult]);

  useEffect(() => {
    selectedRunIdRef.current = selectedRunId;
  }, [selectedRunId]);

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
    if (typeof window === 'undefined') {
      return;
    }

    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, []);

  function resetDraftThreadState() {
    runResetDraftThreadState({
      refs: {
        logInspectorAbortControllerRef,
        logInspectorRequestIdRef,
        messagesAbortControllerRef,
        messagesRequestIdRef,
        sendAbortControllerRef,
        sendRequestIdRef,
        shouldAutoScrollRef,
        timelineAbortControllerRef,
        timelineRequestIdRef
      },
      actions: {
        setActiveThreadId,
        setActiveResponseRun,
        setChatPhase,
        setDraft,
        setHistoryLoading,
        setLiveAssistantDraft,
        setLiveStreamRunId,
        setLoadingMessages,
        setLoadingThreadId,
        setMessages,
        setMessagePageInfo,
        setOptimisticUserMessage,
        setPersistingTurn,
        setRecentRuns,
        setRecentRunsError,
        setRecentRunsLoading,
        setSelectedRunId,
        setTimeline,
        setTimelineError,
        setTimelineLoading
      }
    });
  }

  function resetLogInspectorState(options?: { clearSelectedRun?: boolean }) {
    runResetLogInspectorState({
      options,
      refs: {
        logInspectorAbortControllerRef,
        logInspectorRequestIdRef,
        timelineAbortControllerRef,
        timelineRequestIdRef
      },
      actions: {
        setRecentRuns,
        setRecentRunsError,
        setRecentRunsLoading,
        setSelectedRunId,
        setTimeline,
        setTimelineError,
        setTimelineLoading
      }
    });
  }

  function stopViewingLiveResponse() {
    attachAbortControllerRef.current?.abort();
    attachAbortControllerRef.current = null;
    attachRunIdRef.current = null;
    runStopViewingLiveResponse({
      refs: {
        sendAbortControllerRef
      },
      actions: {
        setActiveResponseRun,
        setChatPhase,
        setLiveStreamRunId,
        setLoadingThreadId,
        setPersistingTurn
      }
    });
  }

  function isCurrentAttachRequest(requestId: number, threadId: string, runId: string) {
    return (
      requestId === attachRequestIdRef.current &&
      activeThreadIdRef.current === threadId &&
      attachRunIdRef.current === runId
    );
  }

  function applyAttachEvent(event: RunAttachStreamEventDto, threadId: string, requestId: number) {
    return applyAttachRunEvent({
      event,
      requestId,
      threadId,
      refs: {
        activeThreadIdRef,
        attachRequestIdRef,
        attachRunIdRef,
        attachVersionRef,
        logOpenRef
      },
      actions: {
        setActiveResponseRun,
        setChatPhase,
        setError,
        setLiveAssistantDraft,
        setLiveStreamRunId,
        setLoadingThreadId,
        setPersistingTurn,
        setRecentRuns
      },
      operations: {
        loadThreadMessages,
        reconcileCompletedTurn
      }
    });
  }

  async function attachToActiveRun(threadId: string, runId: string) {
    const requestId = sendRequestIdRef.current + 1;
    sendRequestIdRef.current = requestId;
    attachRequestIdRef.current = requestId;
    attachAbortControllerRef.current?.abort();
    const controller = new AbortController();
    attachAbortControllerRef.current = controller;
    attachRunIdRef.current = runId;
    attachVersionRef.current = 0;
    setError(null);
    setLiveStreamRunId(runId);
    setLoadingThreadId(threadId);
    setChatPhase('thinking');

    try {
      const streamResult = await openThreadRunAttachStream(threadId, runId, controller.signal);
      if (!isCurrentAttachRequest(requestId, threadId, runId)) {
        return;
      }

      if (!streamResult.ok) {
        throw new Error(streamResult.error ?? `request failed (${streamResult.status})`);
      }

      if (!streamResult.body) {
        throw new Error('attach stream response body is unavailable');
      }

      const reader = streamResult.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        if (controller.signal.aborted || !isCurrentAttachRequest(requestId, threadId, runId)) {
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const parsed = parseRunAttachSseChunk(buffer);
        buffer = parsed.remainder;

        for (const event of parsed.events) {
          const terminal = applyAttachEvent(event, threadId, requestId);
          if (terminal) {
            return;
          }
        }
      }

      const finalBuffer = `${buffer}${decoder.decode()}`;
      if (finalBuffer.trim()) {
        const parsed = parseRunAttachSseChunk(finalBuffer.endsWith('\n\n') ? finalBuffer : `${finalBuffer}\n\n`);
        for (const event of parsed.events) {
          const terminal = applyAttachEvent(event, threadId, requestId);
          if (terminal) {
            return;
          }
        }
      }
    } catch (attachError) {
      if (controller.signal.aborted || !isCurrentAttachRequest(requestId, threadId, runId)) {
        return;
      }

      setError(attachError instanceof Error ? attachError.message : 'Failed to attach to run stream');
      void loadThreadMessages(threadId, {
        background: true,
        preferredRunId: runId,
        preserveExistingTimeline: logOpenRef.current,
        skipTimelineReload: logOpenRef.current
      });
    } finally {
      if (isCurrentAttachRequest(requestId, threadId, runId)) {
        attachAbortControllerRef.current = null;
        attachRunIdRef.current = null;
        setLiveStreamRunId(null);
      }
    }
  }

  async function activateThread(
    threadId: string,
    options?: {
      preferredRunId?: string | null;
      recoveryMode?: 'initial-thread';
      isCurrentRequest?: () => boolean;
    }
  ) {
    return runActivateThread({
      threadId,
      options,
      refs: {
        activeThreadIdRef,
        shouldAutoScrollRef
      },
      actions: {
        setActiveThreadId,
        setDurableRecoveryState
      },
      operations: {
        loadThreadMessages: (nextThreadId, nextOptions) =>
          loadThreadMessages(nextThreadId, {
            ...nextOptions,
            preserveExistingTimeline: nextOptions?.preserveExistingTimeline ?? logOpenRef.current,
            skipTimelineReload: nextOptions?.skipTimelineReload ?? logOpenRef.current
          })
      }
    });
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
    const result = await fetchPlaygroundThreads();
    if (!result.ok) {
      throw new Error(result.error ?? `Failed to load threads (${result.status})`);
    }

    setThreads(result.data.threads);
    return result.data.threads;
  }

  function buildShareUrl(publicId: string) {
    if (typeof window === 'undefined') {
      return `/share/${publicId}`;
    }

    return `${window.location.origin}/share/${publicId}`;
  }

  function updateThreadInList(thread: ThreadDto) {
    setThreads((current) =>
      current.map((candidate) =>
        candidate.id === thread.id
          ? {
              ...candidate,
              ...thread
            }
          : candidate
      )
    );
  }

  function applyThreadTitleUpdated(threadId: string, title: string, updatedAt: string) {
    applyThreadTitleUpdate({ threadId, title, updatedAt });
  }

  function openRenameDialogForThread(threadId: string) {
    if (!threadId || threadActionBusy || renamingThreadId !== null) {
      return;
    }

    const currentTitle = threads.find((thread) => thread.id === threadId)?.title ?? '';
    setRenameDialogThreadId(threadId);
    setRenameDraftTitle(currentTitle);
    setThreadActionError(null);
  }

  function closeRenameDialog() {
    setRenameDialogThreadId(null);
    setRenameDraftTitle('');
    setThreadActionError(null);
  }

  async function submitRenameThread() {
    const threadId = renameDialogThreadId;
    const normalizedTitle = renameDraftTitle.trim();
    if (!threadId) {
      return false;
    }

    if (!normalizedTitle) {
      setThreadActionError('请输入会话标题。');
      return false;
    }

    setRenamingThreadId(threadId);
    setThreadActionError(null);
    try {
      const result = await renameThread(threadId, normalizedTitle);
      if (!result.ok || !result.data.thread) {
        throw new Error(result.error ?? 'failed to rename thread');
      }

      updateThreadInList(result.data.thread);
      await refreshThreads();
      closeRenameDialog();
      return true;
    } catch (error) {
      setThreadActionError(error instanceof Error ? error.message : '重命名会话失败。');
      return false;
    } finally {
      setRenamingThreadId(null);
    }
  }

  function renameActiveThread() {
    const threadId = activeThreadIdRef.current;
    if (!threadId) {
      return;
    }

    openRenameDialogForThread(threadId);
  }

  async function toggleThreadPinById(threadId: string, pinned: boolean) {
    if (!threadId || threadActionBusy) {
      return;
    }

    setThreadActionBusy(true);
    setError(null);
    try {
      const result = pinned ? await unpinThread(threadId) : await pinThread(threadId);
      if (!result.ok || !result.data.thread) {
        throw new Error(result.error ?? 'failed to update thread pin');
      }

      updateThreadInList(result.data.thread);
      await refreshThreads();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'failed to update thread pin');
    } finally {
      setThreadActionBusy(false);
    }
  }

  async function toggleActiveThreadPin() {
    const threadId = activeThreadIdRef.current;
    if (!threadId) {
      return;
    }

    await toggleThreadPinById(threadId, currentThreadPinned);
  }

  function openArchiveDialogForThread(threadId: string) {
    if (!threadId || threadActionBusy || archivingThreadId !== null) {
      return;
    }

    setArchiveDialogThreadId(threadId);
    setThreadActionError(null);
  }

  function closeArchiveDialog() {
    setArchiveDialogThreadId(null);
    setThreadActionError(null);
  }

  async function submitArchiveThread() {
    const threadId = archiveDialogThreadId;
    if (!threadId) {
      return false;
    }

    setArchivingThreadId(threadId);
    setThreadActionError(null);
    try {
      const result = await archiveThread(threadId);
      if (!result.ok) {
        throw new Error(result.error ?? 'failed to archive thread');
      }

      await refreshThreads();
      closeArchiveDialog();
      if (threadId === activeThreadIdRef.current) {
        stopViewingLiveResponse();
        resetDraftThreadState();
        navigateToNewChat({ replace: true });
      }
      return true;
    } catch (error) {
      setThreadActionError(error instanceof Error ? error.message : '删除会话失败。');
      return false;
    } finally {
      setArchivingThreadId(null);
    }
  }

  function archiveActiveThread() {
    const threadId = activeThreadIdRef.current;
    if (!threadId) {
      return;
    }

    openArchiveDialogForThread(threadId);
  }

  async function openShareDialogForThread(threadId: string) {
    if (!threadId) {
      return;
    }

    const requestId = currentShareRequestIdRef.current + 1;
    currentShareRequestIdRef.current = requestId;
    setShareDialogOpen(true);
    setShareError(null);
    setShareCopied(false);
    setShareThreadId(threadId);
    setSharePublicId(null);
    setShareUrl(null);
    setLoadingCurrentShare(true);
    try {
      const result = await fetchCurrentThreadShare(threadId);
      if (requestId !== currentShareRequestIdRef.current) {
        return;
      }
      if (!result.ok) {
        throw new Error(result.error ?? 'failed to load current share');
      }

      const publicId = result.data.share?.publicId ?? null;
      setSharePublicId(publicId);
      setShareUrl(publicId ? buildShareUrl(publicId) : null);
    } catch (error) {
      if (requestId !== currentShareRequestIdRef.current) {
        return;
      }
      setShareError(error instanceof Error ? error.message : 'failed to load current share');
    } finally {
      if (requestId === currentShareRequestIdRef.current) {
        setLoadingCurrentShare(false);
      }
    }
  }

  async function openShareDialog() {
    const threadId = activeThreadIdRef.current;
    if (!threadId) {
      return;
    }

    await openShareDialogForThread(threadId);
  }

  function closeShareDialog() {
    currentShareRequestIdRef.current += 1;
    setShareDialogOpen(false);
    setShareError(null);
    setShareCopied(false);
    setShareThreadId(null);
    setSharePublicId(null);
    setShareUrl(null);
  }

  async function createOrCopyShare() {
    const threadId = shareThreadId;
    if (!threadId || loadingCurrentShare || creatingShare) {
      return;
    }

    if (shareUrl) {
      await copyTextToClipboard(shareUrl);
      setShareCopied(true);
      return;
    }

    setCreatingShare(true);
    setShareError(null);
    try {
      const result = await createThreadSnapshotShare(threadId);
      if (!result.ok || !result.data.share?.publicId) {
        throw new Error(result.error ?? 'failed to create share');
      }

      const publicId = result.data.share.publicId;
      const url = buildShareUrl(publicId);
      setSharePublicId(publicId);
      setShareUrl(url);
      await copyTextToClipboard(url);
      setShareCopied(true);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : 'failed to create share');
    } finally {
      setCreatingShare(false);
    }
  }

  async function revokeShare() {
    if (!sharePublicId || !shareThreadId) {
      return;
    }

    setRevokingShare(true);
    setShareError(null);
    try {
      const result = await revokeThreadSnapshotShare(sharePublicId);
      if (!result.ok) {
        throw new Error(result.error ?? 'failed to revoke share');
      }

      setSharePublicId(null);
      setShareUrl(null);
      setShareCopied(false);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : 'failed to revoke share');
    } finally {
      setRevokingShare(false);
    }
  }

  async function loadLogInspector(
    threadId: string,
    messagesSnapshot: MessageDto[],
    options?: { preferredRunId?: string | null; preserveExistingTimeline?: boolean }
  ) {
    return runLoadLogInspectorFlow({
      threadId,
      messagesSnapshot,
      options,
      refs: {
        activeThreadIdRef,
        logInspectorAbortControllerRef,
        logInspectorRequestIdRef
      },
      actions: {
        setRecentRuns,
        setRecentRunsError,
        setRecentRunsLoading,
        setSelectedRunId,
        setTimeline,
        setTimelineError,
        setTimelineLoading
      },
      operations: {
        loadRunTimeline
      }
    });
  }

  async function loadRunTimeline(runId: string | null, options?: { preserveExisting?: boolean }) {
    return runLoadRunTimeline({
      runId,
      options,
      refs: {
        selectedRunIdRef,
        timelineAbortControllerRef,
        timelineRequestIdRef
      },
      actions: {
        setSelectedRunId,
        setTimeline,
        setTimelineError,
        setTimelineLoading
      }
    });
  }

  async function refreshMeta() {
    return runRefreshMeta({
      actions: {
        setError,
        setMeta,
        setSelectedModelKey
      }
    });
  }

  async function hydrateTranscript(threadId: string, signal: AbortSignal) {
    const result = await fetchThreadMessagesResponse(threadId, {
      limit: INITIAL_MESSAGE_PAGE_LIMIT,
      signal
    });
    if (!result.ok) {
      throw new Error(result.error ?? `Failed to load messages (${result.status})`);
    }

    return {
      messages: result.data.messages ?? [],
      pageInfo: result.data.pageInfo ?? null,
      activeResponseRun: result.data.activeRun ?? null
    };
  }

  async function loadThreadMessages(
    threadId: string,
    options?: {
      preferredRunId?: string | null;
      background?: boolean;
      skipTimelineReload?: boolean;
      preserveExistingTimeline?: boolean;
    }
  ): Promise<LoadThreadMessagesResult> {
    const result = await runLoadThreadMessages({
      threadId,
      options,
      refs: {
        activeThreadIdRef,
        logOpenRef,
        messagesAbortControllerRef,
        messagesRequestIdRef
      },
      actions: {
        setActiveResponseRun,
        setError,
        setHistoryLoading,
        setLiveAssistantDraft,
        setLoadingMessages,
        setMessagePageInfo,
        setOptimisticUserMessage,
        setRecentRunsError,
        setRecentRunsLoading
      },
      operations: {
        applyHydratedTranscript: ({ messages, pageInfo, activeResponseRun, selectedRunId, runs }) =>
          applyHydratedTranscriptState({
            messages,
            pageInfo,
            activeResponseRun,
            selectedRunId,
            runs,
            actions: {
              setActiveResponseRun,
              setChatPhase,
              setError,
              setLiveAssistantDraft,
              setMessages,
              setMessagePageInfo,
              setOptimisticUserMessage,
              setRecentRuns,
              setRecentRunsError,
              setSelectedRunId
            }
          }),
        hydrateTranscript,
        loadLogInspector,
        resetLogInspectorState
      }
    });

    return result ?? { ok: false, restoredRunId: null };
  }

  async function loadOlderMessages() {
    const threadId = activeThreadIdRef.current;
    const beforeCursor = messagePageInfoRef.current?.startCursor;
    if (!threadId || !beforeCursor || historyLoading) {
      return;
    }

    const viewport = messagesViewportRef.current;
    if (viewport) {
      pendingPrependAnchorRef.current = {
        scrollHeight: viewport.scrollHeight,
        scrollTop: viewport.scrollTop
      };
    }
    shouldAutoScrollRef.current = false;
    const didApply = await runLoadOlderMessages({
      threadId,
      beforeCursor,
      historyLoading,
      refs: {
        activeThreadIdRef
      },
      actions: {
        setActiveResponseRun,
        setError,
        setHistoryLoading,
        setMessages,
        setMessagePageInfo
      }
    });

    if (!didApply) {
      pendingPrependAnchorRef.current = null;
    }
  }

  async function reconcileCompletedTurn(
    threadId: string,
    preferredRunId: string | null,
    requestId: number
  ) {
    await runReconcileCompletedTurn({
      threadId,
      preferredRunId,
      requestId,
      state: {
        messages: messagesRef.current,
        pageInfo: messagePageInfoRef.current
      },
      refs: {
        activeThreadIdRef,
        logOpenRef,
        reconcileRequestIdRef,
        selectedRunIdRef,
        sendRequestIdRef
      },
      actions: {
        setActiveResponseRun,
        setChatPhase,
        setError,
        setLiveAssistantDraft,
        setLoadingThreadId,
        setMessages,
        setMessagePageInfo,
        setOptimisticUserMessage,
        setPersistingTurn,
        setRecentRuns,
        setRecentRunsError,
        setRecentRunsLoading,
        setSelectedRunId,
        setTimeline,
        setTimelineError,
        setTimelineLoading
      }
    });
    const currentThread = threadsRef.current.find((thread) => thread.id === threadId) ?? null;
    if (!currentThread || isDefaultThreadTitle(currentThread.title)) {
      try {
        await refreshThreadAfterCompletedRun(threadId);
      } catch {
        // Thread title refresh is a best-effort fallback after the durable turn reconciles.
      }
    } else {
      try {
        await refreshThreads();
      } catch {
        // Thread list refresh is best-effort after a completed durable turn.
      }
    }
  }

  async function createThreadRecord() {
    return runCreateThreadRecord({
      actions: {
        setThreads
      }
    });
  }

  async function sendMessage() {
    await runSendMessageFlow({
      state: {
        activeThreadId,
        draft,
        isChatResponding,
        messages,
        selectedWebSearchEnabled,
        selectedThinkingEnabled,
        selectedReasoningEffort,
        selectedModelOption
      },
      refs: {
        activeThreadIdRef,
        logOpenRef,
        selectedRunIdRef,
        sendAbortControllerRef,
        sendRequestIdRef,
        shouldAutoScrollRef,
        timelineAbortControllerRef,
        timelineRequestIdRef
      },
      actions: {
        setActiveThreadId,
        setActiveResponseRun,
        setChatPhase,
        setDraft,
        setError,
        setLiveAssistantDraft,
        setLiveStreamRunId,
        setLoadingThreadId,
        setMessages,
        setOptimisticUserMessage,
        setPersistingTurn,
        setRecentRuns,
        setSelectedRunId,
        setTimeline,
        setTimelineError,
        setTimelineLoading
      },
      operations: {
        createThreadRecord,
        pendingNewThreadLoadingId: PENDING_NEW_THREAD_LOADING_ID,
        reconcileCompletedTurn,
        replaceCurrentPath
      },
      stream: {
        parseChunk: parsePlaygroundSseChunk,
        onEvent: (event) => {
          const playgroundEvent = normalizePlaygroundStreamEvent(event);
          if (!playgroundEvent) {
            return;
          }

          applyThreadTitleUpdated(playgroundEvent.threadId, playgroundEvent.title, playgroundEvent.updatedAt);
        }
      }
    });
  }

  function startNewChat() {
    stopViewingLiveResponse();
    stopTypingTitleAnimation();
    resetDraftThreadState();
    setDurableRecoveryState({
      phase: 'idle',
      message: null
    });
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
    navigateToNewChat();
  }

  function openThread(threadId: string) {
    stopViewingLiveResponse();
    stopTypingTitleAnimation();
    setDurableRecoveryState({
      phase: 'idle',
      message: null
    });
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
    navigateToThread(threadId);
  }

  function openReplay() {
    const threadId = activeThreadIdRef.current;
    if (!threadId) {
      return;
    }

    router.push(`/replay/${threadId}`);
  }

  useEffect(() => {
    void refreshMeta();
  }, []);

  useEffect(() => {
    const run = activeResponseRun;
    const runIsActive = run?.status === 'queued' || run?.status === 'running';
    if (activeThreadId && run && run.threadId !== activeThreadId) {
      attachAbortControllerRef.current?.abort();
      attachAbortControllerRef.current = null;
      attachRunIdRef.current = null;
      return;
    }

    if (!activeThreadId || !run || !runIsActive) {
      attachAbortControllerRef.current?.abort();
      attachAbortControllerRef.current = null;
      attachRunIdRef.current = null;
      return;
    }

    if (sendAbortControllerRef.current || attachRunIdRef.current === run.id) {
      return;
    }

    void attachToActiveRun(activeThreadId, run.id);
  }, [activeThreadId, activeResponseRun?.id, activeResponseRun?.status]);

  useEffect(() => {
    const requestId = routeChangeRequestIdRef.current + 1;
    routeChangeRequestIdRef.current = requestId;

    if (!runtimeBootstrappedRef.current) {
      runtimeBootstrappedRef.current = true;
      void runInitializeRuntime({
        initialThreadId,
        refs: {
          runSelectionPersistenceReadyRef
        },
        actions: {
          setDurableRecoveryState,
          setError
        },
        operations: {
          activateThread,
          getPreferredRunId: readPersistedRunId,
          isCurrentRequest: () => routeChangeRequestIdRef.current === requestId,
          refreshThreads,
          resetDraftThreadState
        }
      });
      return;
    }

    if (
      initialThreadId &&
      activeThreadId === initialThreadId &&
      (loadingThreadId === initialThreadId || chatPhase !== 'idle' || optimisticUserMessage !== null || liveAssistantDraft !== null)
    ) {
      return;
    }

    if (initialThreadId) {
      void activateThread(initialThreadId, {
        preferredRunId: readPersistedRunId(initialThreadId)
      });
      return;
    }

    resetDraftThreadState();
    setDurableRecoveryState({
      phase: 'idle',
      message: null
    });
    setError(null);
  }, [initialThreadId]);

  useEffect(() => {
    if (!logOpen) {
      resetLogInspectorState();
      return;
    }

    if (!activeThreadId) {
      return;
    }

    if (loadingMessages) {
      return;
    }

    void loadLogInspector(activeThreadId, messages, {
      preferredRunId: readPersistedRunId(activeThreadId) ?? selectedRunIdRef.current,
      preserveExistingTimeline: true
    });
  }, [activeThreadId, loadingMessages, logOpen]);

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
    creatingShare,
    currentThreadTitle: currentVisibleThreadTitle,
    displayedAnswerContainers,
    displayedMessages,
    displayedTranscriptBlocks,
    draft,
    deepseekModePresentation,
    durableRecoveryState,
    error,
    hasOlderMessages,
    historyLoading,
    inputLocked,
    isChatResponding,
    liveAssistantDraft,
    liveAssistantActionsAvailable,
    liveStreamRunId,
    loadingMessages,
    loadingCurrentShare,
    messagesViewportRef,
    meta,
    onArchiveThread: () => {
      archiveActiveThread();
    },
    onCloseArchiveDialog: closeArchiveDialog,
    onCloseRenameDialog: closeRenameDialog,
    onCloseShareDialog: closeShareDialog,
    onCloseSidebar: () => setSidebarOpen(false),
    onCreateOrCopyShare: () => {
      void createOrCopyShare();
    },
    onDraftChange: setDraft,
    onNewChat: startNewChat,
    onOpenSidebar: () => setSidebarOpen(true),
    onOpenShareDialog: () => {
      void openShareDialog();
    },
    onOpenThread: openThread,
    onOpenThreadShareDialog: (threadId: string) => {
      void openShareDialogForThread(threadId);
    },
    onLoadOlderMessages: () => {
      void loadOlderMessages();
    },
    onScrollToBottom: scrollToMessagesBottom,
    onRenameThread: () => {
      renameActiveThread();
    },
    onRenameThreadById: (threadId: string) => {
      openRenameDialogForThread(threadId);
    },
    onRenameDraftTitleChange: setRenameDraftTitle,
    onConfirmRenameThread: () => {
      void submitRenameThread();
    },
    onConfirmArchiveThread: () => {
      void submitArchiveThread();
    },
    onRevokeShare: () => {
      void revokeShare();
    },
    onSelectedModelKeyChange: setSelectedModelKey,
    onSelectedWebSearchEnabledChange: setSelectedWebSearchEnabled,
    onSelectedThinkingEnabledChange: setSelectedThinkingEnabled,
    onOpenSearchResult,
    onCloseSearchPanel,
    onSend: () => {
      void sendMessage();
    },
    onStop: stopViewingLiveResponse,
    onToggleThreadPin: () => {
      void toggleActiveThreadPin();
    },
    onToggleThreadPinById: (threadId: string, pinned: boolean) => {
      void toggleThreadPinById(threadId, pinned);
    },
    onArchiveThreadById: (threadId: string) => {
      openArchiveDialogForThread(threadId);
    },
    revokingShare,
    responseStatus,
    archiveDialogThreadId,
    archivingThreadId,
    activeSearchResult,
    searchPanelError,
    searchPanelLoading,
    searchPanelOpen,
    getLiveSearchPanelData: getCachedSearchResult,
    selectedModelKey,
    selectedWebSearchEnabled,
    selectedThinkingEnabled,
    selectedModelOption,
    sendAbortControllerRef,
    sendDisabled,
    renameDialogThreadId,
    renameDraftTitle,
    renamingThreadId,
    shareCopied,
    shareDialogOpen,
    shareError,
    shareUrl,
    showResponseLoading,
    showScrollToBottom,
    sidebarOpen,
    textareaRef,
    threadActionError,
    threadActionsDisabled,
    threads: visibleThreads,
  };
}
