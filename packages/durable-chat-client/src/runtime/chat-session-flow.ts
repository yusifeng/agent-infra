import type { MessageDto, RunDto, RunTimelineResponseDto, RuntimePiMetaDto, ThreadDto, ThreadMessagesPageInfoDto } from '@agent-infra/contracts';

import { createThreadResponse, fetchRuntimeMetaResponse, fetchThreadsResponse } from '../repo/chat-api.js';
import { normalizeRuntimeMeta } from '../service/chat-runtime.js';
import type { LiveAssistantDraft } from '../types/live-assistant-draft.js';
import type { ChatPhase, DurableRecoveryState } from '../types/runtime.js';

type Updater<T> = T | ((current: T) => T);
type Setter<T> = (next: Updater<T>) => void;
type RefLike<T> = { current: T };

type ResetDraftThreadStateArgs = {
  refs: {
    logInspectorAbortControllerRef: RefLike<AbortController | null>;
    logInspectorRequestIdRef: RefLike<number>;
    messagesAbortControllerRef: RefLike<AbortController | null>;
    messagesRequestIdRef: RefLike<number>;
    sendAbortControllerRef: RefLike<AbortController | null>;
    sendRequestIdRef: RefLike<number>;
    shouldAutoScrollRef: RefLike<boolean>;
    timelineAbortControllerRef: RefLike<AbortController | null>;
    timelineRequestIdRef: RefLike<number>;
  };
  actions: {
    setActiveThreadId: Setter<string | null>;
    setChatPhase: Setter<ChatPhase>;
    setDraft: Setter<string>;
    setHistoryLoading: Setter<boolean>;
    setLiveAssistantDraft: Setter<LiveAssistantDraft | null>;
    setLiveStreamRunId: Setter<string | null>;
    setLoadingMessages: Setter<boolean>;
    setLoadingThreadId: Setter<string | null>;
    setMessages: Setter<MessageDto[]>;
    setMessagePageInfo: Setter<ThreadMessagesPageInfoDto | null>;
    setOptimisticUserMessage: Setter<MessageDto | null>;
    setPersistingTurn: Setter<boolean>;
    setRecentRuns: Setter<RunDto[]>;
    setRecentRunsError: Setter<string | null>;
    setRecentRunsLoading: Setter<boolean>;
    setSelectedRunId: Setter<string | null>;
    setTimeline: Setter<RunTimelineResponseDto | null>;
    setTimelineError: Setter<string | null>;
    setTimelineLoading: Setter<boolean>;
  };
};

type StopViewingLiveResponseArgs = {
  refs: {
    sendAbortControllerRef: RefLike<AbortController | null>;
  };
  actions: {
    setChatPhase: Setter<ChatPhase>;
    setLiveStreamRunId: Setter<string | null>;
    setLoadingThreadId: Setter<string | null>;
    setPersistingTurn: Setter<boolean>;
  };
};

type RefreshThreadsArgs = {
  actions: {
    setThreads: Setter<ThreadDto[]>;
  };
};

type CreateThreadRecordArgs = {
  actions: {
    setThreads: Setter<ThreadDto[]>;
  };
};

type RefreshMetaArgs = {
  actions: {
    setError: Setter<string | null>;
    setMeta: Setter<RuntimePiMetaDto | null>;
    setSelectedModelKey: Setter<string>;
  };
};

type InitializeRuntimeArgs = {
  initialThreadId: string | null;
  refs: {
    runSelectionPersistenceReadyRef: RefLike<boolean>;
  };
  actions: {
    setDurableRecoveryState: Setter<DurableRecoveryState>;
    setError: Setter<string | null>;
  };
  operations: {
    activateThread: (
      threadId: string,
      options?: { preferredRunId?: string | null; recoveryMode?: 'initial-thread' }
    ) => Promise<string | null | undefined>;
    getPreferredRunId: (threadId: string) => string | null;
    isCurrentRequest: () => boolean;
    refreshThreads: () => Promise<ThreadDto[]>;
    resetDraftThreadState: () => void;
  };
};

export function runResetDraftThreadState({ refs, actions }: ResetDraftThreadStateArgs) {
  refs.messagesRequestIdRef.current += 1;
  refs.messagesAbortControllerRef.current?.abort();
  refs.logInspectorRequestIdRef.current += 1;
  refs.logInspectorAbortControllerRef.current?.abort();
  refs.timelineRequestIdRef.current += 1;
  refs.timelineAbortControllerRef.current?.abort();
  refs.sendRequestIdRef.current += 1;
  refs.sendAbortControllerRef.current?.abort();
  actions.setChatPhase('idle');
  actions.setPersistingTurn(false);
  actions.setLoadingThreadId(null);
  actions.setActiveThreadId(null);
  actions.setDraft('');
  actions.setHistoryLoading(false);
  actions.setOptimisticUserMessage(null);
  actions.setMessages([]);
  actions.setMessagePageInfo(null);
  actions.setRecentRuns([]);
  actions.setSelectedRunId(null);
  actions.setTimeline(null);
  actions.setTimelineError(null);
  actions.setTimelineLoading(false);
  actions.setLiveAssistantDraft(null);
  actions.setLiveStreamRunId(null);
  actions.setRecentRunsLoading(false);
  actions.setRecentRunsError(null);
  actions.setLoadingMessages(false);
  refs.shouldAutoScrollRef.current = true;
}

export function runStopViewingLiveResponse({ refs, actions }: StopViewingLiveResponseArgs) {
  refs.sendAbortControllerRef.current?.abort();
  actions.setChatPhase('idle');
  actions.setLiveStreamRunId(null);
  actions.setPersistingTurn(false);
  actions.setLoadingThreadId(null);
}

export async function runRefreshThreads({ actions }: RefreshThreadsArgs) {
  const result = await fetchThreadsResponse();
  if (!result.ok) {
    throw new Error(result.error ?? `Failed to load threads (${result.status})`);
  }

  actions.setThreads(result.data.threads);
  return result.data.threads;
}

export async function runCreateThreadRecord({ actions }: CreateThreadRecordArgs) {
  const result = await createThreadResponse();
  if (!result.ok || !result.data.thread) {
    throw new Error(result.error ?? `Failed to create thread (${result.status})`);
  }

  const createdThread = result.data.thread;
  actions.setThreads((current) =>
    [...current, createdThread].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
  );
  return createdThread;
}

export async function runRefreshMeta({ actions }: RefreshMetaArgs) {
  const result = await fetchRuntimeMetaResponse();
  const normalized = normalizeRuntimeMeta(result.data);
  actions.setMeta(normalized);
  if (!result.ok) {
    actions.setError(normalized.runtimeConfigError ?? `Failed to load runtime metadata (${result.status})`);
    return;
  }

  actions.setSelectedModelKey((current) => {
    if (current && normalized.modelOptions.some((option) => option.key === current)) {
      return current;
    }

    return normalized.defaultModelKey ?? normalized.modelOptions[0]?.key ?? '';
  });
}

export async function runInitializeRuntime({ initialThreadId, refs, actions, operations }: InitializeRuntimeArgs) {
  try {
    await operations.refreshThreads();
    if (!operations.isCurrentRequest()) {
      return;
    }

    if (initialThreadId) {
      const preferredRunId = operations.getPreferredRunId(initialThreadId);
      await operations.activateThread(initialThreadId, {
        preferredRunId,
        recoveryMode: 'initial-thread'
      });
    } else {
      operations.resetDraftThreadState();
      actions.setDurableRecoveryState({
        phase: 'idle',
        message: null
      });
      actions.setError(null);
    }
  } catch (refreshError) {
    if (operations.isCurrentRequest()) {
      actions.setError(refreshError instanceof Error ? refreshError.message : 'Failed to load threads');
    }
  } finally {
    refs.runSelectionPersistenceReadyRef.current = true;
  }
}
