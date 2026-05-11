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

export function shouldRefreshRestoredLiveDraft(args: {
  activeThreadId: string | null;
  activeResponseRun: RunDto | null;
  liveAssistantDraft: LiveAssistantDraft | null;
  restoredRunId: string | null;
}) {
  const { activeThreadId, activeResponseRun, liveAssistantDraft, restoredRunId } = args;
  const trackedRunId = restoredRunId ?? (liveAssistantDraft?.source === 'restored' ? liveAssistantDraft.runId : null);
  if (
    !activeThreadId ||
    !activeResponseRun ||
    !trackedRunId ||
    !isActiveStreamingRun(activeResponseRun)
  ) {
    return false;
  }

  return activeResponseRun.threadId === activeThreadId && activeResponseRun.id === trackedRunId;
}

export function startRestoredLiveDraftRefreshLoop(args: {
  intervalMs?: number;
  refresh: () => Promise<void>;
}) {
  const { refresh, intervalMs = 2000 } = args;
  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const run = async () => {
    if (cancelled) {
      return;
    }

    try {
      await refresh();
    } catch {
      // Ignore transient refresh failures; the next scheduled pass will retry.
    }

    if (!cancelled) {
      timeoutId = setTimeout(() => {
        void run();
      }, intervalMs);
    }
  };

  void run();

  return () => {
    cancelled = true;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  };
}
