import type { ToolInvocationDto } from '@agent-infra/contracts';

import { fetchRunTimeline } from '@/features/durable-chat/repo/chat-api';
import { buildSearchPanelData } from '@/features/durable-chat/service/search-panel';
import type { ActiveSearchPanelData } from '@/features/durable-chat/types/search';

export function createSearchResultCacheKey(runId: string, toolCallIds: string[]) {
  const normalizedToolCallIds = [...new Set(toolCallIds)].sort();
  return {
    normalizedToolCallIds,
    cacheKey: `${runId}:${normalizedToolCallIds.join(',')}`
  };
}

export async function loadSearchPanelResult(args: {
  runId: string;
  toolCallIds: string[];
  cache: Map<string, ActiveSearchPanelData>;
  loadTimeline?: typeof fetchRunTimeline;
  buildPanelData?: typeof buildSearchPanelData;
}) {
  const {
    runId,
    toolCallIds,
    cache,
    loadTimeline = fetchRunTimeline,
    buildPanelData = buildSearchPanelData
  } = args;
  const { normalizedToolCallIds, cacheKey } = createSearchResultCacheKey(runId, toolCallIds);
  const cached = cache.get(cacheKey);
  if (cached) {
    return {
      status: 'cached' as const,
      panelData: cached
    };
  }

  const result = await loadTimeline(runId);
  if (!result.ok) {
    throw new Error(result.error ?? `Failed to load search results (${result.status})`);
  }

  const invocations = result.data.toolInvocations.filter(
    (candidate: ToolInvocationDto) =>
      candidate.toolName === 'searchWeb' && normalizedToolCallIds.includes(candidate.toolCallId)
  );

  if (invocations.length === 0) {
    throw new Error('Search results are no longer available for this conversation turn.');
  }

  const panelData = buildPanelData(invocations);
  if (!panelData) {
    throw new Error('Search results are present but could not be parsed.');
  }

  cache.set(cacheKey, panelData);
  return {
    status: 'loaded' as const,
    panelData
  };
}
