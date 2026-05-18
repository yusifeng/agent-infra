import type { EvalActualOutputSnapshotV1Dto, EvalExampleResultDto, MessageDto, MessagePartDto } from '@agent-infra/contracts';
import { describe, expect, it } from 'vitest';

import {
  extractEvalActualTextV1,
  extractEvalExpectedTextV1,
  normalizeComparisonTextV1,
  projectEvalExampleResultComparisonV1
} from '../src/service/eval-result-comparison';

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

function message(input: Partial<MessageDto> & { id: string; seq: number; parts: MessagePartDto[] }): MessageDto {
  return {
    id: input.id,
    threadId: input.threadId ?? 'thread-1',
    runId: input.runId ?? 'run-1',
    role: input.role ?? 'assistant',
    seq: input.seq,
    status: input.status ?? 'completed',
    metadata: input.metadata ?? null,
    createdAt: input.createdAt ?? '2026-01-01T00:00:00.000Z',
    parts: input.parts
  };
}

function actualOutput(input: Partial<EvalActualOutputSnapshotV1Dto> = {}): EvalActualOutputSnapshotV1Dto {
  return {
    schemaVersion: 1,
    kind: 'eval_run_output',
    outputRunId: input.outputRunId ?? 'run-1',
    evalThreadId: input.evalThreadId ?? 'eval-thread-1',
    status: input.status ?? 'completed',
    error: input.error ?? null,
    assistantMessages: input.assistantMessages ?? [
      message({
        id: 'message-1',
        seq: 1,
        parts: [part({ partIndex: 0, type: 'text', textValue: 'Expected answer' })]
      })
    ]
  };
}

function result(input: Partial<EvalExampleResultDto> = {}): EvalExampleResultDto {
  const output = Object.hasOwn(input, 'actualOutput') ? input.actualOutput : actualOutput();
  return {
    id: input.id ?? 'result-1',
    evalRunId: input.evalRunId ?? 'eval-run-1',
    datasetExampleId: input.datasetExampleId ?? 'example-1',
    exampleOrdinal: input.exampleOrdinal ?? 0,
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
    usageJson: input.usageJson ?? null,
    metadataJson: input.metadataJson ?? null,
    review: input.review ?? {
      status: 'unreviewed',
      reviewerNote: null,
      reviewedByActorId: null,
      reviewedAt: null
    },
    error: input.error ?? null,
    startedAt: input.startedAt ?? null,
    finishedAt: input.finishedAt ?? null,
    createdAt: input.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-01-01T00:00:00.000Z'
  };
}

describe('eval result comparison projection', () => {
  it('normalizes comparison text by trimming, normalizing line endings, and collapsing whitespace', () => {
    expect(normalizeComparisonTextV1('  hello\r\n  world\t ')).toBe('hello world');
  });

  it('extracts expected assistant text from result expected output snapshots', () => {
    expect(extractEvalExpectedTextV1(result())).toEqual({ ok: true, text: 'Expected answer' });
    expect(extractEvalExpectedTextV1(result({ expectedOutputJson: null as unknown as Record<string, unknown> }))).toEqual({
      ok: false,
      reason: 'missing_expected_output'
    });
    expect(extractEvalExpectedTextV1(result({ expectedOutputJson: { schemaVersion: 1, kind: 'json' } }))).toEqual({
      ok: false,
      reason: 'unsupported_expected_output_shape'
    });
    expect(extractEvalExpectedTextV1(result({ expectedOutputJson: { schemaVersion: 1, kind: 'assistant_text' } }))).toEqual({
      ok: false,
      reason: 'missing_expected_text'
    });
    expect(extractEvalExpectedTextV1(result({ expectedOutputJson: { schemaVersion: 1, kind: 'assistant_text', text: '  ' } }))).toEqual({
      ok: false,
      reason: 'empty_expected_text'
    });
  });

  it('extracts actual assistant text blocks, joined text, and diagnostics', () => {
    const projection = extractEvalActualTextV1(result({
      actualOutput: actualOutput({
        assistantMessages: [
          message({
            id: 'message-2',
            seq: 2,
            parts: [
              part({ messageId: 'message-2', partIndex: 1, type: 'text', textValue: 'Second part' }),
              part({ messageId: 'message-2', partIndex: 0, type: 'text', textValue: 'First part' })
            ]
          }),
          message({
            id: 'message-1',
            seq: 1,
            parts: [
              part({ messageId: 'message-1', partIndex: 0, type: 'text', textValue: 'First message' }),
              part({ messageId: 'message-1', partIndex: 1, type: 'tool-call', jsonValue: { ok: true } }),
              part({ messageId: 'message-1', partIndex: 2, type: 'text', textValue: '   ' })
            ]
          })
        ]
      })
    }));

    expect(projection).toMatchObject({
      ok: true,
      text: 'First message\n\nFirst part\nSecond part',
      blocks: [
        { messageId: 'message-1', seq: 1, text: 'First message' },
        { messageId: 'message-2', seq: 2, text: 'First part\nSecond part' }
      ],
      diagnostics: [
        'multiple_actual_assistant_messages',
        'non_text_actual_parts_omitted',
        'empty_actual_text_parts_omitted'
      ]
    });
  });

  it('reports actual output extraction failures', () => {
    expect(extractEvalActualTextV1(result({ actualOutput: null, actualOutputJson: null }))).toMatchObject({
      ok: false,
      reason: 'missing_actual_output'
    });
    expect(extractEvalActualTextV1(result({ actualOutput: null, actualOutputJson: { broken: true } }))).toMatchObject({
      ok: false,
      reason: 'unsupported_actual_output_shape'
    });
    expect(extractEvalActualTextV1(result({ actualOutput: actualOutput({ error: 'runtime failed' }) }))).toMatchObject({
      ok: false,
      reason: 'actual_output_error'
    });
    expect(extractEvalActualTextV1(result({ actualOutput: actualOutput({ assistantMessages: [] }) }))).toMatchObject({
      ok: false,
      reason: 'missing_actual_assistant_messages'
    });
    expect(extractEvalActualTextV1(result({
      actualOutput: actualOutput({
        assistantMessages: [message({ id: 'message-1', seq: 1, parts: [part({ partIndex: 0, type: 'tool-call' })] })]
      })
    }))).toMatchObject({
      ok: false,
      reason: 'missing_actual_text'
    });
    expect(extractEvalActualTextV1(result({
      actualOutput: actualOutput({
        assistantMessages: [message({ id: 'message-1', seq: 1, parts: [part({ partIndex: 0, type: 'text', textValue: '   ' })] })]
      })
    }))).toMatchObject({
      ok: false,
      reason: 'empty_actual_text'
    });
  });

  it('projects normalized text matches and mismatches without changing review truth', () => {
    const matchingResult = result({
      expectedOutputJson: { schemaVersion: 1, kind: 'assistant_text', text: 'Expected answer' },
      actualOutput: actualOutput({
        assistantMessages: [
          message({ id: 'message-1', seq: 1, parts: [part({ partIndex: 0, type: 'text', textValue: '  Expected\n answer  ' })] })
        ]
      })
    });
    const before = structuredClone(matchingResult);
    const match = projectEvalExampleResultComparisonV1(matchingResult);

    expect(match).toMatchObject({
      outcome: 'match',
      reason: 'normalized_text_equal',
      expectedText: 'Expected answer',
      actualText: '  Expected\n answer  '
    });
    expect('review' in match).toBe(false);
    expect(matchingResult).toEqual(before);
    expect(matchingResult.review?.status).toBe('unreviewed');

    expect(projectEvalExampleResultComparisonV1(result({
      actualOutput: actualOutput({
        assistantMessages: [
          message({ id: 'message-1', seq: 1, parts: [part({ partIndex: 0, type: 'text', textValue: 'Different answer' })] })
        ]
      })
    }))).toMatchObject({
      outcome: 'mismatch',
      reason: 'normalized_text_different'
    });
  });

  it('projects not comparable reasons without reusing manual review not_applicable', () => {
    expect(projectEvalExampleResultComparisonV1(result({ status: 'queued', actualOutput: null, actualOutputJson: null }))).toMatchObject({
      outcome: 'not_comparable',
      reason: 'result_not_completed'
    });
    expect(projectEvalExampleResultComparisonV1(result({ status: 'failed', actualOutput: null, actualOutputJson: null }))).toMatchObject({
      outcome: 'not_comparable',
      reason: 'result_failed'
    });
    expect(projectEvalExampleResultComparisonV1(result({
      actualOutput: actualOutput({ error: 'runtime failed' })
    }))).toMatchObject({
      outcome: 'not_comparable',
      reason: 'actual_output_error'
    });
    expect(projectEvalExampleResultComparisonV1(result({ expectedOutputJson: { schemaVersion: 1, kind: 'assistant_text' } }))).toMatchObject({
      outcome: 'not_comparable',
      reason: 'missing_expected_text'
    });
    expect(projectEvalExampleResultComparisonV1(result({ actualOutput: null, actualOutputJson: null }))).toMatchObject({
      outcome: 'not_comparable',
      reason: 'missing_actual_output'
    });
  });
});
