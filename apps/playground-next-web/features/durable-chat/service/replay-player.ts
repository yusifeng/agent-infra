import type { ReplayCursor, ReplaySession } from '@/features/durable-chat/types/replay';

export function getReplayableStepIndices(session: ReplaySession | null): number[] {
  return session?.steps.flatMap((step, index) => (step.kind === 'done' ? [] : [index])) ?? [];
}

export function getActiveReplayableStepIndex(session: ReplaySession | null, cursor: ReplayCursor): number {
  const replayableStepIndices = getReplayableStepIndices(session);

  if (replayableStepIndices.length === 0 || cursor.stepIndex < 0) {
    return -1;
  }

  const consumedSteps = replayableStepIndices.filter((stepIndex) => stepIndex <= cursor.stepIndex).length;
  return Math.min(consumedSteps - 1, replayableStepIndices.length - 1);
}

export function getRawStepIndexForReplayableStep(session: ReplaySession | null, replayableStepIndex: number): number | null {
  const replayableStepIndices = getReplayableStepIndices(session);
  return replayableStepIndices[replayableStepIndex] ?? null;
}

export function toggleReplayPlayback(session: ReplaySession | null, cursor: ReplayCursor, nowMs: number): ReplayCursor {
  if (getReplayableStepIndices(session).length === 0) {
    return cursor;
  }

  if (cursor.status === 'playing') {
    return {
      ...cursor,
      status: 'paused'
    };
  }

  if (cursor.status === 'completed') {
    return {
      stepIndex: -1,
      status: 'playing',
      startedAtMs: nowMs,
      lastAdvancedAtMs: null
    };
  }

  return {
    ...cursor,
    status: 'playing',
    startedAtMs: cursor.startedAtMs ?? nowMs
  };
}

export function seekReplayToStep(
  session: ReplaySession | null,
  cursor: ReplayCursor,
  replayableStepIndex: number,
  nowMs: number
): ReplayCursor {
  const rawStepIndex = getRawStepIndexForReplayableStep(session, replayableStepIndex);

  if (rawStepIndex === null) {
    return cursor;
  }

  return {
    ...cursor,
    stepIndex: rawStepIndex,
    status: cursor.status === 'playing' ? 'playing' : 'paused',
    startedAtMs: cursor.startedAtMs ?? nowMs,
    lastAdvancedAtMs: nowMs
  };
}

export function moveReplayCursorBy(
  session: ReplaySession | null,
  cursor: ReplayCursor,
  delta: -1 | 1,
  nowMs: number
): ReplayCursor {
  const replayableStepIndices = getReplayableStepIndices(session);

  if (replayableStepIndices.length === 0) {
    return cursor;
  }

  const activeStepIndex = getActiveReplayableStepIndex(session, cursor);
  const nextStepIndex = Math.min(Math.max(activeStepIndex + delta, 0), replayableStepIndices.length - 1);

  if (nextStepIndex === activeStepIndex) {
    return cursor;
  }

  return seekReplayToStep(session, cursor, nextStepIndex, nowMs);
}
