import type {
  AnswerCandidateDto,
  AnswerSelectionDto,
  RunDto,
  RunFeedbackDto
} from '@agent-infra/contracts';

import type { AnswerCandidateGroup, AnswerCandidateStatus } from '@/features/durable-chat/types/answer-candidate-groups';
import type { AnswerContainer } from '@/features/durable-chat/types/answer-containers';
import type { LiveAssistantDraftsByRunId } from '@/features/durable-chat/types/live-assistant-draft';

function groupCandidatesByTrigger(candidates: AnswerCandidateDto[]) {
  const groups = new Map<string, AnswerCandidateDto[]>();
  for (const candidate of candidates) {
    const current = groups.get(candidate.triggerMessageId) ?? [];
    current.push(candidate);
    groups.set(candidate.triggerMessageId, current);
  }
  return groups;
}

function resolveCandidateStatus(args: {
  answerContainer: AnswerContainer | null;
  liveDraft: unknown | null;
  run: RunDto | null;
}): AnswerCandidateStatus {
  if (args.run?.status === 'queued') {
    return 'queued';
  }

  if (args.run?.status === 'running' || args.liveDraft) {
    return 'running';
  }

  if (args.run?.status === 'failed') {
    return 'failed';
  }

  return args.answerContainer ? 'completed' : 'empty';
}

export function buildAnswerCandidateGroups(input: {
  activeResponseRuns: RunDto[];
  answerCandidates: AnswerCandidateDto[];
  answerContainers: AnswerContainer[];
  answerSelections: AnswerSelectionDto[];
  liveAssistantDraftsByRunId: LiveAssistantDraftsByRunId;
  runFeedback: RunFeedbackDto[];
}): AnswerCandidateGroup[] {
  const containersByRunId = new Map(
    input.answerContainers
      .filter((container): container is AnswerContainer & { runId: string } => typeof container.runId === 'string')
      .map((container) => [container.runId, container] as const)
  );
  const activeRunsById = new Map(input.activeResponseRuns.map((run) => [run.id, run] as const));
  const selectionsByTrigger = new Map(input.answerSelections.map((selection) => [selection.triggerMessageId, selection] as const));
  const feedbackByRunId = new Map(input.runFeedback.map((feedback) => [feedback.runId, feedback] as const));

  return [...groupCandidatesByTrigger(input.answerCandidates).entries()]
    .filter(([, candidates]) => candidates.length > 1)
    .map(([triggerMessageId, candidates]) => {
      const sortedCandidates = [...candidates].sort((left, right) => left.ordinal - right.ordinal);
      const selection = selectionsByTrigger.get(triggerMessageId) ?? null;
      const candidateRunIds = new Set(sortedCandidates.map((candidate) => candidate.runId));
      const selectedRunId =
        selection && candidateRunIds.has(selection.selectedRunId)
          ? selection.selectedRunId
          : sortedCandidates[0]?.runId ?? null;

      return {
        id: `answer-candidate-group:${triggerMessageId}`,
        threadId: sortedCandidates[0]?.threadId ?? '',
        triggerMessageId,
        selection,
        candidates: sortedCandidates.map((candidate) => {
          const answerContainer = containersByRunId.get(candidate.runId) ?? null;
          const liveAssistantDraft = input.liveAssistantDraftsByRunId[candidate.runId] ?? null;
          const run = activeRunsById.get(candidate.runId) ?? null;

          return {
            id: `answer-candidate:${candidate.runId}`,
            candidate,
            answerContainer,
            liveAssistantDraft,
            run,
            status: resolveCandidateStatus({ answerContainer, liveDraft: liveAssistantDraft, run }),
            selected: selectedRunId === candidate.runId,
            isDefault: candidate.ordinal === 0,
            feedback: feedbackByRunId.get(candidate.runId) ?? null
          };
        })
      };
    });
}
