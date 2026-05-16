import type { RunDto } from '@agent-infra/contracts';
import { describe, expect, it, vi } from 'vitest';

import { parseRunAttachSseChunk } from '@/features/durable-chat/service/chat-runtime';
import type { ChatPhase } from '@/features/durable-chat/types/runtime';
import { runAttachRunLifecycle } from './stream-lifecycle-controller';

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

function resolveUpdater<T>(value: Updater<T>, current: T) {
  return typeof value === 'function' ? (value as (current: T) => T)(current) : value;
}

function streamFromEvents(events: unknown[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        const eventType = typeof event === 'object' && event !== null && 'type' in event
          ? String((event as { type: unknown }).type)
          : 'message';
        controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    }
  });
}

function createHarness() {
  const state = {
    activeResponseRun: null as RunDto | null,
    chatPhase: 'idle' as ChatPhase,
    error: null as string | null,
    liveStreamRunId: null as string | null,
    loadingThreadId: null as string | null,
    persistingTurn: false,
    recentRuns: [] as RunDto[]
  };
  const loadThreadMessages = vi.fn().mockResolvedValue({ ok: true, restoredRunId: null });
  const reconcileCompletedTurn = vi.fn().mockResolvedValue(undefined);

  return {
    actions: {
      setActiveResponseRun: vi.fn((next: Updater<RunDto | null>) => {
        state.activeResponseRun = resolveUpdater(next, state.activeResponseRun);
      }),
      setChatPhase: vi.fn((next: Updater<ChatPhase>) => {
        state.chatPhase = resolveUpdater(next, state.chatPhase);
      }),
      setError: vi.fn((next: Updater<string | null>) => {
        state.error = resolveUpdater(next, state.error);
      }),
      setLiveAssistantDraft: vi.fn(),
      setLiveStreamRunId: vi.fn((next: Updater<string | null>) => {
        state.liveStreamRunId = resolveUpdater(next, state.liveStreamRunId);
      }),
      setLoadingThreadId: vi.fn((next: Updater<string | null>) => {
        state.loadingThreadId = resolveUpdater(next, state.loadingThreadId);
      }),
      setPersistingTurn: vi.fn((next: Updater<boolean>) => {
        state.persistingTurn = resolveUpdater(next, state.persistingTurn);
      }),
      setRecentRuns: vi.fn((next: Updater<RunDto[]>) => {
        state.recentRuns = resolveUpdater(next, state.recentRuns);
      })
    },
    operations: {
      loadThreadMessages,
      openAttachStream: vi.fn(),
      parseAttachChunk: parseRunAttachSseChunk,
      reconcileCompletedTurn
    },
    refs: {
      activeThreadIdRef: { current: 'thread-1' as string | null },
      attachAbortControllerRef: { current: null as AbortController | null },
      attachRequestIdRef: { current: 4 },
      attachRunIdRef: { current: null as string | null },
      attachVersionRef: { current: 0 },
      logOpenRef: { current: true },
      sendRequestIdRef: { current: 5 }
    },
    state
  };
}

function runWithHarness(harness: ReturnType<typeof createHarness>) {
  return runAttachRunLifecycle({
    threadId: 'thread-1',
    runId: 'run-1',
    refs: harness.refs,
    actions: harness.actions,
    operations: harness.operations
  });
}

describe('runAttachRunLifecycle', () => {
  it('applies terminal completed events, reconciles durable state, and clears only the current attach refs', async () => {
    const harness = createHarness();
    harness.operations.openAttachStream.mockResolvedValue({
      ok: true,
      status: 200,
      body: streamFromEvents([
        {
          type: 'run.completed',
          runId: 'run-1',
          run: createRun({ status: 'completed', finishedAt: '2026-01-01T00:00:01.000Z' }),
          version: 1
        }
      ])
    });

    await runWithHarness(harness);

    expect(harness.state.persistingTurn).toBe(true);
    expect(harness.state.loadingThreadId).toBeNull();
    expect(harness.state.liveStreamRunId).toBeNull();
    expect(harness.refs.attachAbortControllerRef.current).toBeNull();
    expect(harness.refs.attachRunIdRef.current).toBeNull();
    expect(harness.operations.reconcileCompletedTurn).toHaveBeenCalledWith('thread-1', 'run-1', 6);
  });

  it('does not clear a newer attach lifecycle when the current request becomes stale', async () => {
    const harness = createHarness();
    harness.operations.openAttachStream.mockImplementation(async () => {
      harness.refs.attachRequestIdRef.current = 99;
      harness.refs.attachRunIdRef.current = 'run-current';
      harness.state.liveStreamRunId = 'run-current';
      return {
        ok: true,
        status: 200,
        body: streamFromEvents([])
      };
    });

    await runWithHarness(harness);

    expect(harness.refs.attachRunIdRef.current).toBe('run-current');
    expect(harness.state.liveStreamRunId).toBe('run-current');
    expect(harness.actions.setLiveStreamRunId).not.toHaveBeenLastCalledWith(null);
    expect(harness.operations.reconcileCompletedTurn).not.toHaveBeenCalled();
  });

  it('falls back to durable message reload when attach stream opening fails', async () => {
    const harness = createHarness();
    harness.operations.openAttachStream.mockResolvedValue({
      ok: false,
      status: 500,
      error: 'attach unavailable',
      body: null
    });

    await runWithHarness(harness);

    expect(harness.state.error).toBe('attach unavailable');
    expect(harness.state.liveStreamRunId).toBeNull();
    expect(harness.operations.loadThreadMessages).toHaveBeenCalledWith('thread-1', {
      background: true,
      preferredRunId: 'run-1',
      preserveExistingTimeline: true,
      skipTimelineReload: true
    });
  });
});
