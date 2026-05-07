import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useReplayRuntime } from '@/features/durable-chat/runtime/use-replay-runtime';
import type { ReplaySession, ReplayStep } from '@/features/durable-chat/types/replay';

function createStep(overrides: Partial<ReplayStep> & Pick<ReplayStep, 'id' | 'kind'>): ReplayStep {
  const base = {
    threadId: 'thread-1',
    runId: 'run-1',
    messageId: 'message-1',
    blockId: 'block-1',
    delayMs: 50
  };

  if (overrides.kind === 'text') {
    return {
      ...base,
      role: 'assistant',
      variant: 'text',
      content: 'hello',
      sourceMessageIds: ['message-1'],
      ...overrides
    };
  }

  if (overrides.kind === 'search-loading') {
    return {
      ...base,
      toolCallIds: ['call-1'],
      query: 'Claude latest news',
      sourceNames: [],
      ...overrides
    };
  }

  if (overrides.kind === 'search-summary') {
    return {
      ...base,
      toolCallIds: ['call-1'],
      query: 'Claude latest news',
      resultCount: 10,
      sourceNames: ['The Verge'],
      sources: [{ sourceName: 'The Verge', hostname: 'theverge.com' }],
      ...overrides
    };
  }

  return {
    ...base,
    ...overrides
  };
}

function createSession(steps: ReplayStep[]): ReplaySession {
  return {
    id: `replay:${steps.map((step) => step.id).join('|')}`,
    threadId: 'thread-1',
    mode: 'thread',
    steps,
    initialTranscriptBlocks: [],
    startedAt: null
  };
}

describe('useReplayRuntime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays forward one step at a time and completes at the done marker', () => {
    const session = createSession([
      createStep({ id: 'text-1', kind: 'text', delayMs: 100, content: '第一段' }),
      createStep({ id: 'loading-1', kind: 'search-loading', delayMs: 150 }),
      createStep({ id: 'done-1', kind: 'done', runId: null, messageId: null, blockId: null, delayMs: 0 })
    ]);

    const { result } = renderHook(() => useReplayRuntime({ session }));

    act(() => {
      result.current.play();
    });

    expect(result.current.cursor.status).toBe('playing');
    expect(result.current.transcriptBlocks).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current.transcriptBlocks).toHaveLength(2);
    expect(result.current.transcriptBlocks[1]).toMatchObject({
      type: 'assistant-turn',
      items: [{ type: 'search-status' }]
    });

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(result.current.viewState.status).toBe('completed');
    expect(result.current.viewState.progressLabel).toBe('2 / 2');
  });

  it('pauses, resumes, and restarts without losing replay state', () => {
    const session = createSession([
      createStep({ id: 'text-1', kind: 'text', delayMs: 100, content: '第一段' }),
      createStep({ id: 'text-2', kind: 'text', delayMs: 100, content: '第二段' }),
      createStep({ id: 'done-1', kind: 'done', runId: null, messageId: null, blockId: null, delayMs: 0 })
    ]);

    const { result } = renderHook(() => useReplayRuntime({ session }));

    act(() => {
      result.current.play();
    });

    expect(result.current.transcriptBlocks).toHaveLength(1);

    act(() => {
      result.current.pause();
    });

    expect(result.current.viewState.status).toBe('paused');
    expect(result.current.transcriptBlocks).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.transcriptBlocks).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current.transcriptBlocks).toHaveLength(1);

    act(() => {
      result.current.resume();
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current.transcriptBlocks).toHaveLength(2);

    act(() => {
      result.current.restart();
    });

    expect(result.current.viewState.status).toBe('idle');
    expect(result.current.transcriptBlocks).toHaveLength(0);
    expect(result.current.controlState.canPlay).toBe(true);
  });

  it('resets when the replay session changes', () => {
    const session = createSession([
      createStep({ id: 'text-1', kind: 'text', delayMs: 100, content: '第一段' }),
      createStep({ id: 'done-1', kind: 'done', runId: null, messageId: null, blockId: null, delayMs: 0 })
    ]);
    const nextSession = createSession([
      createStep({ id: 'text-2', kind: 'text', delayMs: 100, content: '第二段', threadId: 'thread-2' }),
      createStep({ id: 'done-2', kind: 'done', threadId: 'thread-2', runId: null, messageId: null, blockId: null, delayMs: 0 })
    ]);

    const { result, rerender } = renderHook(
      ({ currentSession }) => useReplayRuntime({ session: currentSession }),
      {
        initialProps: { currentSession: session }
      }
    );

    act(() => {
      result.current.play();
      vi.advanceTimersByTime(100);
    });

    expect(result.current.transcriptBlocks).toHaveLength(1);

    act(() => {
      rerender({ currentSession: nextSession });
    });

    expect(result.current.viewState.status).toBe('idle');
    expect(result.current.transcriptBlocks).toHaveLength(0);
    expect(result.current.controlState.canPlay).toBe(true);
  });

  it('does not reset when rerender receives an equivalent replay session identity', () => {
    const firstSession = createSession([
      createStep({ id: 'text-1', kind: 'text', delayMs: 100, content: '第一段' }),
      createStep({ id: 'done-1', kind: 'done', runId: null, messageId: null, blockId: null, delayMs: 0 })
    ]);
    const equivalentSession: ReplaySession = {
      ...firstSession,
      steps: [...firstSession.steps]
    };

    const { result, rerender } = renderHook(
      ({ currentSession }) => useReplayRuntime({ session: currentSession }),
      {
        initialProps: { currentSession: firstSession }
      }
    );

    act(() => {
      result.current.play();
    });

    expect(result.current.viewState.status).toBe('playing');
    expect(result.current.transcriptBlocks).toHaveLength(1);

    act(() => {
      rerender({ currentSession: equivalentSession });
    });

    expect(result.current.viewState.status).toBe('playing');
    expect(result.current.transcriptBlocks).toHaveLength(1);
  });
});
