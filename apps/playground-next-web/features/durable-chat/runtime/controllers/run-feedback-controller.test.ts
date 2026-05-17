import { describe, expect, it } from 'vitest';

import {
  canSubmitRunFeedbackDialog,
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
});
