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

function readTextPart(value: unknown) {
  const part = asRecord(value);
  if (!part) {
    return null;
  }

  const type = typeof part.type === 'string' ? part.type : null;
  if (type && type !== 'text') {
    return null;
  }

  const text = part.textValue ?? part.text;
  return typeof text === 'string' ? text : null;
}

function readMessageText(value: unknown) {
  const message = asRecord(value);
  if (!message || !Array.isArray(message.parts)) {
    return null;
  }

  const text = message.parts
    .map(readTextPart)
    .filter((part): part is string => Boolean(part?.trim()))
    .map((part) => part.trim())
    .join('\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text || null;
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

  return snapshot.omitted === true || snapshot.status === 'omitted' || snapshot.state === 'omitted_by_policy';
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

export function readBaselineAssistantTexts(example: DatasetExampleDto | null | undefined) {
  const baselineOutput = asRecord(example?.baselineOutputJson);
  if (!baselineOutput) {
    return [];
  }

  if (typeof baselineOutput.text === 'string' && baselineOutput.text.trim()) {
    return [baselineOutput.text.trim()];
  }

  const assistantMessages = Array.isArray(baselineOutput.assistantMessages) ? baselineOutput.assistantMessages : [];
  return assistantMessages
    .map(readMessageText)
    .filter((text): text is string => Boolean(text));
}
