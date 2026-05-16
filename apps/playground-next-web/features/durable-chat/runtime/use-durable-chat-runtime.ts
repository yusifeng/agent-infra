'use client';

import type { LoadThreadMessagesResult } from '@agent-infra/durable-chat-client';
import type {
  MessageDto,
  RuntimePiMetaDto,
  ThreadDto
} from '@agent-infra/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { assistantMessageHasVisibleContent } from '@/components/chat-shell/helpers';
import {
  fetchPlaygroundThreads,
  fetchPlaygroundThread,
  fetchThreadMessagesResponse,
  openThreadRunAttachStream
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
import {
  runLoadOlderMessages,
} from '@/features/durable-chat/runtime/load-thread-flow';
import {
  loadInspectorController,
  loadRunTimelineController,
  persistSelectedRunSelection,
  resetInspectorControllerState
} from '@/features/durable-chat/runtime/controllers/inspector-controller';
import { runSendMessageFlow } from '@/features/durable-chat/runtime/send-message-flow';
import { runReconcileCompletedTurnController } from '@/features/durable-chat/runtime/controllers/send-reconcile-controller';
import { runAttachRunLifecycle } from '@/features/durable-chat/runtime/controllers/stream-lifecycle-controller';
import {
  runActivateThreadController,
  runLoadThreadMessagesController
} from '@/features/durable-chat/runtime/controllers/thread-load-controller';
import { useChatSessionController } from '@/features/durable-chat/runtime/use-chat-session-controller';
import { useRunInspectorController } from '@/features/durable-chat/runtime/use-run-inspector-controller';
import {
  INITIAL_MESSAGE_PAGE_LIMIT,
  parseRunAttachSseChunk
} from '@/features/durable-chat/service/chat-runtime';
import {
  resolveActiveRunAttachDecision,
  resolveInspectorLoadDecision,
  resolveThreadRouteDecision
} from '@/features/durable-chat/runtime/controllers/runtime-controller-seams';
import { buildChatRuntimeViewModel } from '@/features/durable-chat/runtime/chat-runtime-view-model';
import { useChatShellEffects } from '@/features/durable-chat/runtime/use-chat-shell-effects';
import { useSearchPanelState } from '@/features/durable-chat/runtime/use-search-panel-state';
import { useChatViewportController } from '@/features/durable-chat/runtime/use-chat-viewport-controller';
import { useThreadActionController } from '@/features/durable-chat/runtime/use-thread-action-controller';
import { useThreadShareController } from '@/features/durable-chat/runtime/use-thread-share-controller';
import { useThreadTitleRefreshController } from '@/features/durable-chat/runtime/use-thread-title-refresh-controller';
import type { DurableChatRuntimeOptions } from '@/features/durable-chat/types/runtime';
import { isDefaultThreadTitle } from '@/features/thread-title/default-thread-title';

const PENDING_NEW_THREAD_LOADING_ID = '__pending-new-thread__';

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
  const [pendingNavigationTitle, setPendingNavigationTitle] = useState<{ threadId: string; title: string } | null>(null);
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
  const attachRequestIdRef = useRef(0);
  const attachAbortControllerRef = useRef<AbortController | null>(null);
  const attachRunIdRef = useRef<string | null>(null);
  const attachVersionRef = useRef(0);
  const sendRequestIdRef = useRef(0);
  const sendAbortControllerRef = useRef<AbortController | null>(null);
  const reconcileRequestIdRef = useRef(0);

  const {
    currentThreadPinned,
    currentThreadTitle,
    deepseekModePresentation,
    displayedAnswerContainers,
    displayedMessages,
    displayedTranscriptBlocks,
    hasOlderMessages,
    inputLocked,
    isChatResponding,
    liveAssistantActionsAvailable,
    responseStatus,
    selectedModelOption,
    sendDisabled,
    showResponseLoading
  } = useMemo(
    () =>
      buildChatRuntimeViewModel({
        activeResponseRun,
        activeThreadId,
        chatPhase,
        draft,
        liveAssistantDraft,
        loadingThreadId,
        messagePageInfo,
        messages,
        meta,
        optimisticUserMessage,
        pendingNavigationTitle,
        pendingNewThreadLoadingId: PENDING_NEW_THREAD_LOADING_ID,
        persistingTurn,
        selectedModelKey,
        threads,
        timeline
      }),
    [
      activeResponseRun,
      activeThreadId,
      chatPhase,
      draft,
      liveAssistantDraft,
      loadingThreadId,
      messagePageInfo,
      messages,
      meta,
      optimisticUserMessage,
      pendingNavigationTitle,
      persistingTurn,
      selectedModelKey,
      threads,
      timeline
    ]
  );
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
  const {
    archiveDialogThreadId,
    archivingThreadId,
    onArchiveActiveThread,
    onArchiveThreadById,
    onCloseArchiveDialog,
    onCloseRenameDialog,
    onConfirmArchiveThread,
    onConfirmRenameThread,
    onRenameActiveThread,
    onRenameDraftTitleChange,
    onRenameThreadById,
    onToggleActiveThreadPin,
    onToggleThreadPinById,
    renameDialogThreadId,
    renameDraftTitle,
    renamingThreadId,
    threadActionBusy,
    threadActionError
  } = useThreadActionController({
    activeThreadIdRef,
    currentThreadPinned,
    refreshThreads,
    setError,
    setThreads,
    threads,
    onArchivedActiveThread: () => {
      stopViewingLiveResponse();
      resetDraftThreadState();
      navigateToNewChat({ replace: true });
    }
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
  const {
    creatingShare,
    loadingCurrentShare,
    onCloseShareDialog,
    onCreateOrCopyShare,
    onOpenShareDialog,
    onOpenShareDialogForThread,
    onRevokeShare,
    revokingShare,
    shareCopied,
    shareDialogOpen,
    shareError,
    shareUrl
  } = useThreadShareController({
    activeThreadIdRef
  });
  const { closeSidebarForMobile } = useChatShellEffects({
    currentVisibleThreadTitle,
    liveAssistantDraft,
    prefetchSearchResult,
    setSidebarOpen
  });

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

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
    selectedRunIdRef.current = selectedRunId;
  }, [selectedRunId]);

  useEffect(() => {
    persistSelectedRunSelection({
      activeThreadId,
      selectedRunId,
      refs: {
        logOpenRef,
        runSelectionPersistenceReadyRef
      },
      operations: {
        persistSelectedRunId
      }
    });
  }, [activeThreadId, selectedRunId]);

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
    resetInspectorControllerState({
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

  async function attachToActiveRun(threadId: string, runId: string) {
    return runAttachRunLifecycle({
      threadId,
      runId,
      refs: {
        activeThreadIdRef,
        attachAbortControllerRef,
        attachRequestIdRef,
        attachRunIdRef,
        attachVersionRef,
        logOpenRef,
        sendRequestIdRef
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
        openAttachStream: openThreadRunAttachStream,
        parseAttachChunk: parseRunAttachSseChunk,
        reconcileCompletedTurn
      }
    });
  }

  async function activateThread(
    threadId: string,
    options?: {
      preferredRunId?: string | null;
      recoveryMode?: 'initial-thread';
      isCurrentRequest?: () => boolean;
    }
  ) {
    return runActivateThreadController({
      threadId,
      options,
      refs: {
        activeThreadIdRef,
        logOpenRef,
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

  function applyThreadTitleUpdated(threadId: string, title: string, updatedAt: string) {
    applyThreadTitleUpdate({ threadId, title, updatedAt });
  }

  async function loadLogInspector(
    threadId: string,
    messagesSnapshot: MessageDto[],
    options?: { preferredRunId?: string | null; preserveExistingTimeline?: boolean }
  ) {
    return loadInspectorController({
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
    return loadRunTimelineController({
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
    return runLoadThreadMessagesController({
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
        setChatPhase,
        setError,
        setHistoryLoading,
        setLiveAssistantDraft,
        setLoadingMessages,
        setMessagePageInfo,
        setMessages,
        setOptimisticUserMessage,
        setRecentRuns,
        setRecentRunsError,
        setRecentRunsLoading,
        setSelectedRunId
      },
      operations: {
        hydrateTranscript,
        loadLogInspector,
        resetLogInspectorState
      }
    });
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
    await runReconcileCompletedTurnController({
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
      },
      operations: {
        getThreads: () => threadsRef.current,
        isDefaultThreadTitle,
        refreshThreadAfterCompletedRun,
        refreshThreads
      }
    });
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
    closeSidebarForMobile();
    navigateToNewChat();
  }

  function openThread(threadId: string, title?: string | null) {
    stopViewingLiveResponse();
    stopTypingTitleAnimation();
    const nextTitle = title?.trim() ?? '';
    setPendingNavigationTitle(nextTitle ? { threadId, title: nextTitle } : null);
    setDurableRecoveryState({
      phase: 'idle',
      message: null
    });
    closeSidebarForMobile();
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
    const decision = resolveActiveRunAttachDecision({
      activeThreadId,
      activeResponseRun,
      attachedRunId: attachRunIdRef.current,
      sendInFlight: sendAbortControllerRef.current !== null
    });

    if (decision.type === 'abort') {
      attachAbortControllerRef.current?.abort();
      attachAbortControllerRef.current = null;
      attachRunIdRef.current = null;
      return;
    }

    if (decision.type === 'idle') {
      return;
    }

    void attachToActiveRun(decision.threadId, decision.runId);
  }, [activeThreadId, activeResponseRun?.id, activeResponseRun?.status]);

  useEffect(() => {
    const requestId = routeChangeRequestIdRef.current + 1;
    routeChangeRequestIdRef.current = requestId;
    const decision = resolveThreadRouteDecision({
      activeThreadId,
      chatPhase,
      initialThreadId,
      liveAssistantDraft,
      loadingThreadId,
      optimisticUserMessage,
      runtimeBootstrapped: runtimeBootstrappedRef.current
    });

    if (decision.type === 'initialize') {
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

    if (decision.type === 'idle') {
      return;
    }

    if (decision.type === 'activate-thread') {
      void activateThread(decision.threadId, {
        preferredRunId: readPersistedRunId(decision.threadId)
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
    const decision = resolveInspectorLoadDecision({
      activeThreadId,
      loadingMessages,
      logOpen
    });

    if (decision.type === 'reset') {
      resetLogInspectorState();
      return;
    }

    if (decision.type === 'idle') {
      return;
    }

    void loadLogInspector(decision.threadId, messages, {
      preferredRunId: readPersistedRunId(decision.threadId) ?? selectedRunIdRef.current,
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
      onArchiveActiveThread();
    },
    onCloseArchiveDialog,
    onCloseRenameDialog,
    onCloseShareDialog,
    onCloseSidebar: () => setSidebarOpen(false),
    onCreateOrCopyShare: () => {
      void onCreateOrCopyShare();
    },
    onDraftChange: setDraft,
    onNewChat: startNewChat,
    onOpenSidebar: () => setSidebarOpen(true),
    onOpenShareDialog: () => {
      void onOpenShareDialog();
    },
    onOpenThread: openThread,
    onOpenThreadShareDialog: (threadId: string) => {
      void onOpenShareDialogForThread(threadId);
    },
    onLoadOlderMessages: () => {
      void loadOlderMessages();
    },
    onScrollToBottom: scrollToMessagesBottom,
    onRenameThread: () => {
      onRenameActiveThread();
    },
    onRenameThreadById,
    onRenameDraftTitleChange,
    onConfirmRenameThread: () => {
      void onConfirmRenameThread();
    },
    onConfirmArchiveThread: () => {
      void onConfirmArchiveThread();
    },
    onRevokeShare: () => {
      void onRevokeShare();
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
      void onToggleActiveThreadPin();
    },
    onToggleThreadPinById,
    onArchiveThreadById,
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
