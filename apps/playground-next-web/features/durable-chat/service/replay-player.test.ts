import { describe, expect, it } from 'vitest';

import {
  getActiveReplayableStepIndex,
  moveReplayCursorBy,
  seekReplayToStep,
  toggleReplayPlayback
} from '@/features/durable-chat/service/replay-player';
import type { ReplayCursor, ReplaySession, ReplayStep } from '@/features/durable-chat/types/replay';

function createTextStep(id: string): ReplayStep {
  return {
    id,
    kind: 'text',
    threadId: 'thread-1',
    runId: 'run-1',
    messageId: id,
    blockId: id,
    delayMs: 100,
    occurredAt: null,
    role: 'assistant',
    variant: 'text',
    content: id,
    sourceMessageIds: [id]
  };
}

function createDoneStep(): ReplayStep {
  return {
    id: 'done-1',
    kind: 'done',
    threadId: 'thread-1',
    runId: null,
    messageId: null,
    blockId: null,
    delayMs: 0,
    occurredAt: null
  };
}

function createSession(steps: ReplayStep[]): ReplaySession {
  return {
    id: 'replay:thread-1',
    threadId: 'thread-1',
    mode: 'thread',
    steps,
    initialTranscriptBlocks: [],
    startedAt: null
  };
}

function createCursor(overrides: Partial<ReplayCursor> = {}): ReplayCursor {
  return {
    stepIndex: -1,
    status: 'idle',
    startedAtMs: null,
    lastAdvancedAtMs: null,
    ...overrides
  };
}

describe('replay player transitions', () => {
  it('toggles idle, playing, paused, and completed cursors', () => {
    const session = createSession([createTextStep('step-1'), createDoneStep()]);

    expect(toggleReplayPlayback(session, createCursor(), 1000)).toMatchObject({
      stepIndex: -1,
      status: 'playing',
      startedAtMs: 1000
    });
    expect(toggleReplayPlayback(session, createCursor({ status: 'playing', stepIndex: 0 }), 1000)).toMatchObject({
      stepIndex: 0,
      status: 'paused'
    });
    expect(toggleReplayPlayback(session, createCursor({ status: 'paused', stepIndex: 0, startedAtMs: 800 }), 1000)).toMatchObject({
      stepIndex: 0,
      status: 'playing',
      startedAtMs: 800
    });
    expect(toggleReplayPlayback(session, createCursor({ status: 'completed', stepIndex: 1 }), 1000)).toMatchObject({
      stepIndex: -1,
      status: 'playing',
      startedAtMs: 1000,
      lastAdvancedAtMs: null
    });
  });

  it('seeks by replayable step index and ignores the terminal done step', () => {
    const session = createSession([createTextStep('step-1'), createTextStep('step-2'), createDoneStep()]);

    expect(seekReplayToStep(session, createCursor(), 1, 1200)).toMatchObject({
      stepIndex: 1,
      status: 'paused',
      startedAtMs: 1200,
      lastAdvancedAtMs: 1200
    });
    expect(seekReplayToStep(session, createCursor({ status: 'playing', startedAtMs: 900 }), 1, 1200)).toMatchObject({
      stepIndex: 1,
      status: 'playing',
      startedAtMs: 900,
      lastAdvancedAtMs: 1200
    });
    expect(seekReplayToStep(session, createCursor({ stepIndex: 0 }), 2, 1200)).toMatchObject({
      stepIndex: 0
    });
  });

  it('moves to previous and next replayable steps without leaving valid bounds', () => {
    const session = createSession([createTextStep('step-1'), createTextStep('step-2'), createTextStep('step-3'), createDoneStep()]);

    expect(moveReplayCursorBy(session, createCursor({ stepIndex: 1, status: 'paused' }), -1, 1400)).toMatchObject({
      stepIndex: 0,
      status: 'paused'
    });
    expect(moveReplayCursorBy(session, createCursor({ stepIndex: 1, status: 'playing' }), 1, 1400)).toMatchObject({
      stepIndex: 2,
      status: 'playing'
    });
    expect(moveReplayCursorBy(session, createCursor({ stepIndex: 0, status: 'paused' }), -1, 1400)).toMatchObject({
      stepIndex: 0,
      status: 'paused'
    });
    expect(moveReplayCursorBy(session, createCursor({ stepIndex: 2, status: 'paused' }), 1, 1400)).toMatchObject({
      stepIndex: 2,
      status: 'paused'
    });
  });

  it('reports active replayable step index from raw cursor position', () => {
    const session = createSession([createTextStep('step-1'), createTextStep('step-2'), createDoneStep()]);

    expect(getActiveReplayableStepIndex(session, createCursor())).toBe(-1);
    expect(getActiveReplayableStepIndex(session, createCursor({ stepIndex: 0 }))).toBe(0);
    expect(getActiveReplayableStepIndex(session, createCursor({ stepIndex: 1 }))).toBe(1);
    expect(getActiveReplayableStepIndex(session, createCursor({ stepIndex: 2 }))).toBe(1);
  });
});
