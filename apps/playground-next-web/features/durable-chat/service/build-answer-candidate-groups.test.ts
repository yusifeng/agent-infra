import type { AnswerCandidateDto, AnswerSelectionDto, RunFeedbackDto } from '@agent-infra/contracts';
import { describe, expect, it } from 'vitest';

import { buildAnswerCandidateGroups } from './build-answer-candidate-groups';
import type { AnswerContainer } from '@/features/durable-chat/types/answer-containers';

function createCandidate(runId: string, ordinal: number): AnswerCandidateDto {
  return {
    id: `candidate-${ordinal}`,
    threadId: 'thread-1',
    triggerMessageId: 'message-user',
    runId,
    ordinal,
    kind: ordinal === 0 ? 'primary' : 'alternative',
    createdAt: '2026-01-01T00:00:00.000Z'
  };
}

function createContainer(runId: string): AnswerContainer {
  return {
    id: `answer-container:${runId}`,
    kind: 'assistant-answer',
    runId,
    transcriptBlockIds: [`assistant-${runId}`],
    blocks: [],
    actionHostId: `answer-container:${runId}`
  };
}

describe('buildAnswerCandidateGroups', () => {
  it('builds selected candidate groups from candidate hydration data', () => {
    const selection: AnswerSelectionDto = {
      threadId: 'thread-1',
      triggerMessageId: 'message-user',
      selectedRunId: 'run-b',
      source: 'user',
      selectedByUserId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };
    const feedback: RunFeedbackDto = {
      id: 'feedback-1',
      threadId: 'thread-1',
      triggerMessageId: 'message-user',
      runId: 'run-a',
      feedbackActorId: 'anonymous',
      value: 'thumbs_up',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };

    const groups = buildAnswerCandidateGroups({
      activeResponseRuns: [],
      answerCandidates: [createCandidate('run-a', 0), createCandidate('run-b', 1)],
      answerContainers: [createContainer('run-a'), createContainer('run-b')],
      answerSelections: [selection],
      liveAssistantDraftsByRunId: {},
      runFeedback: [feedback]
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.candidates.map((candidate) => ({
      runId: candidate.candidate.runId,
      selected: candidate.selected,
      feedback: candidate.feedback?.value ?? null
    }))).toEqual([
      { runId: 'run-a', selected: false, feedback: 'thumbs_up' },
      { runId: 'run-b', selected: true, feedback: null }
    ]);
  });

  it('falls back to the default candidate when persisted selection points at a missing run', () => {
    const groups = buildAnswerCandidateGroups({
      activeResponseRuns: [],
      answerCandidates: [createCandidate('run-a', 0), createCandidate('run-b', 1)],
      answerContainers: [createContainer('run-a'), createContainer('run-b')],
      answerSelections: [
        {
          threadId: 'thread-1',
          triggerMessageId: 'message-user',
          selectedRunId: 'run-missing',
          source: 'user',
          selectedByUserId: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      liveAssistantDraftsByRunId: {},
      runFeedback: []
    });

    expect(groups[0]?.candidates.map((candidate) => ({
      runId: candidate.candidate.runId,
      selected: candidate.selected
    }))).toEqual([
      { runId: 'run-a', selected: true },
      { runId: 'run-b', selected: false }
    ]);
  });
});
