import { describe, expect, it, vi } from 'vitest';

import { createSearchWebTool } from '../src/tools/search-web.js';
import type { WebSearchProvider } from '../src/search/provider.js';

describe('createSearchWebTool', () => {
  it('normalizes tool input and returns summary plus artifact payloads', async () => {
    const provider: WebSearchProvider = {
      search: vi.fn().mockResolvedValue({
        query: 'amd latest news',
        provider: 'tavily',
        answer: null,
        retrievedAt: '2026-05-07T00:00:00.000Z',
        results: [
          {
            rank: 1,
            title: 'AMD rises',
            url: 'https://example.com/amd',
            snippet: 'AMD stock climbed after earnings.',
            sourceName: 'example',
            publishedAt: '2026-05-07'
          }
        ]
      })
    };

    const tool = createSearchWebTool({ provider });
    const result = await tool.execute('tool-call-1', {
      query: '  amd latest news  ',
      maxResults: 99,
      topic: 'news',
      searchDepth: 'advanced'
    });

    expect(provider.search).toHaveBeenCalledWith({
      query: 'amd latest news',
      maxResults: 10,
      topic: 'news',
      searchDepth: 'advanced'
    });
    expect(result.details).toMatchObject({
      kind: 'web-search-summary',
      query: 'amd latest news',
      provider: 'tavily',
      resultCount: 1,
      sourceNames: ['example']
    });
    expect(result.artifact).toMatchObject({
      kind: 'web-search-results',
      toolCallId: 'tool-call-1',
      query: 'amd latest news',
      provider: 'tavily',
      resultCount: 1
    });
  });

  it('rejects empty search queries with a readable error', async () => {
    const provider: WebSearchProvider = {
      search: vi.fn()
    };
    const tool = createSearchWebTool({ provider });

    await expect(tool.execute('tool-call-1', { query: '   ' })).rejects.toThrow('searchWeb requires a non-empty query.');
    expect(provider.search).not.toHaveBeenCalled();
  });
});
