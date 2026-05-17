import { describe, expect, it } from 'vitest';

import {
  computeDatasetExampleEffectiveEligibilityV1,
  mergeDatasetExampleReviewMetadataV1,
  normalizeDatasetExampleMetadataEnvelopeV1,
  normalizeDatasetExampleReviewMetadataV1,
  normalizeDatasetExpectedOutputV1,
  parseDatasetExampleReviewUpdateV1,
  parseDatasetExpectedOutputV1
} from '../src/dataset-review';
import { InvalidDatasetInputError } from '../src/errors';

describe('dataset review helpers', () => {
  it('parses valid expected output and trims reviewer text', () => {
    expect(
      parseDatasetExpectedOutputV1({
        schemaVersion: 1,
        kind: 'assistant_text',
        text: '  expected answer  ',
        notes: ' reviewer context '
      })
    ).toEqual({
      schemaVersion: 1,
      kind: 'assistant_text',
      text: 'expected answer',
      notes: 'reviewer context'
    });
  });

  it('rejects invalid expected output shapes and whitespace text on writes', () => {
    expect(() => parseDatasetExpectedOutputV1({ schemaVersion: 1, kind: 'assistant_text', text: '   ' })).toThrow(InvalidDatasetInputError);
    expect(() => parseDatasetExpectedOutputV1({ schemaVersion: 1, kind: 'json_assertion', text: 'ok' })).toThrow(InvalidDatasetInputError);
    expect(() => parseDatasetExpectedOutputV1('legacy text')).toThrow(InvalidDatasetInputError);
  });

  it('normalizes missing, valid, and legacy invalid expected output for reads', () => {
    expect(normalizeDatasetExpectedOutputV1(null)).toEqual({ state: 'missing', expectedOutput: null });
    expect(normalizeDatasetExpectedOutputV1({ schemaVersion: 1, kind: 'assistant_text', text: 'ok' })).toEqual({
      state: 'valid',
      expectedOutput: { schemaVersion: 1, kind: 'assistant_text', text: 'ok', notes: null }
    });
    expect(normalizeDatasetExpectedOutputV1({ schemaVersion: 999, kind: 'assistant_text', text: 'ok' })).toMatchObject({
      state: 'invalid',
      expectedOutput: null
    });
  });

  it('defaults missing or invalid review metadata', () => {
    expect(normalizeDatasetExampleReviewMetadataV1(undefined)).toEqual({
      status: 'unreviewed',
      evalEligibility: 'default',
      exclusionReason: null,
      reviewerNote: null,
      reviewedByActorId: null,
      reviewedAt: null
    });
    expect(normalizeDatasetExampleReviewMetadataV1({ status: 'approved', evalEligibility: 'include', reviewerNote: 'keep' })).toMatchObject({
      status: 'approved',
      evalEligibility: 'include',
      reviewerNote: 'keep'
    });
  });

  it('rejects unknown review fields, protected namespaces, and caller-assigned actor fields', () => {
    expect(() => parseDatasetExampleReviewUpdateV1({ status: 'approved', extra: true })).toThrow(InvalidDatasetInputError);
    expect(() => parseDatasetExampleReviewUpdateV1({ status: 'approved', capture: {} })).toThrow(InvalidDatasetInputError);
    expect(() => parseDatasetExampleReviewUpdateV1({ status: 'approved', metadataJson: null })).toThrow(InvalidDatasetInputError);
    expect(() => parseDatasetExampleReviewUpdateV1({ status: 'approved', reviewedByActorId: 'actor-1' })).toThrow(InvalidDatasetInputError);
    expect(() => parseDatasetExampleReviewUpdateV1({ status: 'approved', reviewedAt: '2026-01-01T00:00:00.000Z' })).toThrow(InvalidDatasetInputError);
  });

  it('merges review metadata while preserving protected and unknown metadata namespaces', () => {
    const reviewedAt = new Date('2026-05-17T00:00:00.000Z');
    const metadata = mergeDatasetExampleReviewMetadataV1({
      metadataJson: {
        schemaVersion: 1,
        capture: { kind: 'normal_example' },
        feedback: { sharedRunFeedback: { value: 'down' } },
        host: { playground: { reason: 'bad' } },
        evaluation: { defaultEligible: true },
        custom: { keep: true }
      },
      update: parseDatasetExampleReviewUpdateV1({ status: 'approved', evalEligibility: 'default', reviewerNote: 'good' }),
      expectedOutputJson: { schemaVersion: 1, kind: 'assistant_text', text: 'expected' },
      reviewedByActorId: 'actor-1',
      reviewedAt
    });

    expect(metadata).toMatchObject({
      schemaVersion: 1,
      capture: { kind: 'normal_example' },
      feedback: { sharedRunFeedback: { value: 'down' } },
      host: { playground: { reason: 'bad' } },
      evaluation: { defaultEligible: true },
      custom: { keep: true },
      review: {
        status: 'approved',
        evalEligibility: 'default',
        reviewerNote: 'good',
        reviewedByActorId: 'actor-1',
        reviewedAt: reviewedAt.toISOString()
      }
    });
  });

  it('normalizes null and non-object metadata envelopes to empty objects', () => {
    expect(normalizeDatasetExampleMetadataEnvelopeV1(null)).toEqual({});
    expect(normalizeDatasetExampleMetadataEnvelopeV1('legacy')).toEqual({});
  });

  it('rejects invalid review combinations during merge', () => {
    const validExpectedOutput = { schemaVersion: 1, kind: 'assistant_text', text: 'expected' };

    expect(() =>
      mergeDatasetExampleReviewMetadataV1({
        metadataJson: {},
        update: { status: 'excluded', evalEligibility: 'include' },
        expectedOutputJson: validExpectedOutput,
        reviewedAt: new Date()
      })
    ).toThrow(InvalidDatasetInputError);

    expect(() =>
      mergeDatasetExampleReviewMetadataV1({
        metadataJson: {},
        update: { status: 'approved' },
        expectedOutputJson: null,
        reviewedAt: new Date()
      })
    ).toThrow(InvalidDatasetInputError);

    expect(() =>
      mergeDatasetExampleReviewMetadataV1({
        metadataJson: {},
        update: { evalEligibility: 'include' },
        expectedOutputJson: null,
        reviewedAt: new Date()
      })
    ).toThrow(InvalidDatasetInputError);
  });

  it('clears reviewer attribution when review is reset to unreviewed', () => {
    const metadata = mergeDatasetExampleReviewMetadataV1({
      metadataJson: {
        review: {
          status: 'approved',
          evalEligibility: 'include',
          exclusionReason: 'other',
          reviewedByActorId: 'actor-1',
          reviewedAt: '2026-05-17T00:00:00.000Z'
        }
      },
      update: { status: 'unreviewed' },
      expectedOutputJson: null,
      reviewedByActorId: 'actor-2',
      reviewedAt: new Date('2026-05-18T00:00:00.000Z')
    });

    expect(metadata.review).toMatchObject({
      status: 'unreviewed',
      evalEligibility: 'default',
      exclusionReason: null,
      reviewedByActorId: null,
      reviewedAt: null
    });
  });

  it('refreshes reviewer attribution when reviewer note changes', () => {
    const reviewedAt = new Date('2026-05-18T00:00:00.000Z');
    const metadata = mergeDatasetExampleReviewMetadataV1({
      metadataJson: {
        review: {
          status: 'approved',
          evalEligibility: 'default',
          reviewerNote: 'old note',
          reviewedByActorId: 'actor-1',
          reviewedAt: '2026-05-17T00:00:00.000Z'
        }
      },
      update: { reviewerNote: 'new note' },
      expectedOutputJson: { schemaVersion: 1, kind: 'assistant_text', text: 'expected' },
      reviewedByActorId: 'actor-2',
      reviewedAt
    });

    expect(metadata.review).toMatchObject({
      reviewerNote: 'new note',
      reviewedByActorId: 'actor-2',
      reviewedAt: reviewedAt.toISOString()
    });
  });

  it('computes effective eligibility reason codes', () => {
    const expectedOutputJson = { schemaVersion: 1, kind: 'assistant_text', text: 'expected' };

    expect(computeDatasetExampleEffectiveEligibilityV1({ expectedOutputJson, metadataJson: {} })).toEqual({
      eligible: false,
      reason: 'ineligible_unreviewed'
    });
    expect(
      computeDatasetExampleEffectiveEligibilityV1({
        expectedOutputJson: null,
        metadataJson: { review: { status: 'needs_expected_output', evalEligibility: 'default' }, evaluation: { defaultEligible: true } }
      })
    ).toEqual({ eligible: false, reason: 'ineligible_needs_expected_output' });
    expect(
      computeDatasetExampleEffectiveEligibilityV1({
        expectedOutputJson,
        metadataJson: { review: { status: 'approved', evalEligibility: 'default' }, evaluation: { defaultEligible: false } }
      })
    ).toEqual({ eligible: false, reason: 'ineligible_capture_default' });
    expect(
      computeDatasetExampleEffectiveEligibilityV1({
        expectedOutputJson,
        metadataJson: { review: { status: 'approved', evalEligibility: 'default' }, evaluation: { defaultEligible: true } }
      })
    ).toEqual({ eligible: true, reason: 'eligible_default' });
    expect(
      computeDatasetExampleEffectiveEligibilityV1({
        expectedOutputJson,
        metadataJson: { review: { status: 'approved', evalEligibility: 'include' }, evaluation: { defaultEligible: false } }
      })
    ).toEqual({ eligible: true, reason: 'eligible_included_by_review' });
    expect(
      computeDatasetExampleEffectiveEligibilityV1({
        expectedOutputJson,
        metadataJson: { review: { status: 'excluded', evalEligibility: 'exclude' }, evaluation: { defaultEligible: true } }
      })
    ).toEqual({ eligible: false, reason: 'ineligible_excluded_by_review' });
    expect(
      computeDatasetExampleEffectiveEligibilityV1({
        expectedOutputJson,
        metadataJson: { review: { status: 'excluded', evalEligibility: 'default' }, evaluation: { defaultEligible: true } }
      })
    ).toEqual({ eligible: false, reason: 'ineligible_excluded_by_review' });
    expect(
      computeDatasetExampleEffectiveEligibilityV1({
        expectedOutputJson,
        metadataJson: { review: { status: 'excluded', evalEligibility: 'include' }, evaluation: { defaultEligible: true } }
      })
    ).toEqual({ eligible: false, reason: 'ineligible_contradictory_review_state' });
  });
});
