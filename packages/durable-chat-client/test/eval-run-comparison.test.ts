import type {
  EvalActualOutputSnapshotV1Dto,
  EvalExampleResultDto,
  EvalRunDto,
  MessageDto,
  MessagePartDto
} from '@agent-infra/contracts';
import { describe, expect, it } from 'vitest';

import { projectEvalRunCompareV1 } from '../src/service/eval-run-comparison';

function part(input: Partial<MessagePartDto> & { partIndex: number; type: MessagePartDto['type'] }): MessagePartDto {
  return {
    id: input.id ?? `part-${input.partIndex}`,
    messageId: input.messageId ?? 'message-1',
    partIndex: input.partIndex,
    type: input.type,
    textValue: input.textValue ?? null,
    jsonValue: input.jsonValue ?? null,
    createdAt: input.createdAt ?? '2026-01-01T00:00:00.000Z'
  };
}

function message(input: Partial<MessageDto> & { id: string; seq: number; text?: string }): MessageDto {
  return {
    id: input.id,
    threadId: input.threadId ?? 'thread-1',
    runId: input.runId ?? 'run-1',
    role: input.role ?? 'assistant',
    seq: input.seq,
    status: input.status ?? 'completed',
    metadata: input.metadata ?? null,
    createdAt: input.createdAt ?? '2026-01-01T00:00:00.000Z',
    parts: input.parts ?? [part({ messageId: input.id, partIndex: 0, type: 'text', textValue: input.text ?? 'Expected answer' })]
  };
}

function actualOutput(text = 'Expected answer', input: Partial<EvalActualOutputSnapshotV1Dto> = {}): EvalActualOutputSnapshotV1Dto {
  return {
    schemaVersion: 1,
    kind: 'eval_run_output',
    outputRunId: input.outputRunId ?? 'run-1',
    evalThreadId: input.evalThreadId ?? 'eval-thread-1',
    status: input.status ?? 'completed',
    error: input.error ?? null,
    assistantMessages: input.assistantMessages ?? [message({ id: 'message-1', seq: 1, text })]
  };
}

function evalRun(input: Partial<EvalRunDto> & { id: string }): EvalRunDto {
  return {
    id: input.id,
    appId: input.appId ?? 'playground-runtime-pi',
    datasetId: input.datasetId ?? 'dataset-1',
    status: input.status ?? 'completed',
    name: input.name ?? null,
    configJson: input.configJson ?? {},
    config: input.config ?? null,
    summaryJson: input.summaryJson ?? {},
    summary: input.summary ?? null,
    error: input.error ?? null,
    createdByActorId: input.createdByActorId ?? 'user-1',
    startedAt: Object.hasOwn(input, 'startedAt') ? input.startedAt : '2026-01-01T00:00:00.000Z',
    finishedAt: Object.hasOwn(input, 'finishedAt') ? input.finishedAt : '2026-01-01T00:00:01.000Z',
    createdAt: input.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-01-01T00:00:01.000Z'
  };
}

type ResultInput = Partial<EvalExampleResultDto> & {
  actualText?: string;
};

function result(input: ResultInput = {}): EvalExampleResultDto {
  const output = Object.hasOwn(input, 'actualOutput') ? input.actualOutput : actualOutput(input.actualText);
  return {
    id: input.id ?? 'result-1',
    evalRunId: input.evalRunId ?? 'baseline-run',
    datasetExampleId: input.datasetExampleId ?? 'example-1',
    exampleOrdinal: input.exampleOrdinal ?? 1,
    status: input.status ?? 'completed',
    evalThreadId: input.evalThreadId ?? 'eval-thread-1',
    outputRunId: input.outputRunId ?? 'run-1',
    expectedOutputJson: Object.hasOwn(input, 'expectedOutputJson') ? input.expectedOutputJson! : {
      schemaVersion: 1,
      kind: 'assistant_text',
      text: 'Expected answer'
    },
    actualOutputJson: Object.hasOwn(input, 'actualOutputJson') ? input.actualOutputJson : output,
    actualOutput: output,
    inputJson: input.inputJson ?? null,
    usageJson: input.usageJson ?? { totalTokens: 10 },
    metadataJson: input.metadataJson ?? null,
    review: input.review ?? {
      status: 'unreviewed',
      reviewerNote: null,
      reviewedByActorId: null,
      reviewedAt: null
    },
    error: input.error ?? null,
    startedAt: Object.hasOwn(input, 'startedAt') ? input.startedAt : '2026-01-01T00:00:00.000Z',
    finishedAt: Object.hasOwn(input, 'finishedAt') ? input.finishedAt : '2026-01-01T00:00:01.000Z',
    createdAt: input.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-01-01T00:00:01.000Z'
  };
}

function reviewed(status: NonNullable<EvalExampleResultDto['review']>['status']) {
  return {
    status,
    reviewerNote: null,
    reviewedByActorId: 'reviewer-1',
    reviewedAt: '2026-01-01T00:00:02.000Z'
  };
}

function compare(
  baselineResults: EvalExampleResultDto[],
  candidateResults: EvalExampleResultDto[],
  runs: { baselineRun?: EvalRunDto; candidateRun?: EvalRunDto } = {}
) {
  const baselineRun = runs.baselineRun ?? evalRun({ id: 'baseline-run' });
  const candidateRun = runs.candidateRun ?? evalRun({ id: 'candidate-run' });
  return projectEvalRunCompareV1({
    baselineRun,
    baselineResults,
    candidateRun,
    candidateResults
  });
}

describe('eval run comparison projection', () => {
  it('classifies formal manual review transitions', () => {
    const projection = compare(
      [
        result({ id: 'baseline-pass', datasetExampleId: 'example-1', evalRunId: 'baseline-run', review: reviewed('pass') }),
        result({ id: 'baseline-fail', datasetExampleId: 'example-2', evalRunId: 'baseline-run', exampleOrdinal: 2, review: reviewed('fail') }),
        result({ id: 'baseline-same-pass', datasetExampleId: 'example-3', evalRunId: 'baseline-run', exampleOrdinal: 3, review: reviewed('pass') }),
        result({ id: 'baseline-same-fail', datasetExampleId: 'example-4', evalRunId: 'baseline-run', exampleOrdinal: 4, review: reviewed('fail') })
      ],
      [
        result({ id: 'candidate-fail', datasetExampleId: 'example-1', evalRunId: 'candidate-run', review: reviewed('fail') }),
        result({ id: 'candidate-pass', datasetExampleId: 'example-2', evalRunId: 'candidate-run', exampleOrdinal: 2, review: reviewed('pass') }),
        result({ id: 'candidate-same-pass', datasetExampleId: 'example-3', evalRunId: 'candidate-run', exampleOrdinal: 3, review: reviewed('pass') }),
        result({ id: 'candidate-same-fail', datasetExampleId: 'example-4', evalRunId: 'candidate-run', exampleOrdinal: 4, review: reviewed('fail') })
      ]
    );

    expect(projection.rows.map((row) => [row.datasetExampleId, row.outcome, row.reason])).toEqual([
      ['example-1', 'regression', 'manual_pass_to_fail'],
      ['example-2', 'improvement', 'manual_fail_to_pass'],
      ['example-3', 'same_pass', 'manual_same_pass'],
      ['example-4', 'same_fail', 'manual_same_fail']
    ]);
    expect(projection.summary.outcomeCounts).toMatchObject({
      regression: 1,
      improvement: 1,
      same_pass: 1,
      same_fail: 1
    });
  });

  it('keeps unresolved rows separate from formal pass/fail judgments', () => {
    const projection = compare(
      [
        result({ id: 'baseline-match', datasetExampleId: 'example-1', evalRunId: 'baseline-run' }),
        result({ id: 'baseline-mismatch', datasetExampleId: 'example-2', evalRunId: 'baseline-run', exampleOrdinal: 2, actualOutput: actualOutput('Different') }),
        result({ id: 'baseline-needs-review', datasetExampleId: 'example-3', evalRunId: 'baseline-run', exampleOrdinal: 3, review: reviewed('needs_review') }),
        result({ id: 'baseline-not-applicable', datasetExampleId: 'example-4', evalRunId: 'baseline-run', exampleOrdinal: 4, review: reviewed('not_applicable') }),
        result({ id: 'baseline-pass', datasetExampleId: 'example-5', evalRunId: 'baseline-run', exampleOrdinal: 5, review: reviewed('pass') })
      ],
      [
        result({ id: 'candidate-match', datasetExampleId: 'example-1', evalRunId: 'candidate-run' }),
        result({ id: 'candidate-match-2', datasetExampleId: 'example-2', evalRunId: 'candidate-run', exampleOrdinal: 2 }),
        result({ id: 'candidate-pass', datasetExampleId: 'example-3', evalRunId: 'candidate-run', exampleOrdinal: 3, review: reviewed('pass') }),
        result({ id: 'candidate-not-applicable', datasetExampleId: 'example-4', evalRunId: 'candidate-run', exampleOrdinal: 4, review: reviewed('not_applicable') }),
        result({ id: 'candidate-needs-review', datasetExampleId: 'example-5', evalRunId: 'candidate-run', exampleOrdinal: 5, review: reviewed('needs_review') })
      ]
    );

    expect(projection.rows.map((row) => [row.datasetExampleId, row.outcome, row.reason])).toEqual([
      ['example-1', 'same_unresolved', 'unreviewed_text_same'],
      ['example-2', 'changed_unresolved', 'unreviewed_text_changed'],
      ['example-3', 'changed_unresolved', 'baseline_needs_review_vs_candidate_pass'],
      ['example-4', 'same_unresolved', 'both_review_not_applicable'],
      ['example-5', 'changed_unresolved', 'candidate_needs_review_vs_baseline_pass']
    ]);
  });

  it('lets manual fail classify failed execution results while unresolved failures stay non-formal', () => {
    const failedOutput = actualOutput('failure', { error: 'runtime failed' });
    const projection = compare(
      [
        result({ id: 'baseline-pass', datasetExampleId: 'example-1', evalRunId: 'baseline-run', review: reviewed('pass') }),
        result({ id: 'baseline-failed-fail', datasetExampleId: 'example-2', evalRunId: 'baseline-run', exampleOrdinal: 2, status: 'failed', actualOutput: failedOutput, review: reviewed('fail') }),
        result({ id: 'baseline-pass-2', datasetExampleId: 'example-3', evalRunId: 'baseline-run', exampleOrdinal: 3, review: reviewed('pass') })
      ],
      [
        result({ id: 'candidate-failed-fail', datasetExampleId: 'example-1', evalRunId: 'candidate-run', status: 'failed', actualOutput: failedOutput, review: reviewed('fail') }),
        result({ id: 'candidate-failed-fail-2', datasetExampleId: 'example-2', evalRunId: 'candidate-run', exampleOrdinal: 2, status: 'failed', actualOutput: failedOutput, review: reviewed('fail') }),
        result({ id: 'candidate-failed-unreviewed', datasetExampleId: 'example-3', evalRunId: 'candidate-run', exampleOrdinal: 3, status: 'failed', actualOutput: failedOutput })
      ]
    );

    expect(projection.rows.map((row) => [row.datasetExampleId, row.outcome, row.reason, row.candidate?.signal])).toEqual([
      ['example-1', 'regression', 'manual_pass_to_fail', 'manual_fail'],
      ['example-2', 'same_fail', 'manual_same_fail', 'manual_fail'],
      ['example-3', 'changed_unresolved', 'candidate_result_unresolved_vs_baseline_pass', 'result_failed_unreviewed']
    ]);
  });

  it('handles missing, duplicate, dataset mismatch, and evalRunId mismatch defensively', () => {
    const missingProjection = compare(
      [
        result({ id: 'baseline-only', datasetExampleId: 'example-1', evalRunId: 'baseline-run' }),
        result({ id: 'baseline-duplicate-1', datasetExampleId: 'example-3', evalRunId: 'baseline-run', exampleOrdinal: 3 }),
        result({ id: 'baseline-duplicate-2', datasetExampleId: 'example-3', evalRunId: 'baseline-run', exampleOrdinal: 3 }),
        result({ id: 'baseline-wrong-run', datasetExampleId: 'example-4', evalRunId: 'other-run', exampleOrdinal: 4 })
      ],
      [
        result({ id: 'candidate-only', datasetExampleId: 'example-2', evalRunId: 'candidate-run', exampleOrdinal: 2 }),
        result({ id: 'candidate-for-duplicate', datasetExampleId: 'example-3', evalRunId: 'candidate-run', exampleOrdinal: 3 }),
        result({ id: 'candidate-for-wrong-run', datasetExampleId: 'example-4', evalRunId: 'candidate-run', exampleOrdinal: 4 })
      ]
    );

    expect(missingProjection.rows.map((row) => [row.datasetExampleId, row.outcome, row.reason])).toEqual([
      ['example-1', 'candidate_missing', 'candidate_missing_result'],
      ['example-2', 'baseline_missing', 'baseline_missing_result'],
      ['example-3', 'not_comparable', 'baseline_duplicate_dataset_example_result'],
      ['example-4', 'not_comparable', 'baseline_result_eval_run_mismatch']
    ]);

    const mismatchProjection = compare(
      [result({ evalRunId: 'baseline-run' })],
      [result({ evalRunId: 'candidate-run' })],
      {
        baselineRun: evalRun({ id: 'baseline-run', datasetId: 'dataset-1' }),
        candidateRun: evalRun({ id: 'candidate-run', datasetId: 'dataset-2' })
      }
    );

    expect(mismatchProjection).toMatchObject({
      comparable: false,
      datasetId: null,
      rows: [],
      error: { outcome: 'not_comparable', reason: 'different_dataset' },
      summary: { totalRows: 0 }
    });
  });

  it('calculates null-safe usage and duration deltas from comparable rows', () => {
    const projection = compare(
      [
        result({
          id: 'baseline-1',
          datasetExampleId: 'example-1',
          evalRunId: 'baseline-run',
          usageJson: { totalTokens: 10 },
          startedAt: '2026-01-01T00:00:00.000Z',
          finishedAt: '2026-01-01T00:00:01.000Z'
        }),
        result({
          id: 'baseline-2',
          datasetExampleId: 'example-2',
          evalRunId: 'baseline-run',
          exampleOrdinal: 2,
          usageJson: { schemaVersion: 1, tokens: { total: 30 } },
          startedAt: '2026-01-01T00:00:00.000Z',
          finishedAt: '2026-01-01T00:00:02.000Z'
        })
      ],
      [
        result({
          id: 'candidate-1',
          datasetExampleId: 'example-1',
          evalRunId: 'candidate-run',
          usageJson: { totalTokens: 20 },
          startedAt: '2026-01-01T00:00:00.000Z',
          finishedAt: '2026-01-01T00:00:03.000Z'
        }),
        result({
          id: 'candidate-2',
          datasetExampleId: 'example-2',
          evalRunId: 'candidate-run',
          exampleOrdinal: 2,
          usageJson: { malformed: true },
          startedAt: null,
          finishedAt: null
        })
      ]
    );

    expect(projection.summary.usageDelta).toEqual({
      baseline: 40,
      candidate: 20,
      absoluteDelta: -20,
      percentDelta: -0.5
    });
    expect(projection.summary.durationDelta).toEqual({
      baseline: 3000,
      candidate: 3000,
      absoluteDelta: 0,
      percentDelta: 0
    });
  });
});
