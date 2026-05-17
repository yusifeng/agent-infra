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

export function replaceRunFeedbackForRun(
  current: RunFeedbackDto[],
  runId: string,
  feedback: RunFeedbackDto | null
) {
  const withoutRun = current.filter((item) => item.runId !== runId);
  return feedback ? [...withoutRun, feedback] : withoutRun;
}

export function applyOptimisticRunFeedback(input: {
  current: RunFeedbackDto[];
  threadId: string;
  runId: string;
  triggerMessageId: string | null;
  value: RunFeedbackDto['value'] | null;
  nowIso: string;
}) {
  if (!input.value) {
    return replaceRunFeedbackForRun(input.current, input.runId, null);
  }

  const existing = input.current.find((feedback) => feedback.runId === input.runId) ?? null;
  const triggerMessageId = existing?.triggerMessageId ?? input.triggerMessageId;
  if (!triggerMessageId) {
    return input.current;
  }

  return replaceRunFeedbackForRun(input.current, input.runId, {
    id: existing?.id ?? `optimistic:${input.runId}`,
    threadId: existing?.threadId ?? input.threadId,
    triggerMessageId,
    runId: input.runId,
    feedbackActorId: existing?.feedbackActorId ?? 'optimistic',
    value: input.value,
    createdAt: existing?.createdAt ?? input.nowIso,
    updatedAt: input.nowIso
  });
}

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
