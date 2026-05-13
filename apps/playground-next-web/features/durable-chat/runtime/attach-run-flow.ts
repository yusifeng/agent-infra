import type { LoadThreadMessagesResult } from '@agent-infra/durable-chat-client';
import {
  applyRunAssistantEventToLiveDraft,
  liveDraftFromRunSnapshot,
  resolveAssistantStreamChatPhase
} from '@agent-infra/durable-chat-client';
import type { RunAttachStreamEventDto, RunDto } from '@agent-infra/contracts';

import { resolveSettledChatPhase, upsertRun } from '@/features/durable-chat/service/chat-runtime';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';
import type { ChatPhase } from '@/features/durable-chat/types/runtime';

type Updater<T> = T | ((current: T) => T);
type Setter<T> = (next: Updater<T>) => void;
type RefLike<T> = { current: T };

type ApplyAttachRunEventArgs = {
  event: RunAttachStreamEventDto;
  requestId: number;
  threadId: string;
  refs: {
    attachRequestIdRef: RefLike<number>;
    attachRunIdRef: RefLike<string | null>;
    attachVersionRef: RefLike<number>;
    activeThreadIdRef: RefLike<string | null>;
    logOpenRef: RefLike<boolean>;
  };
  actions: {
    setActiveResponseRun: Setter<RunDto | null>;
    setChatPhase: Setter<ChatPhase>;
    setError: Setter<string | null>;
    setLiveAssistantDraft: Setter<LiveAssistantDraft | null>;
    setLiveStreamRunId: Setter<string | null>;
    setLoadingThreadId: Setter<string | null>;
    setPersistingTurn: Setter<boolean>;
    setRecentRuns: Setter<RunDto[]>;
  };
  operations: {
    loadThreadMessages: (
      threadId: string,
      options?: {
        background?: boolean;
        preferredRunId?: string | null;
        preserveExistingTimeline?: boolean;
        skipTimelineReload?: boolean;
      }
    ) => Promise<LoadThreadMessagesResult>;
    reconcileCompletedTurn: (threadId: string, runId: string, requestId: number) => Promise<void>;
  };
};

function runIsActive(run: RunDto | null | undefined) {
  return run?.status === 'queued' || run?.status === 'running';
}

function isCurrentAttachRequest(args: Pick<ApplyAttachRunEventArgs, 'event' | 'requestId' | 'threadId' | 'refs'>) {
  const { event, requestId, threadId, refs } = args;
  return (
    requestId === refs.attachRequestIdRef.current &&
    refs.activeThreadIdRef.current === threadId &&
    refs.attachRunIdRef.current === event.runId
  );
}

export function applyAttachRunEvent(args: ApplyAttachRunEventArgs) {
  const { actions, event, operations, refs, requestId, threadId } = args;
  if (!isCurrentAttachRequest(args)) {
    return false;
  }

  if (event.type === 'run.attach_unavailable') {
    actions.setLiveStreamRunId(null);
    actions.setActiveResponseRun(runIsActive(event.run) ? event.run ?? null : null);
    void operations.loadThreadMessages(threadId, {
      background: true,
      preferredRunId: event.runId,
      preserveExistingTimeline: refs.logOpenRef.current,
      skipTimelineReload: refs.logOpenRef.current
    });
    return true;
  }

  if (event.type !== 'run.snapshot' && event.version <= refs.attachVersionRef.current) {
    return false;
  }
  refs.attachVersionRef.current = event.version;
  actions.setLiveStreamRunId(event.runId);

  if (event.type === 'run.snapshot') {
    actions.setRecentRuns((current) => upsertRun(current, event.run));
    actions.setActiveResponseRun(runIsActive(event.run) ? event.run : null);
    actions.setLoadingThreadId(runIsActive(event.run) ? threadId : null);
    const draft = liveDraftFromRunSnapshot(event);
    actions.setLiveAssistantDraft(draft);
    actions.setChatPhase(draft?.eventType === 'streaming' ? 'streaming' : 'thinking');
    return false;
  }

  if (event.type === 'run.assistant') {
    actions.setChatPhase(resolveAssistantStreamChatPhase(event));
    actions.setLoadingThreadId(threadId);
    actions.setLiveAssistantDraft((current) => applyRunAssistantEventToLiveDraft(current, event));
    return false;
  }

  if (event.type === 'run.state') {
    actions.setRecentRuns((current) => upsertRun(current, event.run));
    actions.setActiveResponseRun(runIsActive(event.run) ? event.run : null);
    actions.setLoadingThreadId(runIsActive(event.run) ? threadId : null);
    return false;
  }

  if (event.type === 'run.failed') {
    const failedRun = event.run;
    if (failedRun) {
      actions.setRecentRuns((current) => upsertRun(current, failedRun));
    }
    actions.setActiveResponseRun(null);
    actions.setError(event.error);
    actions.setLiveStreamRunId(null);
    actions.setLoadingThreadId(null);
    actions.setPersistingTurn(false);
    actions.setChatPhase('failed');
    actions.setLiveAssistantDraft((current) => (current?.runId === event.runId ? null : current));
    void operations.reconcileCompletedTurn(threadId, event.runId, requestId);
    return true;
  }

  actions.setRecentRuns((current) => upsertRun(current, event.run));
  actions.setActiveResponseRun(null);
  actions.setError(null);
  actions.setLiveStreamRunId(null);
  actions.setLoadingThreadId(null);
  actions.setPersistingTurn(true);
  actions.setChatPhase(resolveSettledChatPhase);
  void operations.reconcileCompletedTurn(threadId, event.runId, requestId);
  return true;
}
