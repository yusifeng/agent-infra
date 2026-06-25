import type {
  AgentContinuityContext,
  AgentContinuityEntrySummary
} from '@agent-infra/cloud-agent-runtime';

import type { CloudThread } from './thread-store';

export function buildProviderSessionContinuity(thread: CloudThread): AgentContinuityContext | null {
  const metadata = thread.providerSessionMetadata;
  if (!isRecord(metadata) || (metadata.lifecycleAction !== 'replay' && metadata.lifecycleAction !== 'compact')) {
    return null;
  }

  const transcriptReplay = metadata.transcriptReplay;
  if (!isRecord(transcriptReplay)) {
    return null;
  }

  const plan = isRecord(transcriptReplay.plan) ? transcriptReplay.plan : null;
  if (!plan || plan.available !== true) {
    return null;
  }

  const summary = isRecord(transcriptReplay.summary) ? transcriptReplay.summary : null;
  const sourceRunIds = Array.isArray(plan.sourceRunIds)
    ? plan.sourceRunIds.filter((runId): runId is string => typeof runId === 'string')
    : [];
  const entryCount = typeof summary?.entryCount === 'number' ? summary.entryCount : null;
  const entries = readContinuityEntrySummaries(plan.entries);

  return {
    entries,
    fromOrdinal: typeof plan.fromOrdinal === 'number' ? plan.fromOrdinal : null,
    previousProviderSessionId: thread.providerSessionId ?? null,
    sourceRunIds,
    strategy: metadata.lifecycleAction === 'compact' ? 'compact' : 'replay_transcript',
    summary: entryCount == null ? null : `${entryCount} provider transcript entries are available for continuity.`,
    toOrdinal: typeof plan.toOrdinal === 'number' ? plan.toOrdinal : null
  };
}

function readContinuityEntrySummaries(value: unknown): AgentContinuityEntrySummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.entryType !== 'string' || typeof entry.ordinal !== 'number') {
      return [];
    }

    return [
      {
        entryType: entry.entryType,
        ordinal: entry.ordinal,
        providerEntryId: typeof entry.providerEntryId === 'string' ? entry.providerEntryId : null,
        runId: typeof entry.runId === 'string' ? entry.runId : null,
        summary: typeof entry.summary === 'string' && entry.summary.trim() ? entry.summary : null
      }
    ];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
