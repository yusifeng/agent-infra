import type { LiveAssistantDraft } from '@agent-infra/durable-chat-client';
import { describe, expect, it } from 'vitest';

import {
  shouldClearPersistedLiveDraft,
  shouldPersistActiveLiveDraft,
  shouldRestorePersistedLiveDraft
} from '@/features/durable-chat/runtime/live-draft-persistence';

function createRun(overrides: Partial<{ id: string; threadId: string; status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' }> = {}) {
  return {
    id: overrides.id ?? 'run-1',
    threadId: overrides.threadId ?? 'thread-1',
    triggerMessageId: null,
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    status: overrides.status ?? 'running',
    usage: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z'
  };
}

function createLiveDraft(runId = 'run-1'): LiveAssistantDraft {
  return {
    runId,
    messageId: 'assistant-1',
    committedText: '',
    partialText: 'hello',
    segmentText: 'hello',
    segmentTextMessageId: 'assistant-1',
    partialReasoning: null,
    segmentReasoningMessageId: null,
    activeTools: [],
    eventType: 'streaming',
    segments: [
      {
        id: 'assistant-1:0',
        messageId: 'assistant-1',
        text: 'hello',
        reasoning: null,
        tools: [],
        eventType: 'streaming'
      }
    ]
  };
}

describe('live draft persistence guards', () => {
  it('persists only when the live draft matches the active thread and active run', () => {
    expect(
      shouldPersistActiveLiveDraft({
        activeThreadId: 'thread-1',
        activeResponseRun: createRun(),
        liveAssistantDraft: createLiveDraft()
      })
    ).toBe(true);

    expect(
      shouldPersistActiveLiveDraft({
        activeThreadId: 'thread-2',
        activeResponseRun: createRun({ threadId: 'thread-1' }),
        liveAssistantDraft: createLiveDraft()
      })
    ).toBe(false);

    expect(
      shouldPersistActiveLiveDraft({
        activeThreadId: 'thread-1',
        activeResponseRun: createRun({ id: 'run-1' }),
        liveAssistantDraft: createLiveDraft('run-2')
      })
    ).toBe(false);
  });

  it('clears stored drafts only after terminal runs and restores only for active runs', () => {
    expect(
      shouldClearPersistedLiveDraft({
        activeThreadId: 'thread-1',
        activeResponseRun: null,
        hasHydratedThread: false,
        liveAssistantDraft: null
      })
    ).toBe(false);

    expect(
      shouldClearPersistedLiveDraft({
        activeThreadId: 'thread-1',
        activeResponseRun: null,
        hasHydratedThread: true,
        liveAssistantDraft: null
      })
    ).toBe(true);

    expect(
      shouldClearPersistedLiveDraft({
        activeThreadId: 'thread-1',
        activeResponseRun: createRun({ status: 'completed' }),
        hasHydratedThread: true,
        liveAssistantDraft: null
      })
    ).toBe(true);

    expect(
      shouldRestorePersistedLiveDraft({
        activeThreadId: 'thread-1',
        activeResponseRun: createRun({ status: 'running' }),
        liveAssistantDraft: null
      })
    ).toBe(true);

    expect(
      shouldRestorePersistedLiveDraft({
        activeThreadId: 'thread-1',
        activeResponseRun: createRun({ status: 'completed' }),
        liveAssistantDraft: null
      })
    ).toBe(false);
  });
});
