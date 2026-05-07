import type { LiveAssistantDraft } from '@agent-infra/durable-chat-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  startRestoredLiveDraftRefreshLoop,
  shouldClearPersistedLiveDraft,
  shouldPersistActiveLiveDraft,
  shouldRefreshRestoredLiveDraft,
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
    source: 'live',
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

  it('refreshes only restored drafts that still match the active running run', () => {
    expect(
      shouldRefreshRestoredLiveDraft({
        activeThreadId: 'thread-1',
        activeResponseRun: createRun({ status: 'running' }),
        restoredRunId: null,
        liveAssistantDraft: {
          ...createLiveDraft(),
          source: 'restored'
        }
      })
    ).toBe(true);

    expect(
      shouldRefreshRestoredLiveDraft({
        activeThreadId: 'thread-1',
        activeResponseRun: createRun({ status: 'running' }),
        restoredRunId: null,
        liveAssistantDraft: createLiveDraft()
      })
    ).toBe(false);

    expect(
      shouldRefreshRestoredLiveDraft({
        activeThreadId: 'thread-1',
        activeResponseRun: createRun({ status: 'completed' }),
        restoredRunId: null,
        liveAssistantDraft: {
          ...createLiveDraft(),
          source: 'restored'
        }
      })
    ).toBe(false);

    expect(
      shouldRefreshRestoredLiveDraft({
        activeThreadId: 'thread-1',
        activeResponseRun: createRun({ status: 'running' }),
        restoredRunId: 'run-1',
        liveAssistantDraft: null
      })
    ).toBe(true);
  });
});

describe('startRestoredLiveDraftRefreshLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for each refresh to settle before scheduling the next one', async () => {
    let releaseRefresh!: () => void;
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseRefresh = () => resolve();
        })
    );

    const stop = startRestoredLiveDraftRefreshLoop({ refresh, intervalMs: 2000 });
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    releaseRefresh();
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(refresh).toHaveBeenCalledTimes(2);

    stop();
  });

  it('stops scheduling future refreshes after cancellation', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);

    const stop = startRestoredLiveDraftRefreshLoop({ refresh, intervalMs: 2000 });
    expect(refresh).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    stop();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
