import type { DatasetExampleDto } from '@agent-infra/contracts';

export function formatJsonPreview(value: Record<string, unknown> | null | undefined) {
  if (!value) {
    return 'null';
  }

  return JSON.stringify(value, null, 2);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function readCaptureKind(example: DatasetExampleDto | null | undefined) {
  const metadata = asRecord(example?.metadataJson);
  const capture = asRecord(metadata?.capture);
  return typeof capture?.kind === 'string' ? capture.kind : 'unknown';
}

export function hasOmittedToolSnapshot(example: DatasetExampleDto | null | undefined) {
  const snapshot = asRecord(example?.toolInvocationsSnapshotJson);
  if (!snapshot) {
    return false;
  }

  return snapshot.omitted === true || snapshot.status === 'omitted';
}

export function buildSourceRunHref(example: DatasetExampleDto | null | undefined) {
  if (!example?.sourceThreadId || !example.sourceRunId) {
    return null;
  }

  const params = new URLSearchParams({
    threadId: example.sourceThreadId,
    runId: example.sourceRunId
  });
  return `/observability?${params.toString()}`;
}

export function formatEligibilityLabel(example: DatasetExampleDto | null | undefined) {
  const eligibility = example?.effectiveEligibility;
  if (!eligibility) {
    return 'unknown';
  }

  return eligibility.eligible ? 'eligible' : 'not eligible';
}

export function formatExpectedOutputState(example: DatasetExampleDto | null | undefined) {
  return example?.expectedOutput?.state ?? 'missing';
}
