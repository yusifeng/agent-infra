'use client';

import type {
  MessageDto,
  RuntimePiMetaDto,
  ThreadDto
} from '@agent-infra/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';

import { assistantMessageHasVisibleContent } from '@/components/chat-shell/helpers';
import { fetchThreadMessagesResponse } from '@/features/durable-chat/repo/chat-api';
import { persistSelectedRunId, readPersistedRunId } from '@/features/durable-chat/repo/run-selection-storage';
import {
  runCreateThreadRecord,
  runInitializeRuntime,
  runRefreshMeta,
  runRefreshThreads,
  runResetDraftThreadState,
  runStopViewingLiveResponse
} from '@/features/durable-chat/runtime/chat-session-flow';
import { applyHydratedTranscriptState, runActivateThread, runLoadThreadMessages } from '@/features/durable-chat/runtime/load-thread-flow';
import {
  runLoadLogInspectorFlow,
  runLoadRunTimeline,
  runResetLogInspectorState
} from '@/features/durable-chat/runtime/load-log-inspector-flow';
import { runSendMessageFlow } from '@/features/durable-chat/runtime/send-message-flow';
import { runReconcileCompletedTurn } from '@/features/durable-chat/runtime/reconcile-completed-turn';
import { useChatSessionController } from '@/features/durable-chat/runtime/use-chat-session-controller';
import { useRunInspectorController } from '@/features/durable-chat/runtime/use-run-inspector-controller';
import { upsertMessage } from '@/features/durable-chat/service/chat-runtime';
import type { DurableChatRuntimeOptions } from '@/features/durable-chat/types/runtime';

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
      chatPhase,
      persistingTurn,
      loadingThreadId,
      loadingMessages,
      error,
      liveStreamRunId,
      liveAssistantDraft,
      durableRecoveryNotice,
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
    setChatPhase,
    setPersistingTurn,
    setLoadingThreadId,
    setLoadingMessages,
    setError,
    setLiveStreamRunId,
    setLiveAssistantDraft,
    setDurableRecoveryNotice,
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
  const logOpenRef = useRef(false);
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
        setChatPhase,
        setDraft,
        setLiveAssistantDraft,
        setLiveStreamRunId,
        setLoadingMessages,
        setLoadingThreadId,
        setMessages,
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
    runStopViewingLiveResponse({
      refs: {
        sendAbortControllerRef
      },
      actions: {
        setChatPhase,
        setLiveStreamRunId,
        setLoadingThreadId,
        setPersistingTurn
      }
    });
  }

  async function activateThread(threadId: string, options?: { preferredRunId?: string | null }) {
    return runActivateThread({
      threadId,
      options,
      refs: {
        activeThreadIdRef,
        shouldAutoScrollRef
      },
      actions: {
        setActiveThreadId,
        setDurableRecoveryNotice
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
    return runRefreshThreads({
      actions: {
        setThreads
      }
    });
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
    const result = await fetchThreadMessagesResponse(threadId, signal);
    if (!result.ok) {
      throw new Error(result.error ?? `Failed to load messages (${result.status})`);
    }

    return result.data.messages ?? [];
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
    return runLoadThreadMessages({
      threadId,
      options,
      refs: {
        activeThreadIdRef,
        logOpenRef,
        messagesAbortControllerRef,
        messagesRequestIdRef
      },
      actions: {
        setError,
        setLiveAssistantDraft,
        setLoadingMessages,
        setOptimisticUserMessage,
        setRecentRunsError,
        setRecentRunsLoading
      },
      operations: {
        applyHydratedTranscript: ({ messages, selectedRunId, runs }) =>
          applyHydratedTranscriptState({
            messages,
            selectedRunId,
            runs,
            actions: {
              setChatPhase,
              setError,
              setLiveAssistantDraft,
              setMessages,
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
  }

  async function reconcileCompletedTurn(
    threadId: string,
    preferredRunId: string | null,
    requestId: number,
    options?: { recoverTranscript?: boolean }
  ) {
    await runReconcileCompletedTurn({
      threadId,
      preferredRunId,
      requestId,
      options,
      state: {
        messages
      },
      refs: {
        activeThreadIdRef,
        logOpenRef,
        reconcileRequestIdRef,
        selectedRunIdRef,
        sendRequestIdRef
      },
      actions: {
        setChatPhase,
        setLiveAssistantDraft,
        setLoadingThreadId,
        setMessages,
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
        refreshThreads,
        replaceCurrentPath
      }
    });
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
    void refreshMeta();
  }, []);

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
          setDurableRecoveryNotice,
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

    if (initialThreadId) {
      void activateThread(initialThreadId, {
        preferredRunId: readPersistedRunId(initialThreadId)
      });
      return;
    }

    resetDraftThreadState();
    setDurableRecoveryNotice(null);
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
