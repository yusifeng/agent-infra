import type { RunDto } from '@agent-infra/contracts';
import type { LiveAssistantDraft } from '@agent-infra/durable-chat-client';

import {
  clearStoredLiveAssistantDraft,
  persistStoredLiveAssistantDraft,
  readStoredLiveAssistantDraft
} from '@/features/durable-chat/repo/live-draft-storage';
import {
  shouldClearPersistedLiveDraft,
  shouldPersistActiveLiveDraft,
  shouldRestorePersistedLiveDraft
} from '@/features/durable-chat/runtime/live-draft-persistence';

export function syncStoredLiveDraft(args: {
  activeThreadId: string | null;
  activeResponseRun: RunDto | null;
  hasHydratedThread: boolean;
  liveAssistantDraft: LiveAssistantDraft | null;
}) {
  const { activeThreadId, activeResponseRun, hasHydratedThread, liveAssistantDraft } = args;

  if (
    shouldPersistActiveLiveDraft({
      activeThreadId,
      activeResponseRun,
      liveAssistantDraft
    })
  ) {
    persistStoredLiveAssistantDraft(activeThreadId!, liveAssistantDraft!);
    return 'persisted';
  }

  if (
    shouldClearPersistedLiveDraft({
      activeThreadId,
      activeResponseRun,
      hasHydratedThread,
      liveAssistantDraft
    })
  ) {
    clearStoredLiveAssistantDraft(activeThreadId!);
    return 'cleared';
  }

  return 'noop';
}

export function restoreStoredDraftForActiveRun(args: {
  activeThreadId: string | null;
  activeResponseRun: RunDto | null;
  liveAssistantDraft: LiveAssistantDraft | null;
}) {
  const { activeThreadId, activeResponseRun, liveAssistantDraft } = args;

  if (
    !shouldRestorePersistedLiveDraft({
      activeThreadId,
      activeResponseRun,
      liveAssistantDraft
    })
  ) {
    return null;
  }

  const runId = activeResponseRun!.id;
  const restoredDraft = readStoredLiveAssistantDraft(activeThreadId!);
  if (!restoredDraft || restoredDraft.runId !== runId) {
    return null;
  }

  return {
    restoredRunId: runId,
    draft: {
      ...restoredDraft,
      source: 'restored' as const
    }
  };
}

export function resolveRestoredRunRefreshId(args: {
  activeThreadId: string | null;
  activeResponseRun: RunDto | null;
  restoredRunRefreshId: string | null;
}) {
  const { activeThreadId, activeResponseRun, restoredRunRefreshId } = args;
  if (!restoredRunRefreshId) {
    return null;
  }

  if (!activeResponseRun || activeResponseRun.id !== restoredRunRefreshId || activeResponseRun.threadId !== activeThreadId) {
    return null;
  }

  return ['queued', 'running'].includes(activeResponseRun.status) ? restoredRunRefreshId : null;
}
