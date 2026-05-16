// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useReplayRuntime } from '@/features/durable-chat/runtime/use-replay-runtime';
import type { ReplaySession, ReplayStep } from '@/features/durable-chat/types/replay';

type ReplayRuntime = ReturnType<typeof useReplayRuntime>;

function createTextStep(id: string): Extract<ReplayStep, { kind: 'text' }> {
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

function createDoneStep(): Extract<ReplayStep, { kind: 'done' }> {
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

function createSession(id = 'session-1'): ReplaySession {
  return {
    id,
    threadId: 'thread-1',
    mode: 'thread',
    steps: [createTextStep('step-1'), createTextStep('step-2'), createDoneStep()],
    initialTranscriptBlocks: [],
    startedAt: null
  };
}

function Harness({
  session,
  onRuntime
}: {
  session: ReplaySession | null;
  onRuntime: (runtime: ReplayRuntime) => void;
}) {
  const runtime = useReplayRuntime({ session });
  onRuntime(runtime);
  return null;
}

describe('useReplayRuntime', () => {
  let container: HTMLDivElement;
  let root: Root;
  let runtime: ReplayRuntime | null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    runtime = null;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function render(session: ReplaySession | null) {
    act(() => {
      root.render(<Harness session={session} onRuntime={(nextRuntime) => {
        runtime = nextRuntime;
      }} />);
    });
  }

  it('inspects a step without mutating playback cursor', () => {
    render(createSession());
    expect(runtime).not.toBeNull();

    act(() => {
      runtime!.inspectStep(1);
    });

    expect(runtime!.cursor).toMatchObject({ stepIndex: -1, status: 'idle' });
    expect(runtime!.viewState).toMatchObject({
      playbackStepIndex: -1,
      inspectedStepIndex: 1,
      inspectedReplayBlockId: 'replay-assistant:step-2'
    });
  });

  it('keeps inspected step when playback changes and clears it on session reset', () => {
    const session = createSession('session-1');
    render(session);

    act(() => {
      runtime!.inspectStep(1);
      runtime!.seekToStep(0);
    });

    expect(runtime!.viewState).toMatchObject({
      playbackStepIndex: 0,
      inspectedStepIndex: 1
    });

    render(createSession('session-2'));

    expect(runtime!.viewState.inspectedStepIndex).toBeNull();
  });

  it('clears inspected step when the same session id receives refreshed data', () => {
    const session = createSession('session-1');
    render(session);

    act(() => {
      runtime!.inspectStep(1);
    });

    expect(runtime!.viewState.inspectedStepIndex).toBe(1);

    render({
      ...session,
      steps: [createTextStep('fresh-step-1'), createDoneStep()]
    });

    expect(runtime!.viewState.inspectedStepIndex).toBeNull();
    expect(runtime!.viewState.inspectedReplayBlockId).toBeNull();
  });
});
