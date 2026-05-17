import type { RunFeedbackDto } from '@agent-infra/contracts';

export type RunFeedbackAction =
  | {
      type: 'ignore';
    }
  | {
      type: 'open-dialog';
      runId: string;
    }
  | {
      type: 'mutate';
      runId: string;
      value: RunFeedbackDto['value'] | null;
    };

export type RunFeedbackDialogTarget = {
  threadId: string;
  runId: string;
};

export function resolveRunFeedbackAction(input: {
  runId: string;
  value: RunFeedbackDto['value'] | null;
  pendingRunIds: ReadonlySet<string>;
}): RunFeedbackAction {
  if (input.pendingRunIds.has(input.runId)) {
    return { type: 'ignore' };
  }

  if (input.value === 'thumbs_down') {
    return {
      type: 'open-dialog',
      runId: input.runId
    };
  }

  return {
    type: 'mutate',
    runId: input.runId,
    value: input.value
  };
}

export function canSubmitRunFeedbackDialog(input: {
  target: RunFeedbackDialogTarget | null;
  pendingRunIds: ReadonlySet<string>;
}) {
  return Boolean(input.target && !input.pendingRunIds.has(input.target.runId));
}
