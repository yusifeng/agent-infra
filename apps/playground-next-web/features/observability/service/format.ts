import type { RunDto, RunUsageDto } from '@agent-infra/contracts';

export function formatShortId(value: string | null | undefined, visiblePrefix = 12) {
  if (!value) {
    return '-';
  }

  if (value.length <= visiblePrefix + 1) {
    return value;
  }

  return `${value.slice(0, visiblePrefix)}...`;
}

export function formatDurationMs(durationMs: number | null | undefined) {
  if (durationMs === null || durationMs === undefined || !Number.isFinite(durationMs)) {
    return '-';
  }

  if (durationMs < 1000) {
    return `${Math.max(0, Math.round(durationMs))}ms`;
  }

  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${Math.round(seconds * 10) / 10}s`;
  }

  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function getRunDurationMs(run: RunDto | null | undefined) {
  if (!run?.startedAt) {
    return null;
  }

  const startedAt = Date.parse(run.startedAt);
  const finishedAt = run.finishedAt ? Date.parse(run.finishedAt) : Date.now();
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) {
    return null;
  }

  return Math.max(0, finishedAt - startedAt);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function readNumberField(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function readTotalTokens(usage: RunUsageDto | null | undefined) {
  if (!usage || typeof usage !== 'object') {
    return null;
  }

  return readNumberField(usage as Record<string, unknown>, ['totalTokens', 'total_tokens', 'tokensTotal']);
}

export function formatTokenCount(usage: RunUsageDto | null | undefined) {
  const totalTokens = readTotalTokens(usage);
  return totalTokens === null ? '-' : new Intl.NumberFormat().format(totalTokens);
}
