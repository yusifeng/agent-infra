import type { DatasetExample, EvalExampleResult, EvalExampleResultStatus, RunUsageSummaryV1 } from '@agent-infra/core';

import { InvalidEvalInputError } from './errors.js';
import {
  computeDatasetExampleEffectiveEligibilityV1,
  normalizeDatasetExpectedOutputV1,
  parseDatasetExpectedOutputV1
} from './dataset-review.js';
import type {
  DatasetExampleEffectiveEligibilityReasonV1,
  DatasetExpectedOutputV1,
  EvalExampleResultReviewStatusV1,
  EvalExampleResultReviewUpdateV1,
  EvalExampleResultReviewV1,
  EvalRunConfigV1,
  EvalRunSummaryV1
} from './types.js';

const EVAL_REVIEW_STATUSES = new Set<EvalExampleResultReviewStatusV1>([
  'unreviewed',
  'pass',
  'fail',
  'needs_review',
  'not_applicable'
]);
const EVAL_REVIEW_UPDATE_KEYS = new Set(['status', 'reviewerNote']);
const EVAL_CALLER_ASSIGNED_REVIEW_KEYS = new Set(['reviewedByActorId', 'reviewedAt']);
const EVAL_REVIEWER_NOTE_MAX_LENGTH = 4000;

const DEFAULT_EVAL_REVIEW: EvalExampleResultReviewV1 = {
  status: 'unreviewed',
  reviewerNote: null,
  reviewedByActorId: null,
  reviewedAt: null
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOptionalText(value: unknown, maxLength: number, field: string) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new InvalidEvalInputError(`${field} must be a string`, { field });
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new InvalidEvalInputError(`${field} is too long`, { field, maxLength });
  }
  return trimmed.length > 0 ? trimmed : null;
}

function incrementCount(record: Record<string, number>, key: string, amount = 1) {
  record[key] = (record[key] ?? 0) + amount;
}

function isRunUsageSummaryV1(value: unknown): value is RunUsageSummaryV1 {
  return isRecord(value) && value.schemaVersion === 1 && isRecord(value.tokens);
}

function aggregateEvalResultUsage(results: EvalExampleResult[]): RunUsageSummaryV1 | null {
  const usageItems: RunUsageSummaryV1[] = [];
  for (const result of results) {
    if (isRunUsageSummaryV1(result.usageJson)) {
      usageItems.push(result.usageJson);
    }
  }
  if (usageItems.length === 0) {
    return null;
  }

  const tokens: RunUsageSummaryV1['tokens'] = {};
  let provider: string | null | undefined = usageItems[0]?.provider ?? null;
  let model: string | null | undefined = usageItems[0]?.model ?? null;

  for (const usage of usageItems) {
    if (usage.provider !== provider) provider = null;
    if (usage.model !== model) model = null;
    for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'reasoning', 'total'] as const) {
      const value = usage.tokens[key];
      if (typeof value === 'number') {
        tokens[key] = (tokens[key] ?? 0) + value;
      }
    }
  }

  return {
    schemaVersion: 1,
    provider,
    model,
    normalizationStatus: usageItems.length === results.length ? 'complete' : 'partial',
    tokens,
    estimatedCost: null,
    rawProviderUsage: null
  };
}

function aggregateEvalResultDurationMs(results: EvalExampleResult[]) {
  let total = 0;
  let hasDuration = false;

  for (const result of results) {
    if (!result.startedAt || !result.finishedAt) {
      continue;
    }
    total += Math.max(0, result.finishedAt.getTime() - result.startedAt.getTime());
    hasDuration = true;
  }

  return hasDuration ? total : null;
}

export function buildEvalRunConfigV1(input: {
  provider?: string | null;
  model?: string | null;
  runtimeOptions?: Record<string, unknown> | null;
} = {}): EvalRunConfigV1 {
  return {
    schemaVersion: 1,
    kind: 'eval_run_config',
    selection: {
      policy: 'effective_eligible_v1'
    },
    execution: {
      mode: 'current_runtime',
      strategy: 'isolated_eval_thread',
      concurrency: 'serial'
    },
    runtime: {
      provider: input.provider ?? null,
      model: input.model ?? null,
      options: input.runtimeOptions ?? null
    }
  };
}

export function parseEvalRunConfigV1(value: unknown): EvalRunConfigV1 {
  if (!isRecord(value)) {
    throw new InvalidEvalInputError('eval run config must be an object');
  }
  if (value.schemaVersion !== 1) {
    throw new InvalidEvalInputError('eval run config schemaVersion must be 1');
  }
  if (value.kind !== 'eval_run_config') {
    throw new InvalidEvalInputError('eval run config kind must be eval_run_config');
  }
  return value as unknown as EvalRunConfigV1;
}

export function parseEvalRunSummaryV1(value: unknown): EvalRunSummaryV1 {
  if (!isRecord(value)) {
    throw new InvalidEvalInputError('eval run summary must be an object');
  }
  if (value.schemaVersion !== 1) {
    throw new InvalidEvalInputError('eval run summary schemaVersion must be 1');
  }
  if (value.kind !== 'eval_run_summary') {
    throw new InvalidEvalInputError('eval run summary kind must be eval_run_summary');
  }
  return value as unknown as EvalRunSummaryV1;
}

export interface EvalExampleSelectionV1 {
  example: DatasetExample;
  expectedOutput: DatasetExpectedOutputV1;
  eligibilityReason: DatasetExampleEffectiveEligibilityReasonV1;
}

export interface EvalExampleSelectionSummaryV1 {
  eligibleCount: number;
  ineligibleCount: number;
  ineligibleReasonCounts: Record<string, number>;
  selectedCount: number;
}

export function selectEligibleDatasetExamplesV1(examples: DatasetExample[]): {
  selected: EvalExampleSelectionV1[];
  summary: EvalExampleSelectionSummaryV1;
} {
  const selected: EvalExampleSelectionV1[] = [];
  const ineligibleReasonCounts: Record<string, number> = {};

  for (const example of examples) {
    const eligibility = computeDatasetExampleEffectiveEligibilityV1({
      expectedOutputJson: example.expectedOutputJson ?? null,
      metadataJson: example.metadataJson ?? null
    });
    if (!eligibility.eligible) {
      incrementCount(ineligibleReasonCounts, eligibility.reason);
      continue;
    }

    const expected = normalizeDatasetExpectedOutputV1(example.expectedOutputJson);
    if (expected.state !== 'valid' || !expected.expectedOutput) {
      incrementCount(ineligibleReasonCounts, 'ineligible_invalid_expected_output');
      continue;
    }

    selected.push({
      example,
      expectedOutput: expected.expectedOutput,
      eligibilityReason: eligibility.reason
    });
  }

  return {
    selected,
    summary: {
      eligibleCount: selected.length,
      ineligibleCount: examples.length - selected.length,
      ineligibleReasonCounts,
      selectedCount: selected.length
    }
  };
}

export function buildExpectedOutputSnapshotFromDatasetExample(example: DatasetExample): DatasetExpectedOutputV1 {
  const expectedOutput = parseDatasetExpectedOutputV1(example.expectedOutputJson ?? null);
  if (!expectedOutput) {
    throw new InvalidEvalInputError('eligible eval example requires expected output', {
      datasetExampleId: example.id
    });
  }
  return expectedOutput;
}

export function normalizeEvalExampleResultReviewV1(metadataJson: unknown): EvalExampleResultReviewV1 {
  if (!isRecord(metadataJson) || !isRecord(metadataJson.review)) {
    return { ...DEFAULT_EVAL_REVIEW };
  }
  const review = metadataJson.review;
  const status = EVAL_REVIEW_STATUSES.has(review.status as EvalExampleResultReviewStatusV1)
    ? (review.status as EvalExampleResultReviewStatusV1)
    : DEFAULT_EVAL_REVIEW.status;
  return {
    status,
    reviewerNote: typeof review.reviewerNote === 'string' ? review.reviewerNote : null,
    reviewedByActorId: typeof review.reviewedByActorId === 'string' ? review.reviewedByActorId : null,
    reviewedAt: typeof review.reviewedAt === 'string' ? review.reviewedAt : null
  };
}

export function parseEvalExampleResultReviewUpdateV1(value: unknown): EvalExampleResultReviewUpdateV1 {
  if (!isRecord(value)) {
    throw new InvalidEvalInputError('eval result review update must be an object');
  }
  for (const key of Object.keys(value)) {
    if (EVAL_CALLER_ASSIGNED_REVIEW_KEYS.has(key)) {
      throw new InvalidEvalInputError(`eval result review update cannot include caller-assigned field ${key}`, { key });
    }
    if (!EVAL_REVIEW_UPDATE_KEYS.has(key)) {
      throw new InvalidEvalInputError(`eval result review update includes unknown field ${key}`, { key });
    }
  }

  const update: EvalExampleResultReviewUpdateV1 = {};
  if (Object.hasOwn(value, 'status')) {
    if (!EVAL_REVIEW_STATUSES.has(value.status as EvalExampleResultReviewStatusV1)) {
      throw new InvalidEvalInputError('invalid eval result review status', { status: value.status });
    }
    update.status = value.status as EvalExampleResultReviewStatusV1;
  }
  if (Object.hasOwn(value, 'reviewerNote')) {
    update.reviewerNote = normalizeOptionalText(value.reviewerNote, EVAL_REVIEWER_NOTE_MAX_LENGTH, 'eval result reviewer note');
  }

  return update;
}

export function mergeEvalExampleResultReviewMetadataV1(input: {
  metadataJson: unknown;
  update: EvalExampleResultReviewUpdateV1;
  reviewedByActorId?: string | null;
  reviewedAt: Date;
}): Record<string, unknown> {
  const metadata = isRecord(input.metadataJson) ? { ...input.metadataJson } : {};
  const current = normalizeEvalExampleResultReviewV1(metadata);
  const next: EvalExampleResultReviewV1 = {
    ...current,
    ...input.update
  };

  const changed = next.status !== current.status || next.reviewerNote !== current.reviewerNote;
  if (next.status === 'unreviewed') {
    next.reviewedByActorId = null;
    next.reviewedAt = null;
  } else if (changed) {
    next.reviewedByActorId = input.reviewedByActorId ?? null;
    next.reviewedAt = input.reviewedAt.toISOString();
  }

  return {
    ...metadata,
    review: next
  };
}

export function buildEvalRunSummaryV1(input: {
  selection: EvalExampleSelectionSummaryV1;
  results?: EvalExampleResult[];
}): EvalRunSummaryV1 {
  const statusCounts: Record<EvalExampleResultStatus, number> = {
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    skipped: 0
  };
  const reviewStatusCounts: Record<EvalExampleResultReviewStatusV1, number> = {
    unreviewed: 0,
    pass: 0,
    fail: 0,
    needs_review: 0,
    not_applicable: 0
  };

  for (const result of input.results ?? []) {
    statusCounts[result.status] += 1;
    const review = normalizeEvalExampleResultReviewV1(result.metadataJson ?? null);
    reviewStatusCounts[review.status] += 1;
  }

  if (!input.results) {
    statusCounts.queued = input.selection.selectedCount;
    reviewStatusCounts.unreviewed = input.selection.selectedCount;
  }

  return {
    schemaVersion: 1,
    kind: 'eval_run_summary',
    selection: {
      eligibleCount: input.selection.eligibleCount,
      ineligibleCount: input.selection.ineligibleCount,
      ineligibleReasonCounts: input.selection.ineligibleReasonCounts,
      selectedCount: input.selection.selectedCount
    },
    results: {
      statusCounts,
      reviewStatusCounts,
      aggregateUsage: input.results ? aggregateEvalResultUsage(input.results) : null,
      durationMs: input.results ? aggregateEvalResultDurationMs(input.results) : null
    }
  };
}
