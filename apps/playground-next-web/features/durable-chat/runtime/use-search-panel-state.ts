import { useCallback, useEffect, useRef, useState } from 'react';

import { loadSearchPanelResult } from '@/features/durable-chat/runtime/search-panel-controller';
import type { ActiveSearchPanelData } from '@/features/durable-chat/types/search';

function createCacheKey(runId: string, toolCallIds: string[]) {
  const normalizedToolCallIds = [...new Set(toolCallIds)].sort();
  return {
    normalizedToolCallIds,
    cacheKey: `${runId}:${normalizedToolCallIds.join(',')}`
  };
}

export function useSearchPanelState(activeThreadId: string | null) {
  const searchResultCacheRef = useRef<Map<string, ActiveSearchPanelData>>(new Map());
  const inflightSearchResultCacheRef = useRef<Map<string, Promise<ActiveSearchPanelData | null>>>(new Map());
  const activeThreadIdRef = useRef(activeThreadId);
  const openRequestIdRef = useRef(0);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [activeSearchResult, setActiveSearchResult] = useState<ActiveSearchPanelData | null>(null);
  const [searchPanelLoading, setSearchPanelLoading] = useState(false);
  const [searchPanelError, setSearchPanelError] = useState<string | null>(null);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
    openRequestIdRef.current += 1;
    setSearchPanelOpen(false);
    setActiveSearchResult(null);
    setSearchPanelLoading(false);
    setSearchPanelError(null);
  }, [activeThreadId]);

  const openSearchResult = useCallback(async (runId: string, toolCallIds: string[]) => {
    const cache = searchResultCacheRef.current;
    const requestId = openRequestIdRef.current + 1;
    const requestThreadId = activeThreadIdRef.current;
    openRequestIdRef.current = requestId;
    setSearchPanelLoading(true);
    setSearchPanelError(null);

    try {
      const result = await loadSearchPanelResult({
        runId,
        toolCallIds,
        cache
      });
      if (requestId !== openRequestIdRef.current || requestThreadId !== activeThreadIdRef.current) {
        return;
      }
      setActiveSearchResult(result.panelData);
      setSearchPanelError(null);
      setSearchPanelOpen(true);
    } catch (nextError) {
      if (requestId !== openRequestIdRef.current || requestThreadId !== activeThreadIdRef.current) {
        return;
      }
      setSearchPanelOpen(true);
      setActiveSearchResult(null);
      setSearchPanelError(nextError instanceof Error ? nextError.message : 'Failed to load search results.');
    } finally {
      if (requestId === openRequestIdRef.current && requestThreadId === activeThreadIdRef.current) {
        setSearchPanelLoading(false);
      }
    }
  }, []);

  const prefetchSearchResult = useCallback(async (runId: string, toolCallIds: string[]) => {
    const cache = searchResultCacheRef.current;
    const inflightCache = inflightSearchResultCacheRef.current;
    const { normalizedToolCallIds, cacheKey } = createCacheKey(runId, toolCallIds);
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey) ?? null;
    }
    const inflight = inflightCache.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const request = loadSearchPanelResult({
      runId,
      toolCallIds: normalizedToolCallIds,
      cache
    })
      .then((result) => result.panelData)
      .finally(() => {
        inflightCache.delete(cacheKey);
      });

    inflightCache.set(cacheKey, request);
    return request;
  }, []);

  const getCachedSearchResult = useCallback((runId: string, toolCallIds: string[]) => {
    const cache = searchResultCacheRef.current;
    const { cacheKey } = createCacheKey(runId, toolCallIds);
    return cache.get(cacheKey) ?? null;
  }, []);

  return {
    activeSearchResult,
    getCachedSearchResult,
    prefetchSearchResult,
    searchPanelError,
    searchPanelLoading,
    searchPanelOpen,
    onCloseSearchPanel: () => setSearchPanelOpen(false),
    onOpenSearchResult: (runId: string, toolCallIds: string[]) => {
      void openSearchResult(runId, toolCallIds);
    }
  };
}
