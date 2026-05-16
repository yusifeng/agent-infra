// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReplayDock } from './replay-dock';
import type { ReplayControlState, ReplayViewState } from '@/features/durable-chat/types/replay';

const controlState: ReplayControlState = {
  canPlay: false,
  canPause: false,
  canResume: true,
  canRestart: true,
  canTogglePlayback: true,
  canPrevious: false,
  canNext: true,
  canInspect: true
};

const viewState: ReplayViewState = {
  status: 'paused',
  currentStepIndex: 1,
  totalSteps: 3,
  progressLabel: '1 / 3',
  playbackStepIndex: 0,
  playbackReplayBlockId: 'replay-user:step-1',
  inspectedStepIndex: 2,
  inspectedReplayBlockId: 'replay-assistant:step-3',
  currentStepLabel: '用户提问',
  currentStepKind: 'text',
  totalDurationLabel: '4.2s',
  progressSegments: [
    {
      stepIndex: 0,
      rawStepIndex: 0,
      label: '用户提问',
      kind: 'text',
      tone: 'user',
      weight: 1.2,
      durationMs: 300,
      durationLabel: '300ms',
      complete: true,
      playbackActive: true,
      inspected: false
    },
    {
      stepIndex: 1,
      rawStepIndex: 1,
      label: 'AI 思考',
      kind: 'text',
      tone: 'thinking',
      weight: 2.4,
      durationMs: 900,
      durationLabel: '900ms',
      complete: false,
      playbackActive: false,
      inspected: false
    },
    {
      stepIndex: 2,
      rawStepIndex: 2,
      label: 'AI 回答',
      kind: 'text',
      tone: 'answer',
      weight: 6,
      durationMs: 3000,
      durationLabel: '3.0s',
      complete: false,
      playbackActive: false,
      inspected: true
    }
  ]
};

describe('ReplayDock', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('inspects progress segments without invoking playback controls', () => {
    const onInspectStep = vi.fn();
    const onTogglePlayback = vi.fn();

    act(() => {
      root.render(
        <ReplayDock
          controlState={controlState}
          viewState={viewState}
          onTogglePlayback={onTogglePlayback}
          onPreviousStep={vi.fn()}
          onNextStep={vi.fn()}
          onInspectStep={onInspectStep}
          onRestart={vi.fn()}
        />
      );
    });

    const segments = container.querySelectorAll<HTMLButtonElement>('[data-replay-segment-tone]');
    expect(segments).toHaveLength(3);
    expect(segments[0]?.dataset.replaySegmentTone).toBe('user');
    expect(segments[1]?.dataset.replaySegmentTone).toBe('thinking');
    expect(segments[2]?.dataset.replaySegmentTone).toBe('answer');
    expect(segments[0]?.style.flexGrow).toBe('1.2');
    expect(segments[2]?.style.flexGrow).toBe('6');
    expect(segments[0]?.dataset.replaySegmentPlaybackActive).toBe('true');
    expect(segments[2]?.dataset.replaySegmentInspected).toBe('true');

    act(() => {
      segments[2]!.click();
    });

    expect(onInspectStep).toHaveBeenCalledWith(2);
    expect(onTogglePlayback).not.toHaveBeenCalled();
  });
});
