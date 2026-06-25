import type { ProviderTranscriptEntry } from '@agent-infra/core';

const PROVIDER_TRANSCRIPT_REPLAY_ENTRY_LIMIT = 50;
const PROVIDER_TRANSCRIPT_REPLAY_SUMMARY_LIMIT = 12;
const PROVIDER_TRANSCRIPT_REPLAY_SUMMARY_MAX_LENGTH = 240;

export interface ProviderTranscriptSummary {
  entryCount: number;
  entryTypes: Record<string, number>;
  firstOrdinal: number | null;
  lastOrdinal: number | null;
  lastRunId: string | null;
}

export interface ProviderTranscriptReplayEntryRef {
  entryType: string;
  ordinal: number;
  providerEntryId: string | null;
  runId: string | null;
  summary?: string | null;
}

export interface ProviderTranscriptReplayPlan {
  available: boolean;
  entryCount: number;
  entries: ProviderTranscriptReplayEntryRef[];
  fromOrdinal: number | null;
  sourceRunIds: string[];
  toOrdinal: number | null;
}

export function summarizeProviderTranscript(entries: ProviderTranscriptEntry[]): ProviderTranscriptSummary {
  const entryTypes: Record<string, number> = {};
  for (const entry of entries) {
    entryTypes[entry.entryType] = (entryTypes[entry.entryType] ?? 0) + 1;
  }

  return {
    entryCount: entries.length,
    entryTypes,
    firstOrdinal: entries[0]?.ordinal ?? null,
    lastOrdinal: entries.at(-1)?.ordinal ?? null,
    lastRunId: entries.at(-1)?.runId ?? null
  };
}

export function buildProviderTranscriptReplayPlan(entries: ProviderTranscriptEntry[]): ProviderTranscriptReplayPlan {
  const replayEntries = entries.slice(-PROVIDER_TRANSCRIPT_REPLAY_ENTRY_LIMIT);
  const summaryStartOrdinal =
    replayEntries.length > PROVIDER_TRANSCRIPT_REPLAY_SUMMARY_LIMIT
      ? replayEntries.at(-PROVIDER_TRANSCRIPT_REPLAY_SUMMARY_LIMIT)?.ordinal
      : replayEntries[0]?.ordinal;
  const entryRefs = replayEntries.map((entry) => ({
    entryType: entry.entryType,
    ordinal: entry.ordinal,
    providerEntryId: entry.providerEntryId ?? null,
    runId: entry.runId ?? null,
    summary: summaryStartOrdinal != null && entry.ordinal >= summaryStartOrdinal ? summarizeProviderTranscriptEntry(entry) : null
  }));
  const sourceRunIds = Array.from(
    new Set(entryRefs.map((entry) => entry.runId).filter((runId): runId is string => Boolean(runId)))
  );

  return {
    available: entryRefs.length > 0,
    entryCount: entries.length,
    entries: entryRefs,
    fromOrdinal: entryRefs[0]?.ordinal ?? null,
    sourceRunIds,
    toOrdinal: entryRefs.at(-1)?.ordinal ?? null
  };
}

function summarizeProviderTranscriptEntry(entry: ProviderTranscriptEntry): string | null {
  const text = findFirstText(entry.rawJson);
  if (!text) {
    return null;
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  return normalized.length > PROVIDER_TRANSCRIPT_REPLAY_SUMMARY_MAX_LENGTH
    ? `${normalized.slice(0, PROVIDER_TRANSCRIPT_REPLAY_SUMMARY_MAX_LENGTH).trimEnd()}...`
    : normalized;
}

function findFirstText(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = findFirstText(item);
      if (text) {
        return text;
      }
    }
    return null;
  }
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const key of ['text', 'content', 'result', 'summary', 'message']) {
    const text = findFirstText(record[key]);
    if (text) {
      return text;
    }
  }

  return null;
}
