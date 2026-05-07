import type { ToolInvocationDto } from '@agent-infra/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createSearchResultCacheKey, loadSearchPanelResult } from '@/features/durable-chat/runtime/search-panel-controller';
import type { ActiveSearchPanelData } from '@/features/durable-chat/types/search';

function createInvocation(overrides: Partial<ToolInvocationDto> = {}): ToolInvocationDto {
  return {
    id: 'inv-1',
    threadId: 'thread-1',
    runId: 'run-1',
    messageId: 'message-1',
    toolCallId: 'call-1',
    toolName: 'searchWeb',
    status: 'completed',
    input: null,
    output: null,
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function createPanelData(): ActiveSearchPanelData {
  return {
    runId: 'run-1',
    toolCallIds: ['call-1'],
    provider: 'tavily',
    resultCount: 1,
    sourceNames: ['Alpha'],
    sections: []
  };
}

describe('search panel controller', () => {
  it('normalizes cache keys by de-duping and sorting tool ids', () => {
    expect(createSearchResultCacheKey('run-1', ['call-2', 'call-1', 'call-2'])).toEqual({
      normalizedToolCallIds: ['call-1', 'call-2'],
      cacheKey: 'run-1:call-1,call-2'
    });
  });

  it('returns cached panel data without refetching', async () => {
    const cache = new Map<string, ActiveSearchPanelData>([['run-1:call-1', createPanelData()]]);
    const loadTimeline = vi.fn();

    await expect(
      loadSearchPanelResult({
        runId: 'run-1',
        toolCallIds: ['call-1'],
        cache,
        loadTimeline
      })
    ).resolves.toEqual({
      status: 'cached',
      panelData: createPanelData()
    });

    expect(loadTimeline).not.toHaveBeenCalled();
  });

  it('loads, builds, and caches search panel data from repo-filtered invocations', async () => {
    const cache = new Map<string, ActiveSearchPanelData>();
    const loadTimeline = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        toolInvocations: [createInvocation({ toolCallId: 'call-1' })]
      }
    });
    const buildPanelData = vi.fn().mockReturnValue(createPanelData());

    await expect(
      loadSearchPanelResult({
        runId: 'run-1',
        toolCallIds: ['call-1'],
        cache,
        loadTimeline,
        buildPanelData
      })
    ).resolves.toEqual({
      status: 'loaded',
      panelData: createPanelData()
    });

    expect(loadTimeline).toHaveBeenCalledWith('run-1', ['call-1']);
    expect(buildPanelData).toHaveBeenCalledWith([expect.objectContaining({ toolCallId: 'call-1' })]);
    expect(cache.get('run-1:call-1')).toEqual(createPanelData());
  });

  it('throws when no matching search invocations remain', async () => {
    const cache = new Map<string, ActiveSearchPanelData>();
    const loadTimeline = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        toolInvocations: []
      }
    });

    await expect(
      loadSearchPanelResult({
        runId: 'run-1',
        toolCallIds: ['call-1'],
        cache,
        loadTimeline
      })
    ).rejects.toThrow('Search results are no longer available for this conversation turn.');
  });

  it('throws when parsed panel data is unavailable', async () => {
    const cache = new Map<string, ActiveSearchPanelData>();
    const loadTimeline = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        toolInvocations: [createInvocation({ toolCallId: 'call-1' })]
      }
    });
    const buildPanelData = vi.fn().mockReturnValue(null);

    await expect(
      loadSearchPanelResult({
        runId: 'run-1',
        toolCallIds: ['call-1'],
        cache,
        loadTimeline,
        buildPanelData
      })
    ).rejects.toThrow('Search results are present but could not be parsed.');
  });
});
