import { describe, expect, it } from 'vitest';
import type { DatasetExampleDto } from '@agent-infra/contracts';

import {
  buildSourceRunHref,
  formatEligibilityLabel,
  formatExpectedOutputState,
  hasOmittedToolSnapshot,
  readCaptureKind
} from './dataset-review';

function example(overrides: Partial<DatasetExampleDto> = {}): DatasetExampleDto {
  return {
    id: 'example-1',
    datasetId: 'dataset-1',
    sourceRunId: 'run-1',
    sourceThreadId: 'thread-1',
    triggerMessageId: 'message-1',
    inputJson: {},
    baselineOutputJson: null,
    expectedOutputJson: null,
    expectedOutput: { state: 'missing' as const, expectedOutput: null },
    metadataJson: { capture: { kind: 'failure_case' } },
    review: { status: 'unreviewed', evalEligibility: 'default' },
    effectiveEligibility: { eligible: false, reason: 'ineligible_unreviewed' },
    contextSnapshotJson: null,
    toolInvocationsSnapshotJson: null,
    createdByActorId: 'actor-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

describe('dataset review presentation helpers', () => {
  it('reads capture kind, expected output state, and eligibility from DTO projections', () => {
    expect(readCaptureKind(example())).toBe('failure_case');
    expect(formatExpectedOutputState(example())).toBe('missing');
    expect(formatEligibilityLabel(example())).toBe('not eligible');
    expect(formatEligibilityLabel(example({ effectiveEligibility: { eligible: true, reason: 'eligible_default' } }))).toBe('eligible');
  });

  it('builds source run links only when lineage ids are present', () => {
    expect(buildSourceRunHref(example())).toBe('/observability?threadId=thread-1&runId=run-1');
    expect(buildSourceRunHref(example({ sourceRunId: null }))).toBeNull();
  });

  it('detects policy-omitted tool snapshots', () => {
    expect(hasOmittedToolSnapshot(example({ toolInvocationsSnapshotJson: { omitted: true } }))).toBe(true);
    expect(hasOmittedToolSnapshot(example({ toolInvocationsSnapshotJson: { status: 'omitted' } }))).toBe(true);
    expect(hasOmittedToolSnapshot(example({ toolInvocationsSnapshotJson: { state: 'omitted_by_policy' } }))).toBe(true);
    expect(hasOmittedToolSnapshot(example({ toolInvocationsSnapshotJson: { toolInvocations: [] } }))).toBe(false);
  });
});
