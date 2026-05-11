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

  it('prefetches panel data into cache and exposes it for live summaries', async () => {
    const panelData = createPanelData();
    loadSearchPanelResultMock.mockImplementation(async ({ cache }: { cache: Map<string, ActiveSearchPanelData> }) => {
      cache.set('run-1:call-1', panelData);
      return {
        status: 'loaded',
        panelData
      };
    });

    const { result } = renderHook(({ threadId }) => useSearchPanelState(threadId), {
      initialProps: { threadId: 'thread-1' as string | null }
    });

    await act(async () => {
      await result.current.prefetchSearchResult('run-1', ['call-1']);
    });

    expect(result.current.getCachedSearchResult('run-1', ['call-1'])).toEqual(panelData);
  });

  it('deduplicates in-flight prefetch requests for the same cache key', async () => {
    const panelData = createPanelData();
    let resolveRequest: ((value: { status: 'loaded'; panelData: ActiveSearchPanelData }) => void) | null = null;
    loadSearchPanelResultMock.mockImplementation(
      ({ cache }: { cache: Map<string, ActiveSearchPanelData> }) =>
        new Promise((resolve) => {
          resolveRequest = (value) => {
            cache.set('run-1:call-1', value.panelData);
            resolve(value);
          };
        })
    );

    const { result } = renderHook(({ threadId }) => useSearchPanelState(threadId), {
      initialProps: { threadId: 'thread-1' as string | null }
    });

    let firstRequest: Promise<ActiveSearchPanelData | null> | null = null;
    let secondRequest: Promise<ActiveSearchPanelData | null> | null = null;
    await act(async () => {
      firstRequest = result.current.prefetchSearchResult('run-1', ['call-1']);
      secondRequest = result.current.prefetchSearchResult('run-1', ['call-1']);
      await Promise.resolve();
    });

    expect(loadSearchPanelResultMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRequest?.({
        status: 'loaded',
        panelData
      });
      await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([panelData, panelData]);
    });

    expect(result.current.getCachedSearchResult('run-1', ['call-1'])).toEqual(panelData);
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
