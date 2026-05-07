import type { LiveAssistantDraft } from '@agent-infra/durable-chat-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  clearStoredLiveAssistantDraft: vi.fn(),
  persistStoredLiveAssistantDraft: vi.fn(),
  readStoredLiveAssistantDraft: vi.fn()
}));

vi.mock('@/features/durable-chat/repo/live-draft-storage', () => ({
  clearStoredLiveAssistantDraft: storageMocks.clearStoredLiveAssistantDraft,
  persistStoredLiveAssistantDraft: storageMocks.persistStoredLiveAssistantDraft,
  readStoredLiveAssistantDraft: storageMocks.readStoredLiveAssistantDraft
}));

import {
  resolveRestoredRunRefreshId,
  restoreStoredDraftForActiveRun,
  syncStoredLiveDraft
} from '@/features/durable-chat/runtime/live-draft-recovery';

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
    segments: []
  };
}

describe('live draft recovery helpers', () => {
  beforeEach(() => {
    storageMocks.clearStoredLiveAssistantDraft.mockReset();
    storageMocks.persistStoredLiveAssistantDraft.mockReset();
    storageMocks.readStoredLiveAssistantDraft.mockReset();
  });

  it('persists a matching active live draft', () => {
    expect(
      syncStoredLiveDraft({
        activeThreadId: 'thread-1',
        activeResponseRun: createRun(),
        hasHydratedThread: false,
        liveAssistantDraft: createLiveDraft()
      })
    ).toBe('persisted');

    expect(storageMocks.persistStoredLiveAssistantDraft).toHaveBeenCalledWith('thread-1', createLiveDraft());
  });

  it('clears a stored draft after a hydrated thread reaches a terminal state', () => {
    expect(
      syncStoredLiveDraft({
        activeThreadId: 'thread-1',
        activeResponseRun: createRun({ status: 'completed' }),
        hasHydratedThread: true,
        liveAssistantDraft: null
      })
    ).toBe('cleared');

    expect(storageMocks.clearStoredLiveAssistantDraft).toHaveBeenCalledWith('thread-1');
  });

  it('restores a stored draft only when it matches the active run', () => {
    storageMocks.readStoredLiveAssistantDraft.mockReturnValue(createLiveDraft('run-1'));

    expect(
      restoreStoredDraftForActiveRun({
        activeThreadId: 'thread-1',
        activeResponseRun: createRun({ id: 'run-1' }),
        liveAssistantDraft: null
      })
    ).toEqual({
      restoredRunId: 'run-1',
      draft: {
        ...createLiveDraft('run-1'),
        source: 'restored'
      }
    });

    storageMocks.readStoredLiveAssistantDraft.mockReturnValue(createLiveDraft('run-2'));
    expect(
      restoreStoredDraftForActiveRun({
        activeThreadId: 'thread-1',
        activeResponseRun: createRun({ id: 'run-1' }),
        liveAssistantDraft: null
      })
    ).toBeNull();
  });

  it('drops stale restored refresh ids when the run no longer matches or is terminal', () => {
    expect(
      resolveRestoredRunRefreshId({
        activeThreadId: 'thread-1',
        activeResponseRun: createRun({ status: 'running' }),
        restoredRunRefreshId: 'run-1'
      })
    ).toBe('run-1');

    expect(
      resolveRestoredRunRefreshId({
        activeThreadId: 'thread-1',
        activeResponseRun: createRun({ status: 'completed' }),
        restoredRunRefreshId: 'run-1'
      })
    ).toBeNull();
  });
});
