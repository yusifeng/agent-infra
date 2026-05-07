import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSearchPanelState } from '@/features/durable-chat/runtime/use-search-panel-state';
import type { ActiveSearchPanelData } from '@/features/durable-chat/types/search';

const loadSearchPanelResultMock = vi.fn();

vi.mock('@/features/durable-chat/runtime/search-panel-controller', () => ({
  loadSearchPanelResult: (...args: unknown[]) => loadSearchPanelResultMock(...args)
}));

function createPanelData(): ActiveSearchPanelData {
  return {
    runId: 'run-1',
    toolCallIds: ['call-1'],
    provider: 'tavily',
    resultCount: 1,
    sourceNames: ['The Verge'],
    sections: []
  };
}

describe('useSearchPanelState', () => {
  beforeEach(() => {
    loadSearchPanelResultMock.mockReset();
  });

  it('loads and opens search panel data for a result click', async () => {
    const panelData = createPanelData();
    loadSearchPanelResultMock.mockResolvedValue({
      status: 'loaded',
      panelData
    });

    const { result } = renderHook(({ threadId }) => useSearchPanelState(threadId), {
      initialProps: { threadId: 'thread-1' as string | null }
    });

    act(() => {
      result.current.onOpenSearchResult('run-1', ['call-1']);
    });

    expect(result.current.searchPanelLoading).toBe(true);
    expect(loadSearchPanelResultMock).toHaveBeenCalledWith({
      runId: 'run-1',
      toolCallIds: ['call-1'],
      cache: expect.any(Map)
    });

    await waitFor(() => {
      expect(result.current.searchPanelLoading).toBe(false);
      expect(result.current.searchPanelOpen).toBe(true);
      expect(result.current.activeSearchResult).toEqual(panelData);
      expect(result.current.searchPanelError).toBeNull();
    });
  });

  it('resets panel state when the active thread changes', async () => {
    const panelData = createPanelData();
    loadSearchPanelResultMock.mockResolvedValue({
      status: 'loaded',
      panelData
    });

    const { result, rerender } = renderHook(({ threadId }) => useSearchPanelState(threadId), {
      initialProps: { threadId: 'thread-1' as string | null }
    });

    act(() => {
      result.current.onOpenSearchResult('run-1', ['call-1']);
    });

    await waitFor(() => {
      expect(result.current.searchPanelOpen).toBe(true);
      expect(result.current.activeSearchResult).toEqual(panelData);
    });

    rerender({ threadId: 'thread-2' });

    await waitFor(() => {
      expect(result.current.searchPanelOpen).toBe(false);
      expect(result.current.activeSearchResult).toBeNull();
      expect(result.current.searchPanelLoading).toBe(false);
      expect(result.current.searchPanelError).toBeNull();
    });
  });

  it('surfaces controller errors while keeping the panel open', async () => {
    loadSearchPanelResultMock.mockRejectedValue(new Error('Search failed.'));

    const { result } = renderHook(({ threadId }) => useSearchPanelState(threadId), {
      initialProps: { threadId: 'thread-1' as string | null }
    });

    act(() => {
      result.current.onOpenSearchResult('run-1', ['call-1']);
    });

    await waitFor(() => {
      expect(result.current.searchPanelLoading).toBe(false);
      expect(result.current.searchPanelOpen).toBe(true);
      expect(result.current.activeSearchResult).toBeNull();
      expect(result.current.searchPanelError).toBe('Search failed.');
    });
  });
});
