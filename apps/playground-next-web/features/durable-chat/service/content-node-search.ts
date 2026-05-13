import type { MessagePartDto } from '@agent-infra/contracts';

import { asRecord, deriveHostname } from '@/features/durable-chat/schema/search-panel';
import type { SearchSummaryEntry } from '@/features/durable-chat/types/transcript-blocks';

export type SearchLoadingEntry = {
  toolCallId: string;
  query: string;
};

export function parseSearchLoadingEntry(part: MessagePartDto): SearchLoadingEntry | null {
  if (part.type !== 'tool-call') {
    return null;
  }

  const value = part.jsonValue ?? {};
  if (value.toolName !== 'searchWeb' || typeof value.toolCallId !== 'string') {
    return null;
  }

  const input = asRecord(value.input);
  const query = typeof input?.query === 'string' ? input.query.trim() : '';

  return {
    toolCallId: value.toolCallId,
    query
  };
}

export function parseSearchSummaryEntry(part: MessagePartDto): SearchSummaryEntry | null {
  if (part.type !== 'tool-result') {
    return null;
  }

  const value = part.jsonValue ?? {};
  if (value.toolName !== 'searchWeb' || typeof value.toolCallId !== 'string') {
    return null;
  }

  const details = asRecord(value.details);
  if (!details) {
    return null;
  }

  const query = typeof details.query === 'string' ? details.query.trim() : '';
  if (!query) {
    return null;
  }

  const explicitSources = Array.isArray(details.sources)
    ? details.sources
        .map((item) => asRecord(item))
        .filter((item): item is Record<string, unknown> => item !== null)
        .map((item) => ({
          sourceName: typeof item.sourceName === 'string' ? item.sourceName.trim() : '',
          hostname: typeof item.hostname === 'string' ? item.hostname.trim().toLowerCase() : ''
        }))
        .filter((item) => item.sourceName && item.hostname)
        .slice(0, 4)
    : [];

  const memory = asRecord(details.memory);
  const fallbackSources =
    explicitSources.length === 0 && Array.isArray(memory?.sources)
      ? memory.sources
          .map((item) => asRecord(item))
          .filter((item): item is Record<string, unknown> => item !== null)
          .map((item) => {
            const sourceName = typeof item.sourceName === 'string' ? item.sourceName.trim() : '';
            const url = typeof item.url === 'string' ? item.url.trim() : '';

            return {
              sourceName,
              hostname: deriveHostname(url)
            };
          })
          .filter((item) => item.sourceName && item.hostname)
          .slice(0, 4)
      : [];

  const sources = explicitSources.length > 0 ? explicitSources : fallbackSources;

  return {
    toolCallId: value.toolCallId,
    query,
    resultCount: typeof details.resultCount === 'number' ? details.resultCount : 0,
    sources,
    sourceNames: Array.isArray(details.sourceNames)
      ? details.sourceNames.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 4)
      : []
  };
}
