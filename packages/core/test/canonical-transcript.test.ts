import { describe, expect, it } from 'vitest';

import { projectCanonicalTranscript } from '../src/canonical-transcript';
import type { AnswerCandidate, AnswerSelection, Message, Run } from '../src/types';

const createdAt = new Date('2026-04-10T00:00:00.000Z');

function message(input: Partial<Message> & Pick<Message, 'id' | 'role' | 'seq'>): Message {
  return {
    threadId: 'thread-1',
    runId: null,
    status: 'completed',
    metadata: null,
    createdAt,
    ...input
  };
}

function run(input: Partial<Run> & Pick<Run, 'id' | 'triggerMessageId'>): Run {
  return {
    threadId: 'thread-1',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    status: 'completed',
    usage: null,
    error: null,
    startedAt: createdAt,
    finishedAt: createdAt,
    createdAt,
    ...input
  };
}

function candidate(input: Pick<AnswerCandidate, 'id' | 'runId' | 'ordinal' | 'kind'>): AnswerCandidate {
  return {
    threadId: 'thread-1',
    triggerMessageId: 'user-1',
    createdAt,
    ...input
  };
}

describe('projectCanonicalTranscript', () => {
  it('keeps only the selected candidate run while preserving user ordering', () => {
    const runs = [
      run({ id: 'run-primary', triggerMessageId: 'user-1' }),
      run({ id: 'run-alt', triggerMessageId: 'user-1' })
    ];
    const answerCandidates = [
      candidate({ id: 'candidate-primary', runId: 'run-primary', ordinal: 0, kind: 'primary' }),
      candidate({ id: 'candidate-alt', runId: 'run-alt', ordinal: 1, kind: 'alternative' })
    ];
    const answerSelections: AnswerSelection[] = [
      {
        threadId: 'thread-1',
        triggerMessageId: 'user-1',
        selectedRunId: 'run-alt',
        source: 'user',
        selectedByUserId: 'user-1',
        createdAt,
        updatedAt: createdAt
      }
    ];

    const projection = projectCanonicalTranscript({
      messages: [
        message({ id: 'user-1', role: 'user', seq: 1 }),
        message({ id: 'primary-answer', role: 'assistant', runId: 'run-primary', seq: 2 }),
        message({ id: 'alt-answer', role: 'assistant', runId: 'run-alt', seq: 3 })
      ],
      runs,
      answerCandidates,
      answerSelections
    });

    expect(projection.canonicalRunIds).toEqual(['run-alt']);
    expect(projection.messages.map((item) => item.id)).toEqual(['user-1', 'alt-answer']);
    expect(projection.diagnostics).toEqual([]);
  });

  it('uses cutoff messages for sibling pre-answer history snapshots', () => {
    const projection = projectCanonicalTranscript({
      messages: [
        message({ id: 'system-1', role: 'system', seq: 1 }),
        message({ id: 'user-1', role: 'user', seq: 2 }),
        message({ id: 'assistant-1', role: 'assistant', runId: 'run-1', seq: 3 })
      ],
      runs: [run({ id: 'run-1', triggerMessageId: 'user-1' })],
      answerCandidates: [],
      answerSelections: [],
      cutoffMessageId: 'user-1'
    });

    expect(projection.messages.map((item) => item.id)).toEqual(['system-1', 'user-1']);
  });

  it('falls back from failed selected candidates to a completed candidate', () => {
    const projection = projectCanonicalTranscript({
      messages: [
        message({ id: 'user-1', role: 'user', seq: 1 }),
        message({ id: 'alt-answer', role: 'assistant', runId: 'run-alt', seq: 2 })
      ],
      runs: [
        run({ id: 'run-primary', triggerMessageId: 'user-1', status: 'failed' }),
        run({ id: 'run-alt', triggerMessageId: 'user-1' })
      ],
      answerCandidates: [
        candidate({ id: 'candidate-primary', runId: 'run-primary', ordinal: 0, kind: 'primary' }),
        candidate({ id: 'candidate-alt', runId: 'run-alt', ordinal: 1, kind: 'alternative' })
      ],
      answerSelections: [
        {
          threadId: 'thread-1',
          triggerMessageId: 'user-1',
          selectedRunId: 'run-primary',
          source: 'default',
          selectedByUserId: null,
          createdAt,
          updatedAt: createdAt
        }
      ]
    });

    expect(projection.canonicalRunIds).toEqual(['run-alt']);
    expect(projection.messages.map((item) => item.id)).toEqual(['user-1', 'alt-answer']);
    expect(projection.diagnostics.map((diagnostic) => diagnostic.code)).toContain('failed_selected_candidate_fallback');
  });
});
