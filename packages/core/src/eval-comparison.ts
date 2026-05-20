export type EvalExampleResultReviewStatusV1 = 'unreviewed' | 'pass' | 'fail' | 'needs_review' | 'not_applicable';

export type EvalResultComparisonOutcomeV1 = 'match' | 'mismatch' | 'not_comparable';

export type EvalResultComparisonReasonV1 =
  | 'normalized_text_equal'
  | 'normalized_text_different'
  | 'result_not_completed'
  | 'result_failed'
  | 'missing_expected_output'
  | 'unsupported_expected_output_shape'
  | 'missing_expected_text'
  | 'empty_expected_text'
  | 'missing_actual_output'
  | 'unsupported_actual_output_shape'
  | 'actual_output_error'
  | 'missing_actual_assistant_messages'
  | 'missing_actual_text'
  | 'empty_actual_text';

export type EvalResultComparisonDiagnosticV1 =
  | 'multiple_actual_assistant_messages'
  | 'non_text_actual_parts_omitted'
  | 'empty_actual_text_parts_omitted';

export type EvalActualTextBlockV1 = {
  messageId: string;
  seq?: number | null;
  text: string;
};

export type EvalExpectedTextProjectionV1 =
  | {
      ok: true;
      text: string;
    }
  | {
      ok: false;
      reason:
        | 'missing_expected_output'
        | 'unsupported_expected_output_shape'
        | 'missing_expected_text'
        | 'empty_expected_text';
    };

export type EvalActualTextProjectionV1 =
  | {
      ok: true;
      text: string;
      blocks: EvalActualTextBlockV1[];
      diagnostics: EvalResultComparisonDiagnosticV1[];
    }
  | {
      ok: false;
      reason:
        | 'missing_actual_output'
        | 'unsupported_actual_output_shape'
        | 'actual_output_error'
        | 'missing_actual_assistant_messages'
        | 'missing_actual_text'
        | 'empty_actual_text';
      text: string | null;
      blocks: EvalActualTextBlockV1[];
      diagnostics: EvalResultComparisonDiagnosticV1[];
    };

export type EvalResultComparisonProjectionV1 = {
  schemaVersion: 1;
  kind: 'eval_result_comparison';
  strategy: 'normalized_text_v1';
  outcome: EvalResultComparisonOutcomeV1;
  reason: EvalResultComparisonReasonV1;
  diagnostics: EvalResultComparisonDiagnosticV1[];
  expectedText?: string | null;
  actualText?: string | null;
  actualTextBlocks: EvalActualTextBlockV1[];
};

export type EvalRunCompareOutcomeV1 =
  | 'same_pass'
  | 'same_fail'
  | 'regression'
  | 'improvement'
  | 'same_unresolved'
  | 'changed_unresolved'
  | 'baseline_missing'
  | 'candidate_missing'
  | 'not_comparable';

export type EvalRunCompareReasonV1 =
  | 'manual_same_pass'
  | 'manual_same_fail'
  | 'manual_pass_to_fail'
  | 'manual_fail_to_pass'
  | 'unreviewed_text_same'
  | 'unreviewed_text_changed'
  | 'unresolved_signal_same'
  | 'unresolved_signal_changed'
  | 'both_review_not_applicable'
  | 'baseline_missing_result'
  | 'candidate_missing_result'
  | 'different_dataset'
  | 'baseline_duplicate_dataset_example_result'
  | 'candidate_duplicate_dataset_example_result'
  | 'both_duplicate_dataset_example_result'
  | 'baseline_result_eval_run_mismatch'
  | 'candidate_result_eval_run_mismatch'
  | 'baseline_needs_review_vs_candidate_pass'
  | 'baseline_needs_review_vs_candidate_fail'
  | 'candidate_needs_review_vs_baseline_pass'
  | 'candidate_needs_review_vs_baseline_fail'
  | 'baseline_not_applicable_vs_candidate_pass'
  | 'baseline_not_applicable_vs_candidate_fail'
  | 'candidate_not_applicable_vs_baseline_pass'
  | 'candidate_not_applicable_vs_baseline_fail'
  | 'baseline_unreviewed_vs_candidate_pass'
  | 'baseline_unreviewed_vs_candidate_fail'
  | 'candidate_unreviewed_vs_baseline_pass'
  | 'candidate_unreviewed_vs_baseline_fail'
  | 'baseline_result_unresolved_vs_candidate_pass'
  | 'baseline_result_unresolved_vs_candidate_fail'
  | 'candidate_result_unresolved_vs_baseline_pass'
  | 'candidate_result_unresolved_vs_baseline_fail';

export type EvalRunCompareResultSignalV1 =
  | 'manual_pass'
  | 'manual_fail'
  | 'manual_needs_review'
  | 'manual_not_applicable'
  | 'unreviewed_text_match'
  | 'unreviewed_text_mismatch'
  | 'unreviewed_not_comparable'
  | 'result_failed_unreviewed'
  | 'result_not_completed_unreviewed'
  | 'invalid_eval_run';

export type EvalRunCompareResultStatusLike = 'queued' | 'running' | 'completed' | 'failed' | 'skipped';

export type EvalComparisonMessagePartLike = {
  partIndex: number;
  type: string;
  textValue?: string | null;
};

export type EvalComparisonMessageLike = {
  id: string;
  seq: number;
  parts: EvalComparisonMessagePartLike[];
};

export type EvalComparisonActualOutputLike = {
  error?: string | null;
  assistantMessages: EvalComparisonMessageLike[];
};

export type EvalComparisonResultReviewLike = {
  status?: EvalExampleResultReviewStatusV1 | null;
};

export type EvalComparisonResultLike = {
  id: string;
  evalRunId: string;
  datasetExampleId: string;
  exampleOrdinal: number;
  status: EvalRunCompareResultStatusLike;
  expectedOutputJson: unknown;
  actualOutputJson?: unknown;
  actualOutput?: EvalComparisonActualOutputLike | null;
  usageJson?: unknown;
  metadataJson?: unknown;
  review?: EvalComparisonResultReviewLike | null;
  startedAt?: Date | string | null;
  finishedAt?: Date | string | null;
};

export type EvalComparisonRunLike = {
  id: string;
  datasetId: string;
};

export type EvalRunCompareSideV1 = {
  resultId: string;
  evalRunId: string;
  status: EvalRunCompareResultStatusLike;
  reviewStatus: EvalExampleResultReviewStatusV1;
  signal: EvalRunCompareResultSignalV1;
  comparison: EvalResultComparisonProjectionV1;
  usage: {
    totalTokens: number | null;
  };
  durationMs: number | null;
};

export type EvalRunCompareRowV1 = {
  datasetExampleId: string;
  exampleOrdinal: number | null;
  outcome: EvalRunCompareOutcomeV1;
  reason: EvalRunCompareReasonV1;
  baseline: EvalRunCompareSideV1 | null;
  candidate: EvalRunCompareSideV1 | null;
};

export type EvalRunCompareDeltaV1 = {
  baseline: number | null;
  candidate: number | null;
  absoluteDelta: number | null;
  percentDelta: number | null;
};

export type EvalRunCompareSummaryV1 = {
  totalRows: number;
  outcomeCounts: Record<EvalRunCompareOutcomeV1, number>;
  usageDelta: EvalRunCompareDeltaV1;
  durationDelta: EvalRunCompareDeltaV1;
};

export type EvalRunCompareProjectionV1 = {
  schemaVersion: 1;
  kind: 'eval_run_compare';
  comparable: boolean;
  datasetId: string | null;
  baselineRunId: string;
  candidateRunId: string;
  summary: EvalRunCompareSummaryV1;
  rows: EvalRunCompareRowV1[];
  error?: {
    outcome: 'not_comparable';
    reason: Extract<EvalRunCompareReasonV1, 'different_dataset'>;
  } | null;
};

export type ProjectEvalRunCompareV1Input = {
  baselineRun: EvalComparisonRunLike;
  baselineResults: EvalComparisonResultLike[];
  candidateRun: EvalComparisonRunLike;
  candidateResults: EvalComparisonResultLike[];
};

type IndexedResults =
  | {
      duplicate: false;
      result: EvalComparisonResultLike;
    }
  | {
      duplicate: true;
      result: EvalComparisonResultLike;
    };

const EMPTY_OUTCOME_COUNTS: Record<EvalRunCompareOutcomeV1, number> = {
  same_pass: 0,
  same_fail: 0,
  regression: 0,
  improvement: 0,
  same_unresolved: 0,
  changed_unresolved: 0,
  baseline_missing: 0,
  candidate_missing: 0,
  not_comparable: 0
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function emptyDelta(): EvalRunCompareDeltaV1 {
  return {
    baseline: null,
    candidate: null,
    absoluteDelta: null,
    percentDelta: null
  };
}

function emptySummary(): EvalRunCompareSummaryV1 {
  return {
    totalRows: 0,
    outcomeCounts: { ...EMPTY_OUTCOME_COUNTS },
    usageDelta: emptyDelta(),
    durationDelta: emptyDelta()
  };
}

function reviewStatus(result: EvalComparisonResultLike): EvalExampleResultReviewStatusV1 {
  return result.review?.status ?? 'unreviewed';
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readTotalTokens(result: EvalComparisonResultLike): number | null {
  const usage = result.usageJson;
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    return null;
  }

  const record = usage as Record<string, unknown>;
  const tokens = record.tokens && typeof record.tokens === 'object' && !Array.isArray(record.tokens)
    ? record.tokens as Record<string, unknown>
    : null;

  return readFiniteNumber(tokens?.total) ?? readFiniteNumber(record.totalTokens);
}

function readTimeMs(value: Date | string | null | undefined) {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'string') {
    return Date.parse(value);
  }
  return Number.NaN;
}

function readDurationMs(result: EvalComparisonResultLike): number | null {
  const startedAt = readTimeMs(result.startedAt);
  const finishedAt = readTimeMs(result.finishedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) {
    return null;
  }

  const durationMs = finishedAt - startedAt;
  return durationMs >= 0 ? durationMs : null;
}

function buildDelta(baseline: number | null, candidate: number | null): EvalRunCompareDeltaV1 {
  const absoluteDelta = baseline === null || candidate === null ? null : candidate - baseline;
  const percentDelta = baseline === null || baseline === 0 || absoluteDelta === null ? null : absoluteDelta / baseline;
  return {
    baseline,
    candidate,
    absoluteDelta,
    percentDelta
  };
}

function sumNullable(values: Array<number | null>): number | null {
  const finiteValues = values.filter((value): value is number => value !== null);
  if (finiteValues.length === 0) {
    return null;
  }

  return finiteValues.reduce((total, value) => total + value, 0);
}

function indexResults(results: EvalComparisonResultLike[]): Map<string, IndexedResults> {
  const index = new Map<string, IndexedResults>();
  for (const result of results) {
    const current = index.get(result.datasetExampleId);
    if (!current) {
      index.set(result.datasetExampleId, { duplicate: false, result });
      continue;
    }

    index.set(result.datasetExampleId, { duplicate: true, result: current.result });
  }

  return index;
}

function sortDatasetExampleIds(ids: Set<string>, baselineIndex: Map<string, IndexedResults>, candidateIndex: Map<string, IndexedResults>) {
  return [...ids].sort((left, right) => {
    const leftOrdinal = baselineIndex.get(left)?.result.exampleOrdinal ?? candidateIndex.get(left)?.result.exampleOrdinal ?? Number.MAX_SAFE_INTEGER;
    const rightOrdinal = baselineIndex.get(right)?.result.exampleOrdinal ?? candidateIndex.get(right)?.result.exampleOrdinal ?? Number.MAX_SAFE_INTEGER;
    if (leftOrdinal !== rightOrdinal) {
      return leftOrdinal - rightOrdinal;
    }

    return left.localeCompare(right);
  });
}

export function normalizeComparisonTextV1(text: string) {
  return text.replace(/\r\n?/g, '\n').trim().replace(/\s+/g, ' ');
}

export function extractEvalExpectedTextV1(result: EvalComparisonResultLike): EvalExpectedTextProjectionV1 {
  const expectedOutput = asRecord(result.expectedOutputJson);
  if (!expectedOutput) {
    return { ok: false, reason: 'missing_expected_output' };
  }

  if (expectedOutput.schemaVersion !== 1 || expectedOutput.kind !== 'assistant_text') {
    return { ok: false, reason: 'unsupported_expected_output_shape' };
  }

  if (typeof expectedOutput.text !== 'string') {
    return { ok: false, reason: 'missing_expected_text' };
  }

  if (!expectedOutput.text.trim()) {
    return { ok: false, reason: 'empty_expected_text' };
  }

  return { ok: true, text: expectedOutput.text };
}

function orderedMessages(messages: EvalComparisonMessageLike[]) {
  return [...messages].sort((left, right) => {
    if (left.seq !== right.seq) {
      return left.seq - right.seq;
    }

    return left.id.localeCompare(right.id);
  });
}

function buildTextBlock(message: EvalComparisonMessageLike, diagnostics: Set<EvalResultComparisonDiagnosticV1>) {
  let sawTextPart = false;
  let sawEmptyTextPart = false;
  const textValues: string[] = [];

  for (const part of [...message.parts].sort((left, right) => left.partIndex - right.partIndex)) {
    if (part.type !== 'text') {
      diagnostics.add('non_text_actual_parts_omitted');
      continue;
    }

    sawTextPart = true;
    const textValue = part.textValue ?? '';
    if (!textValue.trim()) {
      sawEmptyTextPart = true;
      diagnostics.add('empty_actual_text_parts_omitted');
      continue;
    }

    textValues.push(textValue);
  }

  return {
    block: textValues.length > 0
      ? {
          messageId: message.id,
          seq: message.seq,
          text: textValues.join('\n')
        }
      : null,
    sawTextPart,
    sawEmptyTextPart
  };
}

export function extractEvalActualTextV1(result: EvalComparisonResultLike): EvalActualTextProjectionV1 {
  if (!result.actualOutput) {
    return {
      ok: false,
      reason: result.actualOutputJson ? 'unsupported_actual_output_shape' : 'missing_actual_output',
      text: null,
      blocks: [],
      diagnostics: []
    };
  }

  if (result.actualOutput.error) {
    return {
      ok: false,
      reason: 'actual_output_error',
      text: null,
      blocks: [],
      diagnostics: []
    };
  }

  if (result.actualOutput.assistantMessages.length === 0) {
    return {
      ok: false,
      reason: 'missing_actual_assistant_messages',
      text: null,
      blocks: [],
      diagnostics: []
    };
  }

  const diagnostics = new Set<EvalResultComparisonDiagnosticV1>();
  if (result.actualOutput.assistantMessages.length > 1) {
    diagnostics.add('multiple_actual_assistant_messages');
  }

  let sawTextPart = false;
  let sawEmptyTextPart = false;
  const blocks: EvalActualTextBlockV1[] = [];

  for (const message of orderedMessages(result.actualOutput.assistantMessages)) {
    const blockResult = buildTextBlock(message, diagnostics);
    sawTextPart ||= blockResult.sawTextPart;
    sawEmptyTextPart ||= blockResult.sawEmptyTextPart;
    if (blockResult.block) {
      blocks.push(blockResult.block);
    }
  }

  if (blocks.length === 0) {
    return {
      ok: false,
      reason: sawTextPart || sawEmptyTextPart ? 'empty_actual_text' : 'missing_actual_text',
      text: null,
      blocks,
      diagnostics: [...diagnostics]
    };
  }

  const text = blocks.map((block) => block.text).join('\n\n');
  return {
    ok: true,
    text,
    blocks,
    diagnostics: [...diagnostics]
  };
}

export function projectEvalExampleResultComparisonV1(result: EvalComparisonResultLike): EvalResultComparisonProjectionV1 {
  const expected = extractEvalExpectedTextV1(result);
  const actual = extractEvalActualTextV1(result);
  const expectedText = expected.ok ? expected.text : null;
  const actualText = actual.ok ? actual.text : actual.text;
  const actualTextBlocks = actual.blocks;
  const diagnostics = actual.diagnostics;

  if (result.status !== 'completed') {
    const failedReason = !actual.ok && actual.reason === 'actual_output_error' ? 'actual_output_error' : 'result_failed';
    return {
      schemaVersion: 1,
      kind: 'eval_result_comparison',
      strategy: 'normalized_text_v1',
      outcome: 'not_comparable',
      reason: result.status === 'failed' ? failedReason : 'result_not_completed',
      diagnostics,
      expectedText,
      actualText,
      actualTextBlocks
    };
  }

  if (!expected.ok) {
    return {
      schemaVersion: 1,
      kind: 'eval_result_comparison',
      strategy: 'normalized_text_v1',
      outcome: 'not_comparable',
      reason: expected.reason,
      diagnostics,
      expectedText,
      actualText,
      actualTextBlocks
    };
  }

  if (!actual.ok) {
    return {
      schemaVersion: 1,
      kind: 'eval_result_comparison',
      strategy: 'normalized_text_v1',
      outcome: 'not_comparable',
      reason: actual.reason,
      diagnostics,
      expectedText,
      actualText,
      actualTextBlocks
    };
  }

  const matches = normalizeComparisonTextV1(expected.text) === normalizeComparisonTextV1(actual.text);
  return {
    schemaVersion: 1,
    kind: 'eval_result_comparison',
    strategy: 'normalized_text_v1',
    outcome: matches ? 'match' : 'mismatch',
    reason: matches ? 'normalized_text_equal' : 'normalized_text_different',
    diagnostics,
    expectedText: expected.text,
    actualText: actual.text,
    actualTextBlocks
  };
}

function signalFor(result: EvalComparisonResultLike, expectedEvalRunId: string): EvalRunCompareResultSignalV1 {
  if (result.evalRunId !== expectedEvalRunId) {
    return 'invalid_eval_run';
  }

  const review = reviewStatus(result);
  if (review === 'pass') {
    return 'manual_pass';
  }
  if (review === 'fail') {
    return 'manual_fail';
  }
  if (review === 'needs_review') {
    return 'manual_needs_review';
  }
  if (review === 'not_applicable') {
    return 'manual_not_applicable';
  }

  if (result.status === 'failed') {
    return 'result_failed_unreviewed';
  }
  if (result.status !== 'completed') {
    return 'result_not_completed_unreviewed';
  }

  const comparison = projectEvalExampleResultComparisonV1(result);
  if (comparison.outcome === 'match') {
    return 'unreviewed_text_match';
  }
  if (comparison.outcome === 'mismatch') {
    return 'unreviewed_text_mismatch';
  }

  return 'unreviewed_not_comparable';
}

function buildSide(result: EvalComparisonResultLike, expectedEvalRunId: string): EvalRunCompareSideV1 {
  return {
    resultId: result.id,
    evalRunId: result.evalRunId,
    status: result.status,
    reviewStatus: reviewStatus(result),
    signal: signalFor(result, expectedEvalRunId),
    comparison: projectEvalExampleResultComparisonV1(result),
    usage: {
      totalTokens: readTotalTokens(result)
    },
    durationMs: readDurationMs(result)
  };
}

function formalSignal(signal: EvalRunCompareResultSignalV1): 'pass' | 'fail' | null {
  if (signal === 'manual_pass') {
    return 'pass';
  }
  if (signal === 'manual_fail') {
    return 'fail';
  }

  return null;
}

function unresolvedReasonAgainstFormal(
  unresolvedSide: 'baseline' | 'candidate',
  unresolvedSignal: EvalRunCompareResultSignalV1,
  formal: 'pass' | 'fail'
): EvalRunCompareReasonV1 {
  if (unresolvedSignal === 'manual_needs_review') {
    return unresolvedSide === 'baseline'
      ? formal === 'pass' ? 'baseline_needs_review_vs_candidate_pass' : 'baseline_needs_review_vs_candidate_fail'
      : formal === 'pass' ? 'candidate_needs_review_vs_baseline_pass' : 'candidate_needs_review_vs_baseline_fail';
  }
  if (unresolvedSignal === 'manual_not_applicable') {
    return unresolvedSide === 'baseline'
      ? formal === 'pass' ? 'baseline_not_applicable_vs_candidate_pass' : 'baseline_not_applicable_vs_candidate_fail'
      : formal === 'pass' ? 'candidate_not_applicable_vs_baseline_pass' : 'candidate_not_applicable_vs_baseline_fail';
  }
  if (unresolvedSignal.startsWith('unreviewed_')) {
    return unresolvedSide === 'baseline'
      ? formal === 'pass' ? 'baseline_unreviewed_vs_candidate_pass' : 'baseline_unreviewed_vs_candidate_fail'
      : formal === 'pass' ? 'candidate_unreviewed_vs_baseline_pass' : 'candidate_unreviewed_vs_baseline_fail';
  }

  return unresolvedSide === 'baseline'
    ? formal === 'pass' ? 'baseline_result_unresolved_vs_candidate_pass' : 'baseline_result_unresolved_vs_candidate_fail'
    : formal === 'pass' ? 'candidate_result_unresolved_vs_baseline_pass' : 'candidate_result_unresolved_vs_baseline_fail';
}

function classifySignals(
  baselineSignal: EvalRunCompareResultSignalV1,
  candidateSignal: EvalRunCompareResultSignalV1
): Pick<EvalRunCompareRowV1, 'outcome' | 'reason'> {
  if (baselineSignal === 'invalid_eval_run') {
    return { outcome: 'not_comparable', reason: 'baseline_result_eval_run_mismatch' };
  }
  if (candidateSignal === 'invalid_eval_run') {
    return { outcome: 'not_comparable', reason: 'candidate_result_eval_run_mismatch' };
  }

  const baselineFormal = formalSignal(baselineSignal);
  const candidateFormal = formalSignal(candidateSignal);

  if (baselineFormal && candidateFormal) {
    if (baselineFormal === 'pass' && candidateFormal === 'pass') {
      return { outcome: 'same_pass', reason: 'manual_same_pass' };
    }
    if (baselineFormal === 'fail' && candidateFormal === 'fail') {
      return { outcome: 'same_fail', reason: 'manual_same_fail' };
    }
    if (baselineFormal === 'pass' && candidateFormal === 'fail') {
      return { outcome: 'regression', reason: 'manual_pass_to_fail' };
    }

    return { outcome: 'improvement', reason: 'manual_fail_to_pass' };
  }

  if (baselineFormal) {
    return {
      outcome: 'changed_unresolved',
      reason: unresolvedReasonAgainstFormal('candidate', candidateSignal, baselineFormal)
    };
  }

  if (candidateFormal) {
    return {
      outcome: 'changed_unresolved',
      reason: unresolvedReasonAgainstFormal('baseline', baselineSignal, candidateFormal)
    };
  }

  if (baselineSignal === 'manual_not_applicable' && candidateSignal === 'manual_not_applicable') {
    return { outcome: 'same_unresolved', reason: 'both_review_not_applicable' };
  }

  if (baselineSignal === 'unreviewed_text_match' && candidateSignal === 'unreviewed_text_match') {
    return { outcome: 'same_unresolved', reason: 'unreviewed_text_same' };
  }
  if (baselineSignal === 'unreviewed_text_mismatch' && candidateSignal === 'unreviewed_text_mismatch') {
    return { outcome: 'same_unresolved', reason: 'unreviewed_text_same' };
  }
  if (
    (baselineSignal === 'unreviewed_text_match' && candidateSignal === 'unreviewed_text_mismatch') ||
    (baselineSignal === 'unreviewed_text_mismatch' && candidateSignal === 'unreviewed_text_match')
  ) {
    return { outcome: 'changed_unresolved', reason: 'unreviewed_text_changed' };
  }

  if (baselineSignal === candidateSignal) {
    return { outcome: 'same_unresolved', reason: 'unresolved_signal_same' };
  }

  return { outcome: 'changed_unresolved', reason: 'unresolved_signal_changed' };
}

function buildSummary(rows: EvalRunCompareRowV1[]): EvalRunCompareSummaryV1 {
  const outcomeCounts = { ...EMPTY_OUTCOME_COUNTS };
  for (const row of rows) {
    outcomeCounts[row.outcome] += 1;
  }

  const baselineTokens = sumNullable(rows.map((row) => row.baseline?.usage.totalTokens ?? null));
  const candidateTokens = sumNullable(rows.map((row) => row.candidate?.usage.totalTokens ?? null));
  const baselineDuration = sumNullable(rows.map((row) => row.baseline?.durationMs ?? null));
  const candidateDuration = sumNullable(rows.map((row) => row.candidate?.durationMs ?? null));

  return {
    totalRows: rows.length,
    outcomeCounts,
    usageDelta: buildDelta(baselineTokens, candidateTokens),
    durationDelta: buildDelta(baselineDuration, candidateDuration)
  };
}

function buildRow(
  datasetExampleId: string,
  baselineIndexed: IndexedResults | undefined,
  candidateIndexed: IndexedResults | undefined,
  baselineRunId: string,
  candidateRunId: string
): EvalRunCompareRowV1 {
  const baselineResult = baselineIndexed?.result ?? null;
  const candidateResult = candidateIndexed?.result ?? null;
  const exampleOrdinal = baselineResult?.exampleOrdinal ?? candidateResult?.exampleOrdinal ?? null;

  if (baselineIndexed?.duplicate && candidateIndexed?.duplicate) {
    return {
      datasetExampleId,
      exampleOrdinal,
      outcome: 'not_comparable',
      reason: 'both_duplicate_dataset_example_result',
      baseline: baselineResult ? buildSide(baselineResult, baselineRunId) : null,
      candidate: candidateResult ? buildSide(candidateResult, candidateRunId) : null
    };
  }
  if (baselineIndexed?.duplicate) {
    return {
      datasetExampleId,
      exampleOrdinal,
      outcome: 'not_comparable',
      reason: 'baseline_duplicate_dataset_example_result',
      baseline: baselineResult ? buildSide(baselineResult, baselineRunId) : null,
      candidate: candidateResult ? buildSide(candidateResult, candidateRunId) : null
    };
  }
  if (candidateIndexed?.duplicate) {
    return {
      datasetExampleId,
      exampleOrdinal,
      outcome: 'not_comparable',
      reason: 'candidate_duplicate_dataset_example_result',
      baseline: baselineResult ? buildSide(baselineResult, baselineRunId) : null,
      candidate: candidateResult ? buildSide(candidateResult, candidateRunId) : null
    };
  }

  if (!baselineResult) {
    return {
      datasetExampleId,
      exampleOrdinal,
      outcome: 'baseline_missing',
      reason: 'baseline_missing_result',
      baseline: null,
      candidate: candidateResult ? buildSide(candidateResult, candidateRunId) : null
    };
  }
  if (!candidateResult) {
    return {
      datasetExampleId,
      exampleOrdinal,
      outcome: 'candidate_missing',
      reason: 'candidate_missing_result',
      baseline: buildSide(baselineResult, baselineRunId),
      candidate: null
    };
  }

  const baseline = buildSide(baselineResult, baselineRunId);
  const candidate = buildSide(candidateResult, candidateRunId);
  const classification = classifySignals(baseline.signal, candidate.signal);

  return {
    datasetExampleId,
    exampleOrdinal,
    ...classification,
    baseline,
    candidate
  };
}

export function projectEvalRunCompareV1(input: ProjectEvalRunCompareV1Input): EvalRunCompareProjectionV1 {
  const { baselineRun, baselineResults, candidateRun, candidateResults } = input;

  if (baselineRun.datasetId !== candidateRun.datasetId) {
    return {
      schemaVersion: 1,
      kind: 'eval_run_compare',
      comparable: false,
      datasetId: null,
      baselineRunId: baselineRun.id,
      candidateRunId: candidateRun.id,
      summary: emptySummary(),
      rows: [],
      error: {
        outcome: 'not_comparable',
        reason: 'different_dataset'
      }
    };
  }

  const baselineIndex = indexResults(baselineResults);
  const candidateIndex = indexResults(candidateResults);
  const datasetExampleIds = new Set([...baselineIndex.keys(), ...candidateIndex.keys()]);
  const rows = sortDatasetExampleIds(datasetExampleIds, baselineIndex, candidateIndex).map((datasetExampleId) => {
    return buildRow(
      datasetExampleId,
      baselineIndex.get(datasetExampleId),
      candidateIndex.get(datasetExampleId),
      baselineRun.id,
      candidateRun.id
    );
  });

  return {
    schemaVersion: 1,
    kind: 'eval_run_compare',
    comparable: true,
    datasetId: baselineRun.datasetId,
    baselineRunId: baselineRun.id,
    candidateRunId: candidateRun.id,
    summary: buildSummary(rows),
    rows,
    error: null
  };
}
