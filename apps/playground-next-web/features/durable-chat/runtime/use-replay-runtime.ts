'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { buildReplayPresentation } from '@/features/durable-chat/service/replay-presentation';
import {
  getReplayableStepIndices,
  moveReplayCursorBy,
  seekReplayToStep,
  toggleReplayPlayback
} from '@/features/durable-chat/service/replay-player';
import type { ReplayCursor, ReplaySession } from '@/features/durable-chat/types/replay';

const INITIAL_CURSOR: ReplayCursor = {
  stepIndex: -1,
  status: 'idle',
  startedAtMs: null,
  lastAdvancedAtMs: null
};

function createInitialCursor(): ReplayCursor {
  return { ...INITIAL_CURSOR };
}

export function useReplayRuntime({ session }: { session: ReplaySession | null }) {
  const [cursor, setCursor] = useState<ReplayCursor>(() => createInitialCursor());
  const [inspectedStepIndex, setInspectedStepIndex] = useState<number | null>(null);
  const [inspectRequestId, setInspectRequestId] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCursor(createInitialCursor());
    setInspectedStepIndex(null);
    setInspectRequestId(0);
  }, [session]);

  useEffect(() => {
    if (!session || cursor.status !== 'playing') {
      return;
    }

    if (cursor.stepIndex < 0) {
      const now = Date.now();
      setCursor((current) => ({
        ...current,
        stepIndex: 0,
        startedAtMs: current.startedAtMs ?? now,
        lastAdvancedAtMs: now
      }));
      return;
    }

    const currentStep = session.steps[cursor.stepIndex];
    if (!currentStep) {
      setCursor((current) => ({
        ...current,
        status: 'completed'
      }));
      return;
    }

    if (currentStep.kind === 'done') {
      setCursor((current) => ({
        ...current,
        status: 'completed'
      }));
      return;
    }

    const delayMs = Math.max(currentStep.delayMs, 0);
    timerRef.current = window.setTimeout(() => {
      const nextIndex = cursor.stepIndex + 1;
      const now = Date.now();
      setCursor((current) => ({
        ...current,
        stepIndex: nextIndex,
        lastAdvancedAtMs: now
      }));
      timerRef.current = null;
    }, delayMs);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [cursor.status, cursor.stepIndex, session]);

  const presentation = useMemo(
    () => buildReplayPresentation(session, cursor, inspectedStepIndex),
    [cursor, inspectedStepIndex, session]
  );

  function play() {
    if (!session || !session.steps.some((step) => step.kind !== 'done')) {
      return;
    }

    setCursor((current) => {
      if (current.status !== 'idle') {
        return current;
      }

      return {
        ...current,
        status: 'playing',
        startedAtMs: Date.now(),
        lastAdvancedAtMs: null
      };
    });
  }

  function pause() {
    setCursor((current) => {
      if (current.status !== 'playing') {
        return current;
      }

      return {
        ...current,
        status: 'paused'
      };
    });
  }

  function resume() {
    setCursor((current) => {
      if (current.status !== 'paused') {
        return current;
      }

      return {
        ...current,
        status: 'playing'
      };
    });
  }

  function togglePlayback() {
    setCursor((current) => toggleReplayPlayback(session, current, Date.now()));
  }

  function previousStep() {
    setCursor((current) => moveReplayCursorBy(session, current, -1, Date.now()));
  }

  function nextStep() {
    setCursor((current) => moveReplayCursorBy(session, current, 1, Date.now()));
  }

  function seekToStep(stepIndex: number) {
    setCursor((current) => seekReplayToStep(session, current, stepIndex, Date.now()));
  }

  function inspectStep(stepIndex: number) {
    setInspectedStepIndex(stepIndex);
    setInspectRequestId((current) => current + 1);
  }

  function finishReplay() {
    const replayableStepIndices = getReplayableStepIndices(session);
    const lastRawStepIndex = replayableStepIndices[replayableStepIndices.length - 1] ?? null;
    if (lastRawStepIndex === null) {
      return;
    }

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const now = Date.now();
    setCursor((current) => ({
      ...current,
      stepIndex: lastRawStepIndex,
      status: 'completed',
      startedAtMs: current.startedAtMs ?? now,
      lastAdvancedAtMs: now
    }));
  }

  function restart() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCursor(createInitialCursor());
    setInspectedStepIndex(null);
    setInspectRequestId(0);
  }

  return {
    cursor,
    inspectRequestId,
    answerContainers: presentation.answerContainers,
    controlState: presentation.controlState,
    transcriptBlocks: presentation.transcriptBlocks,
    viewState: presentation.viewState,
    play,
    pause,
    resume,
    togglePlayback,
    previousStep,
    nextStep,
    seekToStep,
    inspectStep,
    finishReplay,
    restart
  };
}
