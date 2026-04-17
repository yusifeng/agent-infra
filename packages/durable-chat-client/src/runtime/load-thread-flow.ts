import type { MessageDto, RunDto } from '@agent-infra/contracts';

import { assistantMessageHasVisibleContent } from '../service/message-visibility.js';
import type { LiveAssistantDraft } from '../types/live-assistant-draft.js';
import type { ChatPhase } from '../types/runtime.js';

type Updater<T> = T | ((current: T) => T);
type Setter<T> = (next: Updater<T>) => void;
type RefLike<T> = { current: T };

type ApplyHydratedTranscriptArgs = {
  messages: MessageDto[];
  selectedRunId: string | null;
  runs: RunDto[];
};

type LoadThreadMessagesArgs = {
  threadId: string;
  options?: {
    preferredRunId?: string | null;
    background?: boolean;
    skipTimelineReload?: boolean;
    preserveExistingTimeline?: boolean;
  };
  refs: {
    activeThreadIdRef: RefLike<string | null>;
    logOpenRef: RefLike<boolean>;
    messagesAbortControllerRef: RefLike<AbortController | null>;
    messagesRequestIdRef: RefLike<number>;
  };
  actions: {
    setError: Setter<string | null>;
    setLiveAssistantDraft: Setter<LiveAssistantDraft | null>;
    setLoadingMessages: Setter<boolean>;
    setOptimisticUserMessage: Setter<MessageDto | null>;
    setRecentRunsError: Setter<string | null>;
    setRecentRunsLoading: Setter<boolean>;
  };
  operations: {
    applyHydratedTranscript: (args: ApplyHydratedTranscriptArgs) => void;
    hydrateTranscript: (threadId: string, signal: AbortSignal) => Promise<MessageDto[]>;
    loadLogInspector: (
      threadId: string,
      messagesSnapshot: MessageDto[],
      options?: { preferredRunId?: string | null; preserveExistingTimeline?: boolean }
    ) => Promise<string | null>;
    resetLogInspectorState: (options?: { clearSelectedRun?: boolean }) => void;
  };
};

type ActivateThreadArgs = {
  threadId: string;
  options?: { preferredRunId?: string | null };
  refs: {
    activeThreadIdRef: RefLike<string | null>;
    shouldAutoScrollRef: RefLike<boolean>;
  };
  actions: {
    setActiveThreadId: Setter<string | null>;
    setDurableRecoveryNotice: Setter<string | null>;
  };
  operations: {
    loadThreadMessages: (
      threadId: string,
      options?: {
        preferredRunId?: string | null;
        background?: boolean;
        skipTimelineReload?: boolean;
        preserveExistingTimeline?: boolean;
      }
    ) => Promise<string | null | undefined>;
  };
};

export function applyHydratedTranscriptState(args: {
  messages: MessageDto[];
  selectedRunId: string | null;
  runs: RunDto[];
  actions: {
    setChatPhase: Setter<ChatPhase>;
    setError: Setter<string | null>;
    setLiveAssistantDraft: Setter<LiveAssistantDraft | null>;
    setMessages: Setter<MessageDto[]>;
    setOptimisticUserMessage: Setter<MessageDto | null>;
    setRecentRuns: Setter<RunDto[]>;
    setRecentRunsError: Setter<string | null>;
    setSelectedRunId: Setter<string | null>;
  };
}) {
  const { messages, selectedRunId, runs, actions } = args;
  const hasPersistedAssistantForSelectedRun =
    selectedRunId !== null && messages.some((message) => message.runId === selectedRunId && assistantMessageHasVisibleContent(message));

  actions.setMessages(messages);
  actions.setRecentRuns(runs);
  actions.setSelectedRunId(selectedRunId);
  actions.setOptimisticUserMessage(null);
  actions.setLiveAssistantDraft((current) => {
    if (!current) {
      return null;
    }

    if (current.runId !== selectedRunId) {
      return null;
    }

    return hasPersistedAssistantForSelectedRun ? null : current;
  });
  actions.setRecentRunsError(null);
  actions.setError(null);
  if (messages.some(assistantMessageHasVisibleContent)) {
    actions.setChatPhase('idle');
  }
}

export async function runLoadThreadMessages({ threadId, options, refs, actions, operations }: LoadThreadMessagesArgs) {
  const background = options?.background === true;
  refs.messagesRequestIdRef.current += 1;
  const requestId = refs.messagesRequestIdRef.current;
  refs.messagesAbortControllerRef.current?.abort();
  const controller = new AbortController();
  refs.messagesAbortControllerRef.current = controller;
  if (!background) {
    actions.setLoadingMessages(true);
  }
  if (!refs.logOpenRef.current) {
    operations.resetLogInspectorState();
  } else {
    actions.setRecentRunsLoading(true);
    actions.setRecentRunsError(null);
  }

  try {
    const nextMessages = await operations.hydrateTranscript(threadId, controller.signal);

    if (controller.signal.aborted || requestId !== refs.messagesRequestIdRef.current) {
      return;
    }

    if (!refs.logOpenRef.current) {
      operations.applyHydratedTranscript({
        messages: nextMessages,
        selectedRunId: null,
        runs: []
      });
      return null;
    }

    operations.applyHydratedTranscript({
      messages: nextMessages,
      selectedRunId: null,
      runs: []
    });
    if (options?.skipTimelineReload) {
      return null;
    }

    return await operations.loadLogInspector(threadId, nextMessages, {
      preferredRunId: options?.preferredRunId,
      preserveExistingTimeline: options?.preserveExistingTimeline === true
    });
  } catch (loadError) {
    if (controller.signal.aborted || requestId !== refs.messagesRequestIdRef.current) {
      return;
    }

    operations.resetLogInspectorState();
    actions.setLiveAssistantDraft(null);
    actions.setOptimisticUserMessage(null);
    actions.setError(loadError instanceof Error ? loadError.message : 'Failed to load thread messages');
    return null;
  } finally {
    if (requestId === refs.messagesRequestIdRef.current) {
      refs.messagesAbortControllerRef.current = null;
      if (!background) {
        actions.setLoadingMessages(false);
      }
    }
  }
}

export async function runActivateThread({ threadId, options, refs, actions, operations }: ActivateThreadArgs) {
  actions.setActiveThreadId(threadId);
  refs.activeThreadIdRef.current = threadId;
  refs.shouldAutoScrollRef.current = true;
  const restoredRunId = await operations.loadThreadMessages(threadId, options);
  if (options?.preferredRunId) {
    actions.setDurableRecoveryNotice(
      restoredRunId
        ? 'Restored the focused run from durable records. Live stream drafts are transient and may not survive refresh.'
        : null
    );
  } else {
    actions.setDurableRecoveryNotice(null);
  }

  return restoredRunId;
}
