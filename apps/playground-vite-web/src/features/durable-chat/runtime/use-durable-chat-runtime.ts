import type { MessageDto } from '@agent-infra/contracts';
import {
  applyHydratedTranscriptState,
  runActivateThread,
  runInitializeRuntime,
  INITIAL_MESSAGE_PAGE_LIMIT,
  runLoadOlderMessages,
  runLoadThreadMessages,
  runReconcileCompletedTurn,
  runRefreshMeta,
  runResetDraftThreadState,
  runSendMessageFlow,
  runStopViewingLiveResponse
} from '@agent-infra/durable-chat-client';
import type { LoadThreadMessagesResult } from '@agent-infra/durable-chat-client';
import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { useSearchPanelState } from '@/features/durable-chat/runtime/use-search-panel-state';
import {
  createThread,
  fetchThread,
  fetchThreadMessages,
  fetchThreads
} from '@/features/durable-chat/repo/chat-api';
import { buildChatViewState } from '@/features/durable-chat/service/chat-view-state';
import { isDefaultThreadTitle } from '@/features/durable-chat/service/default-thread-title';
import { collectCompletedLiveSearchToolCallIds } from '@/features/durable-chat/service/research-activity';
import { parsePlaygroundSseChunk } from '@/features/durable-chat/schema/playground-stream';
import { useAttachStreamOrchestration } from '@/features/durable-chat/runtime/use-attach-stream-orchestration';
import { useChatSessionController } from '@/features/durable-chat/runtime/use-chat-session-controller';
import { useRunInspectorController } from '@/features/durable-chat/runtime/use-run-inspector-controller';
import type { DurableChatRuntimeOptions } from '@/features/durable-chat/types/runtime';
import { useLiveDraftOrchestration } from '@/features/durable-chat/runtime/use-live-draft-orchestration';
import { useChatRuntimeLifecycle } from '@/features/durable-chat/runtime/use-chat-runtime-lifecycle';
import { useShareDialogState } from '@/features/durable-chat/runtime/use-share-dialog-state';
import { useChatViewportController } from '@/features/durable-chat/runtime/use-chat-viewport-controller';
import { useThreadActionsController } from '@/features/durable-chat/runtime/use-thread-actions-controller';
import { useThreadTitleRefreshController } from '@/features/durable-chat/runtime/use-thread-title-refresh-controller';
import type { PlaygroundPrivateStreamEventDto } from '@/features/durable-chat/types/playground-stream';
import type { PlaygroundThreadDto } from '@/features/durable-chat/types/thread';

const PENDING_NEW_THREAD_LOADING_ID = '__pending-new-thread__';
const DEFAULT_DOCUMENT_TITLE = 'playground-vite-web';

export function useDurableChatRuntime({ initialThreadId = null }: DurableChatRuntimeOptions) {
  const navigate = useNavigate();
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
    state: { selectedRunId },
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
  const hydratedThreadIdsRef = useRef<Set<string>>(new Set());
  const activeThreadIdRef = useRef<string | null>(null);
  const threadsRef = useRef<PlaygroundThreadDto[]>([]);
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
  const sendRequestIdRef = useRef(0);
  const sendAbortControllerRef = useRef<AbortController | null>(null);
  const reconcileRequestIdRef = useRef(0);
  const previousDocumentTitleRef = useRef<string | null>(null);
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
  const shareDialog = useShareDialogState();
  const pinnedThreadIds = useMemo(
    () =>
      threads
        .filter((thread) => thread.pinned)
        .sort((left, right) => new Date(right.pinnedAt ?? 0).getTime() - new Date(left.pinnedAt ?? 0).getTime())
        .map((thread) => thread.id),
    [threads]
  );
  const {
    selectedModelOption,
    deepseekModePresentation,
    currentThreadTitle,
    responseStatus,
    isChatResponding,
    showResponseLoading,
    sendDisabled,
    inputLocked,
    displayedThreads,
    displayedMessages,
    displayedTranscriptBlocks,
    displayedAnswerContainers,
    hasOlderMessages
  } = useMemo(
    () =>
      buildChatViewState({
        threads,
        pinnedThreadIds,
        activeThreadId,
        messages,
        draft,
        optimisticUserMessage,
        meta,
        selectedModelKey,
    activeResponseRun,
    chatPhase,
        persistingTurn,
        loadingThreadId,
      messagePageInfo,
      liveAssistantDraft,
      pendingNewThreadLoadingId: PENDING_NEW_THREAD_LOADING_ID
      }),
    [
      threads,
      pinnedThreadIds,
      activeThreadId,
      messages,
      draft,
      optimisticUserMessage,
      meta,
      selectedModelKey,
      activeResponseRun,
      chatPhase,
      persistingTurn,
      loadingThreadId,
      messagePageInfo,
      liveAssistantDraft
    ]
  );
  const hasHydratedActiveThread = activeThreadId ? hydratedThreadIdsRef.current.has(activeThreadId) : false;
  const activeRunCanUseAttachStream =
    !!activeThreadId &&
    !!activeResponseRun &&
    activeResponseRun.threadId === activeThreadId &&
    (activeResponseRun.status === 'queued' || activeResponseRun.status === 'running') &&
    liveStreamRunId !== activeResponseRun.id;
  const liveDraftMessageId = liveAssistantDraft?.messageId ?? null;
  const {
    capturePrependAnchor,
    clearPrependAnchor,
    messagesViewportRef,
    restorePrependAnchor,
    scrollToMessagesBottom,
    shouldAutoScrollRef,
    textareaRef
  } = useChatViewportController({
    activeThreadId,
    draft,
    liveDraftMessageId,
    loadingMessages,
    setShowScrollToBottom
  });
  const {
    applyThreadTitleUpdate,
    currentVisibleThreadTitle,
    refreshThreadAfterCompletedRun,
    stopTypingTitleAnimation,
    typingTitleThreadId,
    visibleThreads
  } = useThreadTitleRefreshController({
    activeThreadId,
    currentThreadTitle,
    displayedThreads,
    fetchThreadById: async (threadId, signal) => fetchThread(threadId, signal).catch(() => null),
    isDefaultTitle: isDefaultThreadTitle,
    setThreads
  });

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
  const {
    archiveDialogThreadId,
    archivingThreadId,
    closeArchiveDialog,
    closeRenameDialog,
    closeThreadMenu,
    onConfirmArchiveThread,
    onConfirmRenameThread,
    onOpenArchiveThread,
    onOpenRenameThread,
    onOpenShareThread,
    onOpenThreadMenu,
    onPinThread,
    onRenameDraftTitleChange,
    onUnpinThread,
    openThreadMenuId,
    renameDialogThreadId,
    renameDraftTitle,
    renamingThreadId,
    threadActionError
  } = useThreadActionsController({
    activeThreadIdRef,
    navigateToNewChat: () => navigateToNewChat({ replace: true }),
    onOpenShareDialogForThread: shareDialog.onOpenForThread,
    resetDraftThreadState,
    setDurableRecoveryState,
    setThreads,
    stopTypingTitleAnimation,
    stopViewingLiveResponse,
    threads,
    typingTitleThreadId
  });

  function markThreadHydrated(threadId: string) {
    hydratedThreadIdsRef.current.add(threadId);
  }

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    selectedRunIdRef.current = selectedRunId;
  }, [selectedRunId]);

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
    logInspectorRequestIdRef.current += 1;
    logInspectorAbortControllerRef.current?.abort();
    timelineRequestIdRef.current += 1;
    timelineAbortControllerRef.current?.abort();
    setRecentRuns([]);
    setRecentRunsError(null);
    setRecentRunsLoading(false);
    if (options?.clearSelectedRun !== false) {
      setSelectedRunId(null);
    }
    setTimeline(null);
    setTimelineError(null);
    setTimelineLoading(false);
  }

  function stopViewingLiveResponse() {
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

  async function activateThread(threadId: string) {
    return runActivateThread({
      threadId,
      refs: {
        activeThreadIdRef,
        shouldAutoScrollRef
      },
      actions: {
        setActiveThreadId,
        setDurableRecoveryState
      },
      operations: {
        loadThreadMessages
      }
    });
  }

  function navigateToThread(threadId: string, options?: { replace?: boolean }) {
    navigate(`/chat/${threadId}`, { replace: options?.replace });
  }

  function navigateToNewChat(options?: { replace?: boolean }) {
    navigate('/new', { replace: options?.replace });
  }

  function replaceCurrentPath(pathname: string) {
    navigate(pathname, { replace: true });
  }

  async function refreshThreads() {
    const result = await fetchThreads();
    if (!result.ok) {
      throw new Error(result.error ?? `Failed to load threads (${result.status})`);
    }

    setThreads(result.data.threads);
    return result.data.threads;
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
    const result = await fetchThreadMessages(threadId, {
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
        applyHydratedTranscript: ({ messages: hydratedMessages, pageInfo, activeResponseRun, selectedRunId, runs }) => {
          markThreadHydrated(threadId);
          applyHydratedTranscriptState({
            messages: hydratedMessages,
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
          });
        },
        hydrateTranscript,
        loadLogInspector: async () => null,
        resetLogInspectorState
      }
    });

    return result ?? { ok: false, restoredRunId: null };
  }

  useLiveDraftOrchestration({
    activeThreadId,
    activeResponseRun,
    attachStreamAvailable: activeRunCanUseAttachStream,
    hasHydratedActiveThread,
    liveAssistantDraft,
    setLiveAssistantDraft,
    loadThreadMessages
  });

  useAttachStreamOrchestration({
    activeThreadId,
    activeResponseRun,
    hasHydratedActiveThread,
    liveStreamRunId,
    setActiveResponseRun,
    setChatPhase,
    setError,
    setLiveAssistantDraft,
    setPersistingTurn,
    setRecentRuns,
    loadThreadMessages
  });

  useChatRuntimeLifecycle({
    deps: {
      activeThreadId,
      chatPhase,
      initialThreadId,
      liveAssistantDraft,
      loadingThreadId,
      optimisticUserMessage
    },
    actions: {
      activateThread,
      refreshMeta,
      resetDraftThreadState,
      setDurableRecoveryState,
      setError,
      stopViewingLiveResponse,
      initializeRuntime: async (requestId: number) =>
        runInitializeRuntime({
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
            getPreferredRunId: () => null,
            isCurrentRequest: () => routeChangeRequestIdRef.current === requestId,
            refreshThreads,
            resetDraftThreadState
          }
        })
    },
    refs: {
      routeChangeRequestIdRef,
      runtimeBootstrappedRef,
      sendAbortControllerRef,
      messagesAbortControllerRef,
      logInspectorAbortControllerRef,
      timelineAbortControllerRef
    }
  });

  async function loadOlderMessages() {
    const threadId = activeThreadIdRef.current;
    const beforeCursor = messagePageInfoRef.current?.startCursor;
    if (!threadId || !beforeCursor || historyLoading) {
      return;
    }

    capturePrependAnchor();
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

    if (didApply) {
      restorePrependAnchor();
    } else {
      clearPrependAnchor();
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
    markThreadHydrated(threadId);
  }

  async function createThreadRecord() {
    const result = await createThread();
    if (!result.ok || !result.data.thread) {
      throw new Error(result.error ?? `Failed to create thread (${result.status})`);
    }

    const createdThread = result.data.thread;
    setThreads((current) => [createdThread, ...current.filter((thread) => thread.id !== createdThread.id)]);
    return createdThread;
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
          const privateEvent = event as PlaygroundPrivateStreamEventDto;
          if (privateEvent.type === 'thread.title_updated') {
            applyThreadTitleUpdate(privateEvent);
          }
        }
      }
    });

    const threadId = activeThreadIdRef.current;
    const currentThread = threadId ? threadsRef.current.find((thread) => thread.id === threadId) ?? null : null;
    // `thread.title_updated` is the primary auto-title path. Keep the direct fetch only
    // as a fallback when a completed run still leaves the active thread on a default title.
    if (threadId && (!currentThread || isDefaultThreadTitle(currentThread.title))) {
      void refreshThreadAfterCompletedRun(threadId);
    }
  }

  function startNewChat() {
    stopViewingLiveResponse();
    closeThreadMenu();
    closeRenameDialog();
    closeArchiveDialog();
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
    closeThreadMenu();
    closeRenameDialog();
    closeArchiveDialog();
    setDurableRecoveryState({
      phase: 'idle',
      message: null
    });
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
    navigateToThread(threadId);
  }

  return {
    activeThreadId,
    archiveDialogThreadId,
    archivingThreadId,
    closeArchiveDialog,
    closeRenameDialog,
    closeThreadMenu,
    displayedAnswerContainers,
    displayedTranscriptBlocks,
    currentThreadTitle: currentVisibleThreadTitle,
    displayedMessages,
    draft,
    durableRecoveryState,
    error,
    hasOlderMessages,
    historyLoading,
    inputLocked,
    isChatResponding,
    liveAssistantDraft,
    loadingMessages,
    messagesViewportRef,
    meta,
    onCloseSidebar: () => {
      closeThreadMenu();
      setSidebarOpen(false);
    },
    onConfirmArchiveThread,
    onConfirmRenameThread,
    onDraftChange: setDraft,
    onOpenArchiveThread,
    onOpenRenameThread,
    onNewChat: startNewChat,
    onOpenSidebar: () => setSidebarOpen(true),
    onOpenShareThread,
    onOpenThreadMenu,
    onOpenThread: openThread,
    onPinThread,
    onRenameDraftTitleChange,
    onLoadOlderMessages: () => {
      void loadOlderMessages();
    },
    onScrollToBottom: scrollToMessagesBottom,
    onSelectedModelKeyChange: setSelectedModelKey,
    onSelectedWebSearchEnabledChange: setSelectedWebSearchEnabled,
    onSelectedThinkingEnabledChange: setSelectedThinkingEnabled,
    onSelectedReasoningEffortChange: setSelectedReasoningEffort,
    onOpenSearchResult,
    onCloseSearchPanel,
    onSend: () => {
      void sendMessage();
    },
    onStop: stopViewingLiveResponse,
    onUnpinThread,
    openThreadMenuId,
    persistingTurn,
    pinnedThreadIds,
    renameDialogThreadId,
    renameDraftTitle,
    renamingThreadId,
    responseStatus,
    activeSearchResult,
    selectedModelKey,
    selectedWebSearchEnabled,
    selectedThinkingEnabled,
    selectedReasoningEffort,
    selectedModelOption,
    deepseekModePresentation,
    sendAbortControllerRef,
    sendDisabled,
    searchPanelError,
    searchPanelLoading,
    searchPanelOpen,
    getLiveSearchPanelData: getCachedSearchResult,
    shareDialog,
    showResponseLoading,
    showScrollToBottom,
    sidebarOpen,
    textareaRef,
    threadActionError,
    threads: visibleThreads
  };
}
