import type { MessageDto, ToolInvocationDto } from '@agent-infra/contracts';
import {
  applyHydratedTranscriptState,
  deriveMainChatResponseStatus,
  fetchRunTimelineResponse,
  fetchThreadMessagesResponse,
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
  shouldShowMainChatLoading,
  runStopViewingLiveResponse,
  upsertMessage
} from '@agent-infra/durable-chat-client';
import type { LoadThreadMessagesResult } from '@agent-infra/durable-chat-client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { buildTranscriptBlocks, filterTranscriptBlocksForLiveRun } from '@/features/durable-chat/runtime/build-transcript-blocks';
import { useChatSessionController } from '@/features/durable-chat/runtime/use-chat-session-controller';
import { useRunInspectorController } from '@/features/durable-chat/runtime/use-run-inspector-controller';
import type { ActiveSearchPanelData, SearchPanelResultItem, SearchPanelSection } from '@/features/durable-chat/types/search';
import type { TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';
import type { DurableChatRuntimeOptions } from '@/features/durable-chat/types/runtime';

const PENDING_NEW_THREAD_LOADING_ID = '__pending-new-thread__';

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function deriveHostname(rawUrl: string) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function parseSearchResultItem(value: unknown): SearchPanelResultItem | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const url = typeof record.url === 'string' ? record.url.trim() : '';
  const snippet = typeof record.snippet === 'string' ? record.snippet.trim() : '';
  const sourceName = typeof record.sourceName === 'string' ? record.sourceName.trim() : '';

  if (!title || !url) {
    return null;
  }

  return {
    rank: typeof record.rank === 'number' && Number.isFinite(record.rank) ? record.rank : 0,
    title,
    url,
    snippet,
    sourceName,
    hostname:
      typeof record.hostname === 'string' && record.hostname.trim().length > 0
        ? record.hostname.trim().toLowerCase()
        : deriveHostname(url),
    publishedAt: typeof record.publishedAt === 'string' ? record.publishedAt : null
  };
}

function buildSearchPanelSection(invocation: ToolInvocationDto): SearchPanelSection | null {
  const output = asRecord(invocation.output);
  const artifact = asRecord(output?.artifact);
  if (!artifact) {
    return null;
  }

  const rawResults = Array.isArray(artifact.results) ? artifact.results : [];
  const results = rawResults.map(parseSearchResultItem).filter((item): item is SearchPanelResultItem => item !== null);
  const query =
    typeof artifact.query === 'string'
      ? artifact.query
      : typeof invocation.input?.query === 'string'
        ? invocation.input.query
        : '';

  if (!query) {
    return null;
  }

  return {
    toolCallId: invocation.toolCallId,
    query,
    resultCount: typeof artifact.resultCount === 'number' ? artifact.resultCount : results.length,
    retrievedAt: typeof artifact.retrievedAt === 'string' ? artifact.retrievedAt : null,
    results
  };
}

function buildSearchPanelData(invocations: ToolInvocationDto[]): ActiveSearchPanelData | null {
  const sectionsWithInvocation = invocations
    .filter((invocation) => invocation.toolName === 'searchWeb')
    .map((invocation) => {
      const section = buildSearchPanelSection(invocation);
      return section ? { invocation, section } : null;
    })
    .filter((entry): entry is { invocation: ToolInvocationDto; section: SearchPanelSection } => entry !== null);

  if (sectionsWithInvocation.length === 0) {
    return null;
  }

  const sections = sectionsWithInvocation.map((entry) => entry.section);
  const firstInvocation = sectionsWithInvocation[0]!.invocation;
  const firstArtifact = asRecord(asRecord(firstInvocation.output)?.artifact);
  const sourceNames = [...new Set(sections.flatMap((section) => section.results.map((result) => result.sourceName).filter(Boolean)))].slice(0, 6);

  return {
    runId: firstInvocation.runId,
    toolCallIds: sections.map((section) => section.toolCallId),
    provider: typeof firstArtifact?.provider === 'string' ? firstArtifact.provider : 'unknown',
    resultCount: sections.reduce((total, section) => total + section.resultCount, 0),
    sourceNames,
    sections
  };
}

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
  const searchResultCacheRef = useRef<Map<string, ActiveSearchPanelData>>(new Map());
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [activeSearchResult, setActiveSearchResult] = useState<ActiveSearchPanelData | null>(null);
  const [searchPanelLoading, setSearchPanelLoading] = useState(false);
  const [searchPanelError, setSearchPanelError] = useState<string | null>(null);
  const activeThread = useMemo(() => threads.find((thread) => thread.id === activeThreadId) ?? null, [threads, activeThreadId]);
  const selectedModelOption = useMemo(
    () => meta?.modelOptions.find((option) => option.key === selectedModelKey) ?? meta?.modelOptions[0] ?? null,
    [meta, selectedModelKey]
  );
  const currentThreadTitle = activeThread?.title?.trim() || activeThreadId || 'New chat';
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
  const sendDisabled = !draft.trim() || isChatResponding || !meta?.runtimeConfigured || !selectedModelOption;
  const inputLocked = isChatResponding;
  const displayedMessages = useMemo(
    () => (optimisticUserMessage ? upsertMessage(messages, optimisticUserMessage) : messages),
    [messages, optimisticUserMessage]
  );
  const displayedTranscriptBlocks = useMemo<TranscriptBlock[]>(
    () => filterTranscriptBlocksForLiveRun(buildTranscriptBlocks(displayedMessages), liveAssistantDraft?.runId ?? null),
    [displayedMessages, liveAssistantDraft?.runId]
  );
  const hasOlderMessages = messagePageInfo?.hasOlder === true;

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    setSearchPanelOpen(false);
    setActiveSearchResult(null);
    setSearchPanelLoading(false);
    setSearchPanelError(null);
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
        applyHydratedTranscript: ({ messages: hydratedMessages, pageInfo, activeResponseRun, selectedRunId, runs }) =>
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
          }),
        hydrateTranscript,
        loadLogInspector: async () => null,
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

  async function openSearchResult(runId: string, toolCallIds: string[]) {
    const normalizedToolCallIds = [...new Set(toolCallIds)].sort();
    const cacheKey = `${runId}:${normalizedToolCallIds.join(',')}`;
    const cached = searchResultCacheRef.current.get(cacheKey);
    if (cached) {
      setActiveSearchResult(cached);
      setSearchPanelError(null);
      setSearchPanelOpen(true);
      return;
    }

    setSearchPanelLoading(true);
    setSearchPanelError(null);

    try {
      const result = await fetchRunTimelineResponse(runId);
      if (!result.ok) {
        throw new Error(result.error ?? `Failed to load search results (${result.status})`);
      }

      const invocations = result.data.toolInvocations.filter(
        (candidate) => candidate.toolName === 'searchWeb' && normalizedToolCallIds.includes(candidate.toolCallId)
      );

      if (invocations.length === 0) {
        throw new Error('Search results are no longer available for this conversation turn.');
      }

      const panelData = buildSearchPanelData(invocations);
      if (!panelData) {
        throw new Error('Search results are present but could not be parsed.');
      }

      searchResultCacheRef.current.set(cacheKey, panelData);
      setActiveSearchResult(panelData);
      setSearchPanelOpen(true);
    } catch (nextError) {
      setSearchPanelOpen(true);
      setActiveSearchResult(null);
      setSearchPanelError(nextError instanceof Error ? nextError.message : 'Failed to load search results.');
    } finally {
      setSearchPanelLoading(false);
    }
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
      void activateThread(initialThreadId);
      return;
    }

    resetDraftThreadState();
    setDurableRecoveryState({
      phase: 'idle',
      message: null
    });
    setError(null);
  }, [initialThreadId]);

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
    onOpenSearchResult: (runId: string, toolCallIds: string[]) => {
      void openSearchResult(runId, toolCallIds);
    },
    onCloseSearchPanel: () => setSearchPanelOpen(false),
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
