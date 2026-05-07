import { describe, expect, it, vi } from 'vitest';

import { TavilySearchProvider } from '../src/search/tavily-provider.js';

describe('TavilySearchProvider', () => {
  it('normalizes provider results into sidebar-friendly items', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: 'Latest AMD update.',
        results: [
          {
            title: ' AMD rallies ',
            url: 'https://www.example.com/news/amd',
            content: '  AMD climbed sharply after its latest earnings report.  ',
            published_date: '2026-05-07'
          }
        ]
      })
    });

    const provider = new TavilySearchProvider({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch
    });

    const result = await provider.search({
      query: 'AMD latest news',
      maxResults: 20,
      topic: 'news',
      searchDepth: 'advanced'
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.tavily.com/search',
      expect.objectContaining({
        method: 'POST'
      })
    );
    expect(result).toMatchObject({
      query: 'AMD latest news',
      provider: 'tavily',
      answer: 'Latest AMD update.',
      results: [
        {
          rank: 1,
          title: 'AMD rallies',
          url: 'https://www.example.com/news/amd',
          snippet: 'AMD climbed sharply after its latest earnings report.',
          sourceName: 'example',
          hostname: 'example.com',
          publishedAt: '2026-05-07'
        }
      ]
    });
  });

  it('throws a readable error when Tavily returns a failure response', async () => {
    const provider = new TavilySearchProvider({
      apiKey: 'test-key',
      fetchImpl: vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'service unavailable'
      }) as unknown as typeof fetch
    });

    await expect(
      provider.search({
        query: 'AMD latest news'
      })
    ).rejects.toThrow('Tavily search failed (503): service unavailable');
  });
});
