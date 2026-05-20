import type {
  EvalExampleResultDto,
  EvalExampleResultReviewStatusDto,
  EvalRunDto
} from '@agent-infra/contracts';

import {
  projectEvalExampleResultComparisonV1,
  type EvalResultComparisonProjectionV1
} from './eval-result-comparison.js';

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

export type EvalRunCompareSideV1 = {
  resultId: string;
  evalRunId: string;
  status: EvalExampleResultDto['status'];
  reviewStatus: EvalExampleResultReviewStatusDto;
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
  baselineRun: EvalRunDto;
  baselineResults: EvalExampleResultDto[];
  candidateRun: EvalRunDto;
  candidateResults: EvalExampleResultDto[];
};

type IndexedResults =
  | {
      duplicate: false;
      result: EvalExampleResultDto;
    }
  | {
      duplicate: true;
      result: EvalExampleResultDto;
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

function reviewStatus(result: EvalExampleResultDto): EvalExampleResultReviewStatusDto {
  return result.review?.status ?? 'unreviewed';
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readTotalTokens(result: EvalExampleResultDto): number | null {
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

function readDurationMs(result: EvalExampleResultDto): number | null {
  if (!result.startedAt || !result.finishedAt) {
    return null;
  }

  const startedAt = Date.parse(result.startedAt);
  const finishedAt = Date.parse(result.finishedAt);
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

function indexResults(results: EvalExampleResultDto[]): Map<string, IndexedResults> {
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

function signalFor(result: EvalExampleResultDto, expectedEvalRunId: string): EvalRunCompareResultSignalV1 {
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

function buildSide(result: EvalExampleResultDto, expectedEvalRunId: string): EvalRunCompareSideV1 {
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
