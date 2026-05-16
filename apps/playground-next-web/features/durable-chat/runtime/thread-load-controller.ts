import type {
  LoadThreadMessagesResult,
  HydratedTranscriptPage
} from '@agent-infra/durable-chat-client';
import type { MessageDto, RunDto, ThreadMessagesPageInfoDto } from '@agent-infra/contracts';

import {
  applyHydratedTranscriptState,
  runActivateThread,
  runLoadThreadMessages
} from '@/features/durable-chat/runtime/load-thread-flow';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';
import type { ChatPhase, DurableRecoveryState } from '@/features/durable-chat/types/runtime';

type Updater<T> = T | ((current: T) => T);
type Setter<T> = (next: Updater<T>) => void;
type RefLike<T> = { current: T };

export type ThreadLoadOptions = {
  preferredRunId?: string | null;
  background?: boolean;
  skipTimelineReload?: boolean;
  preserveExistingTimeline?: boolean;
};

type ThreadLoadControllerActions = {
  setActiveResponseRun: Setter<RunDto | null>;
  setChatPhase: Setter<ChatPhase>;
  setError: Setter<string | null>;
  setHistoryLoading: Setter<boolean>;
  setLiveAssistantDraft: Setter<LiveAssistantDraft | null>;
  setLoadingMessages: Setter<boolean>;
  setMessagePageInfo: Setter<ThreadMessagesPageInfoDto | null>;
  setMessages: Setter<MessageDto[]>;
  setOptimisticUserMessage: Setter<MessageDto | null>;
  setRecentRuns: Setter<RunDto[]>;
  setRecentRunsError: Setter<string | null>;
  setRecentRunsLoading: Setter<boolean>;
  setSelectedRunId: Setter<string | null>;
};

export async function runLoadThreadMessagesController(args: {
  threadId: string;
  options?: ThreadLoadOptions;
  refs: {
    activeThreadIdRef: RefLike<string | null>;
    logOpenRef: RefLike<boolean>;
    messagesAbortControllerRef: RefLike<AbortController | null>;
    messagesRequestIdRef: RefLike<number>;
  };
  actions: ThreadLoadControllerActions;
  operations: {
    hydrateTranscript: (threadId: string, signal: AbortSignal) => Promise<HydratedTranscriptPage>;
    loadLogInspector: (
      threadId: string,
      messagesSnapshot: MessageDto[],
      options?: { preferredRunId?: string | null; preserveExistingTimeline?: boolean }
    ) => Promise<string | null>;
    resetLogInspectorState: (options?: { clearSelectedRun?: boolean }) => void;
  };
}): Promise<LoadThreadMessagesResult> {
  const result = await runLoadThreadMessages({
    threadId: args.threadId,
    options: args.options,
    refs: args.refs,
    actions: args.actions,
    operations: {
      applyHydratedTranscript: ({ messages, pageInfo, activeResponseRun, selectedRunId, runs }) =>
        applyHydratedTranscriptState({
          messages,
          pageInfo,
          activeResponseRun,
          selectedRunId,
          runs,
          actions: args.actions
        }),
      hydrateTranscript: args.operations.hydrateTranscript,
      loadLogInspector: args.operations.loadLogInspector,
      resetLogInspectorState: args.operations.resetLogInspectorState
    }
  });

  return result ?? { ok: false, restoredRunId: null };
}

export function applyThreadLoadTimelineDefaults(
  options: ThreadLoadOptions | undefined,
  logOpen: boolean
): ThreadLoadOptions | undefined {
  return {
    ...options,
    preserveExistingTimeline: options?.preserveExistingTimeline ?? logOpen,
    skipTimelineReload: options?.skipTimelineReload ?? logOpen
  };
}

export async function runActivateThreadController(args: {
  threadId: string;
  options?: {
    preferredRunId?: string | null;
    recoveryMode?: 'initial-thread';
    isCurrentRequest?: () => boolean;
  };
  refs: {
    activeThreadIdRef: RefLike<string | null>;
    logOpenRef: RefLike<boolean>;
    shouldAutoScrollRef: RefLike<boolean>;
  };
  actions: {
    setActiveThreadId: Setter<string | null>;
    setDurableRecoveryState: Setter<DurableRecoveryState>;
  };
  operations: {
    loadThreadMessages: (threadId: string, options?: ThreadLoadOptions) => Promise<LoadThreadMessagesResult>;
  };
}) {
  return runActivateThread({
    threadId: args.threadId,
    options: args.options,
    refs: {
      activeThreadIdRef: args.refs.activeThreadIdRef,
      shouldAutoScrollRef: args.refs.shouldAutoScrollRef
    },
    actions: args.actions,
    operations: {
      loadThreadMessages: (threadId, options) =>
        args.operations.loadThreadMessages(
          threadId,
          applyThreadLoadTimelineDefaults(options, args.refs.logOpenRef.current)
        )
    }
  });
}
