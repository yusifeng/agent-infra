import { describe, expect, it, vi } from 'vitest';

import type { RunAttachStreamEventDto, RunDto, RunStreamSnapshotEventDto } from '@agent-infra/contracts';

import { applyAttachRunEvent } from './attach-run-flow';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';
import type { ChatPhase } from '@/features/durable-chat/types/runtime';

type Updater<T> = T | ((current: T) => T);

function createRun(overrides: Partial<RunDto> = {}): RunDto {
  return {
    id: 'run-1',
    threadId: 'thread-1',
    triggerMessageId: null,
    provider: 'openai',
    model: 'gpt-4o-mini',
    status: 'running',
    usage: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function createSnapshot(overrides: Partial<RunStreamSnapshotEventDto> = {}): RunStreamSnapshotEventDto {
  return {
    type: 'run.snapshot',
    runId: 'run-1',
    run: createRun(),
    version: 1,
    assistant: null,
    ...overrides
  };
}

function resolveUpdater<T>(value: Updater<T>, current: T) {
  return typeof value === 'function' ? (value as (current: T) => T)(current) : value;
}

function createHarness(overrides: { attachRunId?: string | null; attachVersion?: number } = {}) {
  const state = {
    activeResponseRun: undefined as RunDto | null | undefined,
    chatPhase: undefined as ChatPhase | undefined,
    error: undefined as string | null | undefined,
    liveAssistantDraft: null as LiveAssistantDraft | null,
    liveStreamRunId: undefined as string | null | undefined,
    loadingThreadId: undefined as string | null | undefined,
    persistingTurn: undefined as boolean | undefined,
    recentRuns: [] as RunDto[]
  };
  const loadThreadMessages = vi.fn().mockResolvedValue({ ok: true, restoredRunId: null });
  const reconcileCompletedTurn = vi.fn().mockResolvedValue(undefined);
  return {
    actions: {
      setActiveResponseRun: vi.fn((next: Updater<RunDto | null>) => {
        state.activeResponseRun = resolveUpdater(next, state.activeResponseRun ?? null);
      }),
      setChatPhase: vi.fn((next: Updater<ChatPhase>) => {
        state.chatPhase = resolveUpdater(next, state.chatPhase ?? 'idle');
      }),
      setError: vi.fn((next: Updater<string | null>) => {
        state.error = resolveUpdater(next, state.error ?? null);
      }),
      setLiveAssistantDraft: vi.fn((next: Updater<LiveAssistantDraft | null>) => {
        state.liveAssistantDraft = resolveUpdater(next, state.liveAssistantDraft);
      }),
      setLiveStreamRunId: vi.fn((next: Updater<string | null>) => {
        state.liveStreamRunId = resolveUpdater(next, state.liveStreamRunId ?? null);
      }),
      setLoadingThreadId: vi.fn((next: Updater<string | null>) => {
        state.loadingThreadId = resolveUpdater(next, state.loadingThreadId ?? null);
      }),
      setPersistingTurn: vi.fn((next: Updater<boolean>) => {
        state.persistingTurn = resolveUpdater(next, state.persistingTurn ?? false);
      }),
      setRecentRuns: vi.fn((next: Updater<RunDto[]>) => {
        state.recentRuns = resolveUpdater(next, state.recentRuns);
      })
    },
    operations: {
      loadThreadMessages,
      reconcileCompletedTurn
    },
    refs: {
      attachRequestIdRef: { current: 7 },
      attachRunIdRef: { current: overrides.attachRunId ?? 'run-1' },
      attachVersionRef: { current: overrides.attachVersion ?? 0 },
      activeThreadIdRef: { current: 'thread-1' },
      logOpenRef: { current: true }
    },
    state
  };
}

function apply(event: RunAttachStreamEventDto, harness = createHarness()) {
  const terminal = applyAttachRunEvent({
    event,
    requestId: 7,
    threadId: 'thread-1',
    refs: harness.refs,
    actions: harness.actions,
    operations: harness.operations
  });
  return { harness, terminal };
}

describe('applyAttachRunEvent', () => {
  it('ignores events from stale attach requests', () => {
    const harness = createHarness({ attachRunId: 'run-other' });
    const { terminal } = apply(createSnapshot(), harness);

    expect(terminal).toBe(false);
    expect(harness.actions.setLiveStreamRunId).not.toHaveBeenCalled();
    expect(harness.state.recentRuns).toEqual([]);
  });

  it('applies snapshot events as authoritative live draft state', () => {
    const { harness, terminal } = apply(createSnapshot());

    expect(terminal).toBe(false);
    expect(harness.refs.attachVersionRef.current).toBe(1);
    expect(harness.state.liveStreamRunId).toBe('run-1');
    expect(harness.state.activeResponseRun?.id).toBe('run-1');
    expect(harness.state.loadingThreadId).toBe('thread-1');
    expect(harness.state.liveAssistantDraft).toBeNull();
    expect(harness.state.chatPhase).toBe('thinking');
    expect(harness.state.recentRuns.map((run) => run.id)).toEqual(['run-1']);
  });

  it('ignores stale live events by attach version', () => {
    const harness = createHarness({ attachVersion: 2 });
    const { terminal } = apply(
      {
        type: 'run.state',
        runId: 'run-1',
        run: createRun(),
        version: 2
      },
      harness
    );

    expect(terminal).toBe(false);
    expect(harness.actions.setLiveStreamRunId).not.toHaveBeenCalled();
    expect(harness.state.recentRuns).toEqual([]);
  });

  it('reloads durable messages when attach is unavailable', () => {
    const { harness, terminal } = apply({
      type: 'run.attach_unavailable',
      runId: 'run-1',
      reason: 'stream_session_gone',
      run: createRun()
    });

    expect(terminal).toBe(true);
    expect(harness.state.liveStreamRunId).toBeNull();
    expect(harness.state.activeResponseRun?.id).toBe('run-1');
    expect(harness.operations.loadThreadMessages).toHaveBeenCalledWith('thread-1', {
      background: true,
      preferredRunId: 'run-1',
      preserveExistingTimeline: true,
      skipTimelineReload: true
    });
  });

  it('settles failed events and reconciles durable state', () => {
    const { harness, terminal } = apply({
      type: 'run.failed',
      runId: 'run-1',
      run: createRun({ status: 'failed', error: 'boom' }),
      error: 'boom',
      version: 3
    });

    expect(terminal).toBe(true);
    expect(harness.state.activeResponseRun).toBeNull();
    expect(harness.state.error).toBe('boom');
    expect(harness.state.liveStreamRunId).toBeNull();
    expect(harness.state.loadingThreadId).toBeNull();
    expect(harness.state.persistingTurn).toBe(false);
    expect(harness.state.chatPhase).toBe('failed');
    expect(harness.operations.reconcileCompletedTurn).toHaveBeenCalledWith('thread-1', 'run-1', 7);
  });

  it('settles completed events and reconciles durable state', () => {
    const { harness, terminal } = apply({
      type: 'run.completed',
      runId: 'run-1',
      run: createRun({ status: 'completed', finishedAt: '2026-01-01T00:00:01.000Z' }),
      version: 3
    });

    expect(terminal).toBe(true);
    expect(harness.state.activeResponseRun).toBeNull();
    expect(harness.state.error).toBeNull();
    expect(harness.state.liveStreamRunId).toBeNull();
    expect(harness.state.loadingThreadId).toBeNull();
    expect(harness.state.persistingTurn).toBe(true);
    expect(harness.operations.reconcileCompletedTurn).toHaveBeenCalledWith('thread-1', 'run-1', 7);
  });
});
