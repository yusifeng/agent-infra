import type { ToolInvocationDto } from '@agent-infra/contracts';

import type { SearchPanelResultItem, SearchPanelSection } from '@/features/durable-chat/types/search';

export function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function deriveHostname(rawUrl: string) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function parseSearchResultItem(value: unknown): SearchPanelResultItem | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const url = typeof record.url === 'string' ? record.url.trim() : '';
  const snippet = typeof record.snippet === 'string' ? record.snippet.trim() : '';
  const sourceName = typeof record.sourceName === 'string' ? record.sourceName.trim() : '';

  if (!title || !url) {
    return null;
  }

  return {
    rank: typeof record.rank === 'number' && Number.isFinite(record.rank) ? record.rank : 0,
    title,
    url,
    snippet,
    sourceName,
    hostname:
      typeof record.hostname === 'string' && record.hostname.trim().length > 0
        ? record.hostname.trim().toLowerCase()
        : deriveHostname(url),
    publishedAt: typeof record.publishedAt === 'string' ? record.publishedAt : null
  };
}

export function parseSearchPanelSection(invocation: ToolInvocationDto): SearchPanelSection | null {
  const output = asRecord(invocation.output);
  const artifact = asRecord(output?.artifact);
  if (!artifact) {
    return null;
  }

  const rawResults = Array.isArray(artifact.results) ? artifact.results : [];
  const results = rawResults.map(parseSearchResultItem).filter((item): item is SearchPanelResultItem => item !== null);
  const query =
    typeof artifact.query === 'string'
      ? artifact.query
      : typeof invocation.input?.query === 'string'
        ? invocation.input.query
        : '';

  if (!query) {
    return null;
  }

  return {
    toolCallId: invocation.toolCallId,
    query,
    resultCount: typeof artifact.resultCount === 'number' ? artifact.resultCount : results.length,
    retrievedAt: typeof artifact.retrievedAt === 'string' ? artifact.retrievedAt : null,
    results
  };
}
