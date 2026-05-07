import { useEffect, useRef, useState } from 'react';

import { loadSearchPanelResult } from '@/features/durable-chat/runtime/search-panel-controller';
import type { ActiveSearchPanelData } from '@/features/durable-chat/types/search';

export function useSearchPanelState(activeThreadId: string | null) {
  const searchResultCacheRef = useRef<Map<string, ActiveSearchPanelData>>(new Map());
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [activeSearchResult, setActiveSearchResult] = useState<ActiveSearchPanelData | null>(null);
  const [searchPanelLoading, setSearchPanelLoading] = useState(false);
  const [searchPanelError, setSearchPanelError] = useState<string | null>(null);

  useEffect(() => {
    setSearchPanelOpen(false);
    setActiveSearchResult(null);
    setSearchPanelLoading(false);
    setSearchPanelError(null);
  }, [activeThreadId]);

  async function openSearchResult(runId: string, toolCallIds: string[]) {
    const cache = searchResultCacheRef.current;
    setSearchPanelLoading(true);
    setSearchPanelError(null);

    try {
      const result = await loadSearchPanelResult({
        runId,
        toolCallIds,
        cache
      });
      setActiveSearchResult(result.panelData);
      setSearchPanelError(null);
      setSearchPanelOpen(true);
    } catch (nextError) {
      setSearchPanelOpen(true);
      setActiveSearchResult(null);
      setSearchPanelError(nextError instanceof Error ? nextError.message : 'Failed to load search results.');
    } finally {
      setSearchPanelLoading(false);
    }
  }

  return {
    activeSearchResult,
    searchPanelError,
    searchPanelLoading,
    searchPanelOpen,
    onCloseSearchPanel: () => setSearchPanelOpen(false),
    onOpenSearchResult: (runId: string, toolCallIds: string[]) => {
      void openSearchResult(runId, toolCallIds);
    }
  };
}
