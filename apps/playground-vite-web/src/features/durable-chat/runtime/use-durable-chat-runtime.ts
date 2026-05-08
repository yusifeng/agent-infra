import type { MessageDto } from '@agent-infra/contracts';
import {
  applyHydratedTranscriptState,
  runActivateThread,
  runCreateThreadRecord,
  runInitializeRuntime,
  INITIAL_MESSAGE_PAGE_LIMIT,
  runLoadOlderMessages,
  runLoadThreadMessages,
  runReconcileCompletedTurn,
  runRefreshMeta,
  runRefreshThreads,
  runResetDraftThreadState,
  runSendMessageFlow,
  runStopViewingLiveResponse
} from '@agent-infra/durable-chat-client';
import type { LoadThreadMessagesResult } from '@agent-infra/durable-chat-client';
import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { useSearchPanelState } from '@/features/durable-chat/runtime/use-search-panel-state';
import { fetchThreadMessages } from '@/features/durable-chat/repo/chat-api';
import { buildChatViewState } from '@/features/durable-chat/service/chat-view-state';
import { useChatSessionController } from '@/features/durable-chat/runtime/use-chat-session-controller';
import { useRunInspectorController } from '@/features/durable-chat/runtime/use-run-inspector-controller';
import type { DurableChatRuntimeOptions } from '@/features/durable-chat/types/runtime';
import { useLiveDraftOrchestration } from '@/features/durable-chat/runtime/use-live-draft-orchestration';
import { useChatRuntimeLifecycle } from '@/features/durable-chat/runtime/use-chat-runtime-lifecycle';

const PENDING_NEW_THREAD_LOADING_ID = '__pending-new-thread__';

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
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const pendingPrependAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    activeSearchResult,
    searchPanelError,
    searchPanelLoading,
    searchPanelOpen,
    onCloseSearchPanel,
    onOpenSearchResult
  } = useSearchPanelState(activeThreadId);
  const {
    selectedModelOption,
    currentThreadTitle,
    responseStatus,
    isChatResponding,
    showResponseLoading,
    sendDisabled,
    inputLocked,
    displayedMessages,
    displayedTranscriptBlocks,
    displayedAnswerContainers,
    hasOlderMessages
  } = useMemo(
    () =>
      buildChatViewState({
        threads,
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

  function markThreadHydrated(threadId: string) {
    hydratedThreadIdsRef.current.add(threadId);
  }

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

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
    if (!viewport) {
      return;
    }

    const pendingAnchor = pendingPrependAnchorRef.current;
    if (pendingAnchor) {
      pendingPrependAnchorRef.current = null;
      window.requestAnimationFrame(() => {
        const heightDelta = viewport.scrollHeight - pendingAnchor.scrollHeight;
        viewport.scrollTop = pendingAnchor.scrollTop + heightDelta;
      });
      return;
    }

    if (!shouldAutoScrollRef.current) {
      return;
    }

    window.requestAnimationFrame(() => {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: messages.length > 0 ? 'smooth' : 'auto'
      });
    });
  }, [messages, liveAssistantDraft?.partialText, liveAssistantDraft?.partialReasoning, activeThreadId, loadingMessages, historyLoading]);

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
    return runRefreshThreads({
      actions: {
        setThreads
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
    hasHydratedActiveThread,
    liveAssistantDraft,
    setLiveAssistantDraft,
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
    markThreadHydrated(threadId);
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
      }
    });
  }

  function startNewChat() {
    stopViewingLiveResponse();
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
    displayedAnswerContainers,
    displayedTranscriptBlocks,
    currentThreadTitle,
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
    onCloseSidebar: () => setSidebarOpen(false),
    onDraftChange: setDraft,
    onNewChat: startNewChat,
    onOpenSidebar: () => setSidebarOpen(true),
    onOpenThread: openThread,
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
    persistingTurn,
    responseStatus,
    activeSearchResult,
    selectedModelKey,
    selectedWebSearchEnabled,
    selectedThinkingEnabled,
    selectedReasoningEffort,
    selectedModelOption,
    sendAbortControllerRef,
    sendDisabled,
    searchPanelError,
    searchPanelLoading,
    searchPanelOpen,
    showResponseLoading,
    showScrollToBottom,
    sidebarOpen,
    textareaRef,
    threads
  };
}
