import type { MessageDto, RunDto, ThreadMessagesPageInfoDto } from '@agent-infra/contracts';

import { fetchThreadMessagesResponse } from '../repo/chat-api.js';
import { assistantMessageHasVisibleContent } from '../service/message-visibility.js';
import { INITIAL_MESSAGE_PAGE_LIMIT, mergeMessageWindow, mergeThreadMessagesPageInfo } from '../service/chat-runtime.js';
import type { LiveAssistantDraft } from '../types/live-assistant-draft.js';
import type { ChatPhase } from '../types/runtime.js';

type Updater<T> = T | ((current: T) => T);
type Setter<T> = (next: Updater<T>) => void;
type RefLike<T> = { current: T };

type ApplyHydratedTranscriptArgs = {
  messages: MessageDto[];
  pageInfo: ThreadMessagesPageInfoDto | null;
  selectedRunId: string | null;
  runs: RunDto[];
};

export type HydratedTranscriptPage = {
  messages: MessageDto[];
  pageInfo: ThreadMessagesPageInfoDto | null;
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
    setHistoryLoading: Setter<boolean>;
    setLiveAssistantDraft: Setter<LiveAssistantDraft | null>;
    setLoadingMessages: Setter<boolean>;
    setMessagePageInfo: Setter<ThreadMessagesPageInfoDto | null>;
    setOptimisticUserMessage: Setter<MessageDto | null>;
    setRecentRunsError: Setter<string | null>;
    setRecentRunsLoading: Setter<boolean>;
  };
  operations: {
    applyHydratedTranscript: (args: ApplyHydratedTranscriptArgs) => void;
    hydrateTranscript: (threadId: string, signal: AbortSignal) => Promise<HydratedTranscriptPage>;
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

type LoadOlderMessagesArgs = {
  threadId: string | null;
  beforeCursor: string | null;
  historyLoading: boolean;
  refs: {
    activeThreadIdRef: RefLike<string | null>;
  };
  actions: {
    setError: Setter<string | null>;
    setHistoryLoading: Setter<boolean>;
    setMessages: Setter<MessageDto[]>;
    setMessagePageInfo: Setter<ThreadMessagesPageInfoDto | null>;
  };
};

export function applyHydratedTranscriptState(args: {
  messages: MessageDto[];
  pageInfo: ThreadMessagesPageInfoDto | null;
  selectedRunId: string | null;
  runs: RunDto[];
  actions: {
    setChatPhase: Setter<ChatPhase>;
    setError: Setter<string | null>;
    setLiveAssistantDraft: Setter<LiveAssistantDraft | null>;
    setMessages: Setter<MessageDto[]>;
    setMessagePageInfo: Setter<ThreadMessagesPageInfoDto | null>;
    setOptimisticUserMessage: Setter<MessageDto | null>;
    setRecentRuns: Setter<RunDto[]>;
    setRecentRunsError: Setter<string | null>;
    setSelectedRunId: Setter<string | null>;
  };
}) {
  const { messages, pageInfo, selectedRunId, runs, actions } = args;
  const hasPersistedAssistantForSelectedRun =
    selectedRunId !== null && messages.some((message) => message.runId === selectedRunId && assistantMessageHasVisibleContent(message));

  actions.setMessages(messages);
  actions.setMessagePageInfo(pageInfo);
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
    actions.setHistoryLoading(false);
  }
  if (!refs.logOpenRef.current) {
    operations.resetLogInspectorState();
  } else {
    actions.setRecentRunsLoading(true);
    actions.setRecentRunsError(null);
  }

  try {
    const hydratedTranscriptPage = await operations.hydrateTranscript(threadId, controller.signal);

    if (controller.signal.aborted || requestId !== refs.messagesRequestIdRef.current) {
      return;
    }

    const nextMessages = hydratedTranscriptPage.messages;

    if (!refs.logOpenRef.current) {
      operations.applyHydratedTranscript({
        messages: nextMessages,
        pageInfo: hydratedTranscriptPage.pageInfo,
        selectedRunId: null,
        runs: []
      });
      return null;
    }

    operations.applyHydratedTranscript({
      messages: nextMessages,
      pageInfo: hydratedTranscriptPage.pageInfo,
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
    actions.setMessagePageInfo(null);
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

export async function runLoadOlderMessages({ threadId, beforeCursor, historyLoading, refs, actions }: LoadOlderMessagesArgs) {
  if (!threadId || !beforeCursor || historyLoading) {
    return false;
  }

  actions.setHistoryLoading(true);
  actions.setError(null);

  try {
    const result = await fetchThreadMessagesResponse(threadId, {
      before: beforeCursor,
      limit: INITIAL_MESSAGE_PAGE_LIMIT
    });
    if (!result.ok) {
      throw new Error(result.error ?? `Failed to load older messages (${result.status})`);
    }

    if (refs.activeThreadIdRef.current !== threadId) {
      return false;
    }

    actions.setMessages((current) => mergeMessageWindow(current, result.data.messages ?? []));
    actions.setMessagePageInfo((current) => mergeThreadMessagesPageInfo(current, result.data.pageInfo ?? null, 'prepend'));
    return true;
  } catch (loadError) {
    actions.setError(loadError instanceof Error ? loadError.message : 'Failed to load older messages');
    return false;
  } finally {
    actions.setHistoryLoading(false);
  }
}
