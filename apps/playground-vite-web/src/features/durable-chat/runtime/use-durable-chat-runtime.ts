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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useSearchPanelState } from '@/features/durable-chat/runtime/use-search-panel-state';
import {
  archiveThread,
  createThread,
  fetchThread,
  fetchThreadMessages,
  fetchThreads,
  pinThread as pinThreadRequest,
  renameThread,
  unpinThread as unpinThreadRequest
} from '@/features/durable-chat/repo/chat-api';
import { buildChatViewState } from '@/features/durable-chat/service/chat-view-state';
import { isDefaultThreadTitle } from '@/features/durable-chat/service/default-thread-title';
import { collectCompletedLiveSearchToolCallIds } from '@/features/durable-chat/service/research-activity';
import { useChatSessionController } from '@/features/durable-chat/runtime/use-chat-session-controller';
import { useRunInspectorController } from '@/features/durable-chat/runtime/use-run-inspector-controller';
import type { DurableChatRuntimeOptions } from '@/features/durable-chat/types/runtime';
import { useLiveDraftOrchestration } from '@/features/durable-chat/runtime/use-live-draft-orchestration';
import { useChatRuntimeLifecycle } from '@/features/durable-chat/runtime/use-chat-runtime-lifecycle';
import { useShareDialogState } from '@/features/durable-chat/runtime/use-share-dialog-state';
import type { PlaygroundThreadDto } from '@/features/durable-chat/types/thread';

const PENDING_NEW_THREAD_LOADING_ID = '__pending-new-thread__';
const AUTO_TITLE_REFRESH_MAX_ATTEMPTS = 8;
const AUTO_TITLE_REFRESH_INTERVAL_MS = 300;
const TITLE_TYPING_INTERVAL_MS = 40;

type TypingTitleState = {
  threadId: string;
  finalText: string;
  visibleText: string;
};

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
  const autoTitleRefreshRequestIdRef = useRef(0);
  const autoTitleRefreshAbortControllerRef = useRef<AbortController | null>(null);
  const titleTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const pendingPrependAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
  const [openThreadMenuId, setOpenThreadMenuId] = useState<string | null>(null);
  const [renameDialogThreadId, setRenameDialogThreadId] = useState<string | null>(null);
  const [renameDraftTitle, setRenameDraftTitle] = useState('');
  const [archiveDialogThreadId, setArchiveDialogThreadId] = useState<string | null>(null);
  const [threadActionError, setThreadActionError] = useState<string | null>(null);
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [archivingThreadId, setArchivingThreadId] = useState<string | null>(null);
  const [typingTitleState, setTypingTitleState] = useState<TypingTitleState | null>(null);
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

  function syncTextareaHeight() {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }

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
    if (!typingTitleState) {
      return;
    }

    if (activeThreadId !== typingTitleState.threadId) {
      if (titleTypingTimeoutRef.current !== null) {
        clearTimeout(titleTypingTimeoutRef.current);
        titleTypingTimeoutRef.current = null;
      }
      setTypingTitleState(null);
    }
  }, [activeThreadId, typingTitleState]);

  useLayoutEffect(() => {
    syncTextareaHeight();
  }, [draft]);

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
    return () => {
      autoTitleRefreshAbortControllerRef.current?.abort();
      if (titleTypingTimeoutRef.current !== null) {
        clearTimeout(titleTypingTimeoutRef.current);
      }
    };
  }, []);

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

    if (loadingMessages) {
      return;
    }

    window.requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
      setShowScrollToBottom(false);
    });
  }, [activeThreadId, loadingMessages]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport || !liveAssistantDraft) {
      return;
    }

    window.requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
      setShowScrollToBottom(false);
    });
  }, [liveAssistantDraft?.messageId]);

  function scrollToMessagesBottom() {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    shouldAutoScrollRef.current = true;
    setShowScrollToBottom(false);
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
    const result = await fetchThreads();
    if (!result.ok) {
      throw new Error(result.error ?? `Failed to load threads (${result.status})`);
    }

    setThreads(result.data.threads);
    return result.data.threads;
  }

  function patchThread(currentThread: PlaygroundThreadDto) {
    setThreads((current) => current.map((thread) => (thread.id === currentThread.id ? currentThread : thread)));
  }

  function stopTypingTitleAnimation() {
    if (titleTypingTimeoutRef.current !== null) {
      clearTimeout(titleTypingTimeoutRef.current);
      titleTypingTimeoutRef.current = null;
    }
    setTypingTitleState(null);
  }

  function startTypingTitleAnimation(threadId: string, finalText: string) {
    const characters = Array.from(finalText);
    if (characters.length === 0) {
      stopTypingTitleAnimation();
      return;
    }

    stopTypingTitleAnimation();

    let visibleLength = 1;
    setTypingTitleState({
      threadId,
      finalText,
      visibleText: characters.slice(0, visibleLength).join('')
    });

    const step = () => {
      if (activeThreadIdRef.current !== threadId) {
        stopTypingTitleAnimation();
        return;
      }

      visibleLength += 1;
      if (visibleLength >= characters.length) {
        stopTypingTitleAnimation();
        return;
      }

      setTypingTitleState({
        threadId,
        finalText,
        visibleText: characters.slice(0, visibleLength).join('')
      });
      titleTypingTimeoutRef.current = setTimeout(step, TITLE_TYPING_INTERVAL_MS);
    };

    titleTypingTimeoutRef.current = setTimeout(step, TITLE_TYPING_INTERVAL_MS);
  }

  async function refreshThreadAfterCompletedRun(threadId: string) {
    const requestId = ++autoTitleRefreshRequestIdRef.current;
    autoTitleRefreshAbortControllerRef.current?.abort();

    for (let attempt = 0; attempt < AUTO_TITLE_REFRESH_MAX_ATTEMPTS; attempt += 1) {
      if (requestId !== autoTitleRefreshRequestIdRef.current) {
        return;
      }

      const controller = new AbortController();
      autoTitleRefreshAbortControllerRef.current = controller;

      const previousThread = threadsRef.current.find((thread) => thread.id === threadId) ?? null;
      const wasDefaultTitle = isDefaultThreadTitle(previousThread?.title);

      const result = await fetchThread(threadId, controller.signal).catch(() => null);
      if (requestId !== autoTitleRefreshRequestIdRef.current) {
        return;
      }

      if (result?.ok && result.data.thread) {
        const nextThread = result.data.thread;
        const currentLocalThread = threadsRef.current.find((thread) => thread.id === threadId) ?? null;
        const stillDefaultLocally = isDefaultThreadTitle(currentLocalThread?.title);
        const hasGeneratedTitle = !isDefaultThreadTitle(nextThread.title);
        if (stillDefaultLocally || !hasGeneratedTitle) {
          patchThread(nextThread);
        }

        if (hasGeneratedTitle) {
          if (wasDefaultTitle && stillDefaultLocally && activeThreadIdRef.current === threadId && nextThread.title) {
            startTypingTitleAnimation(threadId, nextThread.title);
          }
          return;
        }
      }

      if (attempt === AUTO_TITLE_REFRESH_MAX_ATTEMPTS - 1) {
        return;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, AUTO_TITLE_REFRESH_INTERVAL_MS);
      });
    }
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
      }
    });

    const threadId = activeThreadIdRef.current;
    const currentThread = threadId ? threadsRef.current.find((thread) => thread.id === threadId) ?? null : null;
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

  function openThreadMenu(threadId: string) {
    setOpenThreadMenuId(threadId);
    setThreadActionError(null);
  }

  function closeThreadMenu() {
    setOpenThreadMenuId(null);
  }

  function beginRenameThread(threadId: string) {
    const thread = threads.find((candidate) => candidate.id === threadId);
    setRenameDialogThreadId(threadId);
    setRenameDraftTitle(thread?.title ?? '');
    setThreadActionError(null);
    setOpenThreadMenuId(null);
  }

  function closeRenameDialog() {
    setRenameDialogThreadId(null);
    setRenameDraftTitle('');
    setThreadActionError(null);
  }

  async function submitRenameThread() {
    const threadId = renameDialogThreadId;
    const title = renameDraftTitle.trim();
    if (!threadId || !title) {
      setThreadActionError('请输入会话标题。');
      return false;
    }

    setRenamingThreadId(threadId);
    setThreadActionError(null);

    try {
      const result = await renameThread(threadId, title);
      if (!result.ok || !result.data.thread) {
        throw new Error(result.error ?? `Failed to rename thread (${result.status})`);
      }

      if (typingTitleState?.threadId === threadId) {
        stopTypingTitleAnimation();
      }
      setThreads((current) => current.map((thread) => (thread.id === threadId ? result.data.thread ?? thread : thread)));
      closeRenameDialog();
      return true;
    } catch (nextError) {
      setThreadActionError(nextError instanceof Error ? nextError.message : '重命名会话失败。');
      return false;
    } finally {
      setRenamingThreadId(null);
    }
  }

  function beginArchiveThread(threadId: string) {
    setArchiveDialogThreadId(threadId);
    setThreadActionError(null);
    setOpenThreadMenuId(null);
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
        throw new Error(result.error ?? `Failed to archive thread (${result.status})`);
      }

      setThreads((current) => current.filter((thread) => thread.id !== threadId));
      closeArchiveDialog();

      if (activeThreadIdRef.current === threadId) {
        stopViewingLiveResponse();
        setDurableRecoveryState({
          phase: 'idle',
          message: null
        });
        resetDraftThreadState();
        navigateToNewChat({ replace: true });
      }

      return true;
    } catch (nextError) {
      setThreadActionError(nextError instanceof Error ? nextError.message : '删除会话失败。');
      return false;
    } finally {
      setArchivingThreadId(null);
    }
  }

  function pinThread(threadId: string) {
    void (async () => {
      try {
        const result = await pinThreadRequest(threadId);
        if (!result.ok || !result.data.thread) {
          throw new Error(result.error ?? 'Failed to pin thread');
        }

        setThreads((current) => [
          result.data.thread as (typeof current)[number],
          ...current
            .map((thread) => (thread.id === threadId ? result.data.thread ?? thread : thread))
            .filter((thread) => thread.id !== threadId)
        ]);
        setOpenThreadMenuId(null);
      } catch (error) {
        setThreadActionError(error instanceof Error ? error.message : '置顶会话失败。');
      }
    })();
  }

  function unpinThread(threadId: string) {
    void (async () => {
      try {
        const result = await unpinThreadRequest(threadId);
        if (!result.ok || !result.data.thread) {
          throw new Error(result.error ?? 'Failed to unpin thread');
        }

        setThreads((current) => current.map((thread) => (thread.id === threadId ? result.data.thread ?? thread : thread)));
        setOpenThreadMenuId(null);
      } catch (error) {
        setThreadActionError(error instanceof Error ? error.message : '取消置顶失败。');
      }
    })();
  }

  function openShareThread(threadId: string) {
    setOpenThreadMenuId(null);
    shareDialog.onOpenForThread(threadId);
  }

  const currentVisibleThreadTitle =
    typingTitleState?.threadId === activeThreadId ? typingTitleState.visibleText : currentThreadTitle;
  const visibleThreads = useMemo(() => {
    if (!typingTitleState || activeThreadId !== typingTitleState.threadId) {
      return displayedThreads;
    }

    return displayedThreads.map((thread) =>
      thread.id === typingTitleState.threadId ? { ...thread, title: typingTitleState.visibleText } : thread
    );
  }, [activeThreadId, displayedThreads, typingTitleState]);

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
      setOpenThreadMenuId(null);
      setSidebarOpen(false);
    },
    onConfirmArchiveThread: () => {
      void submitArchiveThread();
    },
    onConfirmRenameThread: () => {
      void submitRenameThread();
    },
    onDraftChange: setDraft,
    onOpenArchiveThread: beginArchiveThread,
    onOpenRenameThread: beginRenameThread,
    onNewChat: startNewChat,
    onOpenSidebar: () => setSidebarOpen(true),
    onOpenShareThread: openShareThread,
    onOpenThreadMenu: openThreadMenu,
    onOpenThread: openThread,
    onPinThread: pinThread,
    onRenameDraftTitleChange: setRenameDraftTitle,
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
    onUnpinThread: unpinThread,
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
