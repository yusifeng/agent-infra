import type { LoadThreadMessagesResult } from '@agent-infra/durable-chat-client';
import {
  applyRunAssistantEventToLiveDraft,
  liveDraftFromRunSnapshot,
  resolveAssistantStreamChatPhase
} from '@agent-infra/durable-chat-client';
import type { RunAttachStreamEventDto, RunDto } from '@agent-infra/contracts';

import { resolveSettledChatPhase, upsertRun } from '@/features/durable-chat/service/chat-runtime';
import type { LiveAssistantDraft, LiveAssistantDraftsByRunId } from '@/features/durable-chat/types/live-assistant-draft';
import type { ChatPhase } from '@/features/durable-chat/types/runtime';

type Updater<T> = T | ((current: T) => T);
type Setter<T> = (next: Updater<T>) => void;
type RefLike<T> = { current: T };

type ApplyAttachRunEventArgs = {
  event: RunAttachStreamEventDto;
  requestId: number;
  threadId: string;
  refs: {
    activeResponseRunsRef: RefLike<RunDto[]>;
    attachRequestIdRef: RefLike<number>;
    attachRequestIdsByRunIdRef: RefLike<Map<string, number>>;
    attachedRunIdsRef: RefLike<Set<string>>;
    attachVersionsByRunIdRef: RefLike<Map<string, number>>;
    activeThreadIdRef: RefLike<string | null>;
    logOpenRef: RefLike<boolean>;
  };
  actions: {
    setActiveResponseRun: Setter<RunDto | null>;
    setActiveResponseRuns: Setter<RunDto[]>;
    setChatPhase: Setter<ChatPhase>;
    setError: Setter<string | null>;
    setLiveAssistantDraft: Setter<LiveAssistantDraft | null>;
    setLiveAssistantDraftsByRunId: Setter<LiveAssistantDraftsByRunId>;
    setLiveStreamRunId: Setter<string | null>;
    setLiveStreamRunIds: Setter<string[]>;
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

function upsertActiveRun(runs: RunDto[], run: RunDto | null | undefined) {
  if (!run) {
    return runs;
  }

  const withoutRun = runs.filter((currentRun) => currentRun.id !== run.id);
  return runIsActive(run) ? [...withoutRun, run] : withoutRun;
}

function addId(ids: string[], id: string) {
  return ids.includes(id) ? ids : [...ids, id];
}

function removeId(ids: string[], id: string) {
  return ids.filter((currentId) => currentId !== id);
}

function isCurrentAttachRequest(args: Pick<ApplyAttachRunEventArgs, 'event' | 'requestId' | 'threadId' | 'refs'>) {
  const { event, requestId, threadId, refs } = args;
  return (
    requestId === refs.attachRequestIdsByRunIdRef.current.get(event.runId) &&
    refs.activeThreadIdRef.current === threadId &&
    refs.attachedRunIdsRef.current.has(event.runId)
  );
}

export function applyAttachRunEvent(args: ApplyAttachRunEventArgs) {
  const { actions, event, operations, refs, requestId, threadId } = args;
  if (!isCurrentAttachRequest(args)) {
    return false;
  }

  if (event.type === 'run.attach_unavailable') {
    actions.setLiveStreamRunIds((current) => removeId(current, event.runId));
    actions.setLiveStreamRunId((current) => (current === event.runId ? null : current));
    actions.setActiveResponseRun(runIsActive(event.run) ? event.run ?? null : null);
    actions.setActiveResponseRuns((current) => upsertActiveRun(current, event.run));
    void operations.loadThreadMessages(threadId, {
      background: true,
      preferredRunId: event.runId,
      preserveExistingTimeline: refs.logOpenRef.current,
      skipTimelineReload: refs.logOpenRef.current
    });
    return true;
  }

  const currentVersion = refs.attachVersionsByRunIdRef.current.get(event.runId) ?? 0;
  if (event.type !== 'run.snapshot' && event.version <= currentVersion) {
    return false;
  }
  refs.attachVersionsByRunIdRef.current.set(event.runId, event.version);
  actions.setLiveStreamRunIds((current) => addId(current, event.runId));
  actions.setLiveStreamRunId(event.runId);

  if (event.type === 'run.snapshot') {
    actions.setRecentRuns((current) => upsertRun(current, event.run));
    actions.setActiveResponseRun(runIsActive(event.run) ? event.run : null);
    actions.setActiveResponseRuns((current) => upsertActiveRun(current, event.run));
    actions.setLoadingThreadId(runIsActive(event.run) ? threadId : null);
    const draft = liveDraftFromRunSnapshot(event);
    actions.setLiveAssistantDraftsByRunId((current) => {
      const next = { ...current };
      if (draft) {
        next[event.runId] = draft;
      } else {
        delete next[event.runId];
      }
      return next;
    });
    actions.setLiveAssistantDraft(draft);
    actions.setChatPhase(draft?.eventType === 'streaming' ? 'streaming' : 'thinking');
    return false;
  }

  if (event.type === 'run.assistant') {
    actions.setChatPhase(resolveAssistantStreamChatPhase(event));
    actions.setLoadingThreadId(threadId);
    actions.setLiveAssistantDraftsByRunId((current) => {
      const nextDraft = applyRunAssistantEventToLiveDraft(current[event.runId] ?? null, event);
      return {
        ...current,
        [event.runId]: nextDraft
      };
    });
    actions.setLiveAssistantDraft((current) => applyRunAssistantEventToLiveDraft(current, event));
    return false;
  }

  if (event.type === 'run.state') {
    actions.setRecentRuns((current) => upsertRun(current, event.run));
    actions.setActiveResponseRun(runIsActive(event.run) ? event.run : null);
    actions.setActiveResponseRuns((current) => upsertActiveRun(current, event.run));
    actions.setLoadingThreadId(runIsActive(event.run) ? threadId : null);
    return false;
  }

  if (event.type === 'run.failed') {
    const hasOtherActiveRun = refs.activeResponseRunsRef.current.some((run) => run.id !== event.runId && runIsActive(run));
    const failedRun = event.run;
    if (failedRun) {
      actions.setRecentRuns((current) => upsertRun(current, failedRun));
    }
    actions.setActiveResponseRun(hasOtherActiveRun ? refs.activeResponseRunsRef.current.find((run) => run.id !== event.runId && runIsActive(run)) ?? null : null);
    actions.setActiveResponseRuns((current) => current.filter((run) => run.id !== event.runId));
    actions.setError(event.error);
    actions.setLiveStreamRunIds((current) => removeId(current, event.runId));
    actions.setLiveStreamRunId((current) => (current === event.runId ? null : current));
    actions.setLoadingThreadId(hasOtherActiveRun ? threadId : null);
    actions.setPersistingTurn(false);
    actions.setChatPhase(hasOtherActiveRun ? 'thinking' : 'failed');
    actions.setLiveAssistantDraftsByRunId((current) => {
      const next = { ...current };
      delete next[event.runId];
      return next;
    });
    actions.setLiveAssistantDraft((current) => (current?.runId === event.runId ? null : current));
    void operations.reconcileCompletedTurn(threadId, event.runId, requestId);
    return true;
  }

  const hasOtherActiveRun = refs.activeResponseRunsRef.current.some((run) => run.id !== event.runId && runIsActive(run));
  actions.setRecentRuns((current) => upsertRun(current, event.run));
  actions.setActiveResponseRun(hasOtherActiveRun ? refs.activeResponseRunsRef.current.find((run) => run.id !== event.runId && runIsActive(run)) ?? null : null);
  actions.setActiveResponseRuns((current) => current.filter((run) => run.id !== event.runId));
  actions.setError(null);
  actions.setLiveStreamRunIds((current) => removeId(current, event.runId));
  actions.setLiveStreamRunId((current) => (current === event.runId ? null : current));
  actions.setLoadingThreadId(hasOtherActiveRun ? threadId : null);
  actions.setPersistingTurn(!hasOtherActiveRun);
  actions.setChatPhase(hasOtherActiveRun ? 'thinking' : resolveSettledChatPhase);
  void operations.reconcileCompletedTurn(threadId, event.runId, requestId);
  return true;
}
