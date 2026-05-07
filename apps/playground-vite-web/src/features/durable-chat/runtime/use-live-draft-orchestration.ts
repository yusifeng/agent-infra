import type { RunDto } from '@agent-infra/contracts';
import type { LiveAssistantDraft } from '@agent-infra/durable-chat-client';
import { useEffect, useRef, useState } from 'react';

import {
  startRestoredLiveDraftRefreshLoop,
  shouldRefreshRestoredLiveDraft
} from '@/features/durable-chat/runtime/live-draft-persistence';
import {
  resolveRestoredRunRefreshId,
  restoreStoredDraftForActiveRun,
  syncStoredLiveDraft
} from '@/features/durable-chat/runtime/live-draft-recovery';

type UseLiveDraftOrchestrationArgs = {
  activeThreadId: string | null;
  activeResponseRun: RunDto | null;
  hasHydratedActiveThread: boolean;
  liveAssistantDraft: LiveAssistantDraft | null;
  setLiveAssistantDraft: (next: LiveAssistantDraft | null) => void;
  loadThreadMessages: (
    threadId: string,
    options?: {
      preferredRunId?: string | null;
      background?: boolean;
      skipTimelineReload?: boolean;
      preserveExistingTimeline?: boolean;
    }
  ) => Promise<unknown>;
};

export function useLiveDraftOrchestration(args: UseLiveDraftOrchestrationArgs) {
  const {
    activeThreadId,
    activeResponseRun,
    hasHydratedActiveThread,
    liveAssistantDraft,
    setLiveAssistantDraft,
    loadThreadMessages
  } = args;
  const [restoredRunRefreshId, setRestoredRunRefreshId] = useState<string | null>(null);
  const loadThreadMessagesRef = useRef(loadThreadMessages);

  useEffect(() => {
    loadThreadMessagesRef.current = loadThreadMessages;
  }, [loadThreadMessages]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    syncStoredLiveDraft({
      activeThreadId,
      activeResponseRun,
      hasHydratedThread: hasHydratedActiveThread,
      liveAssistantDraft
    });
  }, [activeResponseRun, activeThreadId, hasHydratedActiveThread, liveAssistantDraft]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const restored = restoreStoredDraftForActiveRun({
      activeThreadId,
      activeResponseRun,
      liveAssistantDraft
    });
    if (!restored) {
      return;
    }

    setRestoredRunRefreshId(restored.restoredRunId);
    setLiveAssistantDraft(restored.draft);
  }, [activeResponseRun, activeThreadId, liveAssistantDraft, setLiveAssistantDraft]);

  useEffect(() => {
    if (!restoredRunRefreshId) {
      return;
    }

    const nextRefreshId = resolveRestoredRunRefreshId({
      activeThreadId,
      activeResponseRun,
      restoredRunRefreshId
    });
    if (nextRefreshId !== restoredRunRefreshId) {
      setRestoredRunRefreshId(nextRefreshId);
    }
  }, [activeResponseRun, activeThreadId, restoredRunRefreshId]);

  useEffect(() => {
    if (
      !shouldRefreshRestoredLiveDraft({
        activeThreadId,
        activeResponseRun,
        liveAssistantDraft,
        restoredRunId: restoredRunRefreshId
      })
    ) {
      return;
    }

    const threadId = activeThreadId!;
    return startRestoredLiveDraftRefreshLoop({
      refresh: async () => {
        await loadThreadMessagesRef.current(threadId, {
          background: true,
          skipTimelineReload: true,
          preserveExistingTimeline: true
        });
      }
    });
  }, [activeResponseRun, activeThreadId, liveAssistantDraft, restoredRunRefreshId]);
}
