import { InvalidDatasetInputError } from './errors.js';
import type {
  DatasetExampleEffectiveEligibilityV1,
  DatasetExampleReviewEvalEligibilityV1,
  DatasetExampleReviewExclusionReasonV1,
  DatasetExampleReviewMetadataV1,
  DatasetExampleReviewStatusV1,
  DatasetExampleReviewUpdateV1,
  DatasetExpectedOutputNormalizationV1,
  DatasetExpectedOutputV1
} from './types.js';
import {
  DATASET_EXPECTED_OUTPUT_NOTES_MAX_LENGTH,
  DATASET_EXPECTED_OUTPUT_TEXT_MAX_LENGTH,
  DATASET_REVIEWER_NOTE_MAX_LENGTH
} from './types.js';

const REVIEW_STATUSES = new Set<DatasetExampleReviewStatusV1>(['unreviewed', 'needs_expected_output', 'approved', 'excluded']);
const REVIEW_ELIGIBILITIES = new Set<DatasetExampleReviewEvalEligibilityV1>(['default', 'include', 'exclude']);
const REVIEW_EXCLUSION_REASONS = new Set<DatasetExampleReviewExclusionReasonV1>([
  'failure_case',
  'debug_case',
  'missing_expected_output',
  'not_representative',
  'sensitive_or_unsafe',
  'other'
]);
const REVIEW_UPDATE_KEYS = new Set(['status', 'evalEligibility', 'exclusionReason', 'reviewerNote']);
const PROTECTED_METADATA_KEYS = new Set(['capture', 'feedback', 'host', 'evaluation', 'metadataJson']);
const CALLER_ASSIGNED_REVIEW_KEYS = new Set(['reviewedByActorId', 'reviewedAt']);

const DEFAULT_REVIEW_METADATA: DatasetExampleReviewMetadataV1 = {
  status: 'unreviewed',
  evalEligibility: 'default',
  exclusionReason: null,
  reviewerNote: null,
  reviewedByActorId: null,
  reviewedAt: null
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.hasOwn(record, key);
}

function requireKnownKeys(record: Record<string, unknown>, allowedKeys: Set<string>, context: string) {
  for (const key of Object.keys(record)) {
    if (PROTECTED_METADATA_KEYS.has(key)) {
      throw new InvalidDatasetInputError(`${context} cannot include protected metadata namespace ${key}`, { key });
    }
    if (CALLER_ASSIGNED_REVIEW_KEYS.has(key)) {
      throw new InvalidDatasetInputError(`${context} cannot include caller-assigned review field ${key}`, { key });
    }
    if (!allowedKeys.has(key)) {
      throw new InvalidDatasetInputError(`${context} includes unknown field ${key}`, { key });
    }
  }
}

function normalizeOptionalText(value: unknown, maxLength: number, field: string) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new InvalidDatasetInputError(`${field} must be a string`, { field });
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new InvalidDatasetInputError(`${field} is too long`, { field, maxLength });
  }
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalReviewString(value: unknown, maxLength: number, field: string) {
  return normalizeOptionalText(value, maxLength, field);
}

function assertValidExpectedOutput(output: DatasetExpectedOutputV1) {
  if (output.schemaVersion !== 1) {
    throw new InvalidDatasetInputError('expected output schemaVersion must be 1', { schemaVersion: output.schemaVersion });
  }
  if (output.kind !== 'assistant_text') {
    throw new InvalidDatasetInputError('expected output kind must be assistant_text', { kind: output.kind });
  }
  if (typeof output.text !== 'string') {
    throw new InvalidDatasetInputError('expected output text must be a string');
  }

  const text = output.text.trim();
  if (!text) {
    throw new InvalidDatasetInputError('expected output text is required');
  }
  if (text.length > DATASET_EXPECTED_OUTPUT_TEXT_MAX_LENGTH) {
    throw new InvalidDatasetInputError('expected output text is too long', {
      maxLength: DATASET_EXPECTED_OUTPUT_TEXT_MAX_LENGTH
    });
  }

  const notes = normalizeOptionalText(output.notes, DATASET_EXPECTED_OUTPUT_NOTES_MAX_LENGTH, 'expected output notes');
  output.text = text;
  output.notes = notes;
}

export function parseDatasetExpectedOutputV1(value: unknown): DatasetExpectedOutputV1 | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new InvalidDatasetInputError('expected output must be an object or null');
  }

  const output: DatasetExpectedOutputV1 = {
    schemaVersion: value.schemaVersion as 1,
    kind: value.kind as 'assistant_text',
    text: value.text as string,
    ...(hasOwn(value, 'notes') ? { notes: value.notes as string | null | undefined } : {})
  };
  assertValidExpectedOutput(output);
  return output;
}

export function normalizeDatasetExpectedOutputV1(value: unknown): DatasetExpectedOutputNormalizationV1 {
  if (value === null || value === undefined) {
    return { state: 'missing', expectedOutput: null };
  }

  try {
    return { state: 'valid', expectedOutput: parseDatasetExpectedOutputV1(value) };
  } catch (error) {
    return {
      state: 'invalid',
      expectedOutput: null,
      reason: error instanceof Error && error.message ? error.message : 'invalid expected output'
    };
  }
}

export function normalizeDatasetExampleReviewMetadataV1(value: unknown): DatasetExampleReviewMetadataV1 {
  if (!isRecord(value)) {
    return { ...DEFAULT_REVIEW_METADATA };
  }

  const status = REVIEW_STATUSES.has(value.status as DatasetExampleReviewStatusV1)
    ? (value.status as DatasetExampleReviewStatusV1)
    : DEFAULT_REVIEW_METADATA.status;
  const evalEligibility = REVIEW_ELIGIBILITIES.has(value.evalEligibility as DatasetExampleReviewEvalEligibilityV1)
    ? (value.evalEligibility as DatasetExampleReviewEvalEligibilityV1)
    : DEFAULT_REVIEW_METADATA.evalEligibility;
  const exclusionReason = REVIEW_EXCLUSION_REASONS.has(value.exclusionReason as DatasetExampleReviewExclusionReasonV1)
    ? (value.exclusionReason as DatasetExampleReviewExclusionReasonV1)
    : null;
  const reviewerNote = typeof value.reviewerNote === 'string' ? value.reviewerNote : null;
  const reviewedByActorId = typeof value.reviewedByActorId === 'string' ? value.reviewedByActorId : null;
  const reviewedAt = typeof value.reviewedAt === 'string' ? value.reviewedAt : null;

  return {
    status,
    evalEligibility,
    exclusionReason,
    reviewerNote,
    reviewedByActorId,
    reviewedAt
  };
}

export function normalizeDatasetExampleMetadataEnvelopeV1(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

export function parseDatasetExampleReviewUpdateV1(value: unknown): DatasetExampleReviewUpdateV1 {
  if (!isRecord(value)) {
    throw new InvalidDatasetInputError('review update must be an object');
  }

  requireKnownKeys(value, REVIEW_UPDATE_KEYS, 'review update');

  const update: DatasetExampleReviewUpdateV1 = {};
  if (hasOwn(value, 'status')) {
    if (!REVIEW_STATUSES.has(value.status as DatasetExampleReviewStatusV1)) {
      throw new InvalidDatasetInputError('invalid review status', { status: value.status });
    }
    update.status = value.status as DatasetExampleReviewStatusV1;
  }
  if (hasOwn(value, 'evalEligibility')) {
    if (!REVIEW_ELIGIBILITIES.has(value.evalEligibility as DatasetExampleReviewEvalEligibilityV1)) {
      throw new InvalidDatasetInputError('invalid review evalEligibility', { evalEligibility: value.evalEligibility });
    }
    update.evalEligibility = value.evalEligibility as DatasetExampleReviewEvalEligibilityV1;
  }
  if (hasOwn(value, 'exclusionReason')) {
    if (value.exclusionReason === null) {
      update.exclusionReason = null;
    } else if (REVIEW_EXCLUSION_REASONS.has(value.exclusionReason as DatasetExampleReviewExclusionReasonV1)) {
      update.exclusionReason = value.exclusionReason as DatasetExampleReviewExclusionReasonV1;
    } else {
      throw new InvalidDatasetInputError('invalid review exclusionReason', { exclusionReason: value.exclusionReason });
    }
  }
  if (hasOwn(value, 'reviewerNote')) {
    update.reviewerNote = parseOptionalReviewString(value.reviewerNote, DATASET_REVIEWER_NOTE_MAX_LENGTH, 'reviewer note');
  }

  return update;
}

export function mergeDatasetExampleReviewMetadataV1(input: {
  metadataJson: unknown;
  update: DatasetExampleReviewUpdateV1;
  expectedOutputJson: unknown;
  reviewedByActorId?: string | null;
  reviewedAt: Date;
}): Record<string, unknown> {
  const metadata = normalizeDatasetExampleMetadataEnvelopeV1(input.metadataJson);
  const current = normalizeDatasetExampleReviewMetadataV1(metadata.review);
  const next: DatasetExampleReviewMetadataV1 = {
    ...current,
    ...input.update
  };
  if (input.update.status === 'unreviewed') {
    next.evalEligibility = 'default';
    next.exclusionReason = null;
  }

  const expectedOutput = normalizeDatasetExpectedOutputV1(input.expectedOutputJson);
  validateDatasetExampleReviewStateV1(next, expectedOutput);

  const reviewStateChanged =
    next.status !== current.status ||
    next.evalEligibility !== current.evalEligibility ||
    next.exclusionReason !== current.exclusionReason ||
    next.reviewerNote !== current.reviewerNote;
  if (next.status === 'unreviewed') {
    next.reviewedByActorId = null;
    next.reviewedAt = null;
  } else if (reviewStateChanged) {
    next.reviewedByActorId = input.reviewedByActorId ?? null;
    next.reviewedAt = input.reviewedAt.toISOString();
  }

  return {
    ...metadata,
    review: next
  };
}

export function validateDatasetExampleReviewStateV1(
  review: DatasetExampleReviewMetadataV1,
  expectedOutput: DatasetExpectedOutputNormalizationV1
) {
  if (review.status === 'excluded' && review.evalEligibility === 'include') {
    throw new InvalidDatasetInputError('excluded examples cannot be explicitly included for eval');
  }
  if (review.status === 'approved' && expectedOutput.state !== 'valid') {
    throw new InvalidDatasetInputError('approved examples require valid expected output');
  }
  if (review.evalEligibility === 'include' && expectedOutput.state !== 'valid') {
    throw new InvalidDatasetInputError('included examples require valid expected output');
  }
}

export function computeDatasetExampleEffectiveEligibilityV1(input: {
  expectedOutputJson: unknown;
  metadataJson: unknown;
}): DatasetExampleEffectiveEligibilityV1 {
  const metadata = normalizeDatasetExampleMetadataEnvelopeV1(input.metadataJson);
  const review = normalizeDatasetExampleReviewMetadataV1(metadata.review);
  const expectedOutput = normalizeDatasetExpectedOutputV1(input.expectedOutputJson);
  const defaultEligible = isRecord(metadata.evaluation) && metadata.evaluation.defaultEligible === true;

  if (review.status === 'excluded' && review.evalEligibility === 'include') {
    return { eligible: false, reason: 'ineligible_contradictory_review_state' };
  }
  if (review.status === 'excluded') {
    return { eligible: false, reason: 'ineligible_excluded_by_review' };
  }
  if (review.evalEligibility === 'exclude') {
    return { eligible: false, reason: 'ineligible_excluded_by_review' };
  }
  if (review.status === 'unreviewed') {
    return { eligible: false, reason: 'ineligible_unreviewed' };
  }
  if (review.status === 'needs_expected_output') {
    return { eligible: false, reason: 'ineligible_needs_expected_output' };
  }
  if (expectedOutput.state === 'invalid') {
    return { eligible: false, reason: 'ineligible_invalid_expected_output' };
  }
  if (expectedOutput.state === 'missing') {
    return { eligible: false, reason: 'ineligible_missing_expected_output' };
  }
  if (review.evalEligibility === 'include') {
    return { eligible: true, reason: 'eligible_included_by_review' };
  }
  if (!defaultEligible) {
    return { eligible: false, reason: 'ineligible_capture_default' };
  }

  return { eligible: true, reason: 'eligible_default' };
}
