import type { RunDto } from '@agent-infra/contracts';
import type { LiveAssistantDraft } from '@agent-infra/durable-chat-client';

function isActiveStreamingRun(run: RunDto | null) {
  return run?.status === 'queued' || run?.status === 'running';
}

export function shouldPersistActiveLiveDraft(args: {
  activeThreadId: string | null;
  activeResponseRun: RunDto | null;
  liveAssistantDraft: LiveAssistantDraft | null;
}) {
  const { activeThreadId, activeResponseRun, liveAssistantDraft } = args;
  if (!activeThreadId || !liveAssistantDraft || !activeResponseRun || !isActiveStreamingRun(activeResponseRun)) {
    return false;
  }

  return activeResponseRun.threadId === activeThreadId && activeResponseRun.id === liveAssistantDraft.runId;
}

export function shouldClearPersistedLiveDraft(args: {
  activeThreadId: string | null;
  activeResponseRun: RunDto | null;
  hasHydratedThread: boolean;
  liveAssistantDraft: LiveAssistantDraft | null;
}) {
  const { activeThreadId, activeResponseRun, hasHydratedThread, liveAssistantDraft } = args;
  if (!activeThreadId || !hasHydratedThread || liveAssistantDraft) {
    return false;
  }

  return !activeResponseRun || ['completed', 'failed', 'cancelled'].includes(activeResponseRun.status);
}

export function shouldRestorePersistedLiveDraft(args: {
  activeThreadId: string | null;
  activeResponseRun: RunDto | null;
  liveAssistantDraft: LiveAssistantDraft | null;
}) {
  const { activeThreadId, activeResponseRun, liveAssistantDraft } = args;
  if (!activeThreadId || liveAssistantDraft || !isActiveStreamingRun(activeResponseRun)) {
    return false;
  }

  return true;
}
