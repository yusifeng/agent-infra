import { describe, expect, it } from 'vitest';

import {
  applyOptimisticRunFeedback,
  canSubmitRunFeedbackDialog,
  replaceRunFeedbackForRun,
  resolveRunFeedbackAction
} from './run-feedback-controller';

describe('run feedback controller', () => {
  it('opens the feedback dialog for inactive thumbs down instead of mutating immediately', () => {
    expect(resolveRunFeedbackAction({
      runId: 'run-1',
      value: 'thumbs_down',
      pendingRunIds: new Set()
    })).toEqual({
      type: 'open-dialog',
      runId: 'run-1'
    });
  });

  it('mutates directly for thumbs up and active-feedback clear actions', () => {
    expect(resolveRunFeedbackAction({
      runId: 'run-1',
      value: 'thumbs_up',
      pendingRunIds: new Set()
    })).toEqual({
      type: 'mutate',
      runId: 'run-1',
      value: 'thumbs_up'
    });

    expect(resolveRunFeedbackAction({
      runId: 'run-1',
      value: null,
      pendingRunIds: new Set()
    })).toEqual({
      type: 'mutate',
      runId: 'run-1',
      value: null
    });
  });

  it('ignores feedback actions while the run is pending mutation', () => {
    expect(resolveRunFeedbackAction({
      runId: 'run-1',
      value: 'thumbs_down',
      pendingRunIds: new Set(['run-1'])
    })).toEqual({ type: 'ignore' });
  });

  it('allows dialog submit only when a dialog run exists and is not pending', () => {
    expect(canSubmitRunFeedbackDialog({
      target: {
        threadId: 'thread-1',
        runId: 'run-1'
      },
      pendingRunIds: new Set()
    })).toBe(true);
    expect(canSubmitRunFeedbackDialog({
      target: {
        threadId: 'thread-1',
        runId: 'run-1'
      },
      pendingRunIds: new Set(['run-1'])
    })).toBe(false);
    expect(canSubmitRunFeedbackDialog({
      target: null,
      pendingRunIds: new Set()
    })).toBe(false);
  });

  it('applies optimistic feedback with a synthetic id when no server row exists yet', () => {
    expect(applyOptimisticRunFeedback({
      current: [],
      threadId: 'thread-1',
      runId: 'run-1',
      triggerMessageId: 'message-user',
      value: 'thumbs_up',
      nowIso: '2026-05-17T10:00:00.000Z'
    })).toEqual([
      {
        id: 'optimistic:run-1',
        threadId: 'thread-1',
        triggerMessageId: 'message-user',
        runId: 'run-1',
        feedbackActorId: 'optimistic',
        value: 'thumbs_up',
        createdAt: '2026-05-17T10:00:00.000Z',
        updatedAt: '2026-05-17T10:00:00.000Z'
      }
    ]);
  });

  it('preserves the existing feedback identity when optimistically changing value', () => {
    expect(applyOptimisticRunFeedback({
      current: [
        {
          id: 'feedback-1',
          threadId: 'thread-1',
          triggerMessageId: 'message-user',
          runId: 'run-1',
          feedbackActorId: 'actor-1',
          value: 'thumbs_down',
          createdAt: '2026-05-17T09:00:00.000Z',
          updatedAt: '2026-05-17T09:00:00.000Z'
        }
      ],
      threadId: 'thread-1',
      runId: 'run-1',
      triggerMessageId: null,
      value: 'thumbs_up',
      nowIso: '2026-05-17T10:00:00.000Z'
    })).toEqual([
      {
        id: 'feedback-1',
        threadId: 'thread-1',
        triggerMessageId: 'message-user',
        runId: 'run-1',
        feedbackActorId: 'actor-1',
        value: 'thumbs_up',
        createdAt: '2026-05-17T09:00:00.000Z',
        updatedAt: '2026-05-17T10:00:00.000Z'
      }
    ]);
  });

  it('removes only the target run feedback when clearing optimistically', () => {
    const targetFeedback = {
      id: 'feedback-1',
      threadId: 'thread-1',
      triggerMessageId: 'message-user',
      runId: 'run-1',
      feedbackActorId: 'actor-1',
      value: 'thumbs_up' as const,
      createdAt: '2026-05-17T09:00:00.000Z',
      updatedAt: '2026-05-17T09:00:00.000Z'
    };
    const otherFeedback = {
      ...targetFeedback,
      id: 'feedback-2',
      runId: 'run-2'
    };

    expect(replaceRunFeedbackForRun([targetFeedback, otherFeedback], 'run-1', null)).toEqual([otherFeedback]);
  });
});
