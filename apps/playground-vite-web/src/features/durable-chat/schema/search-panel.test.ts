import { describe, expect, it } from 'vitest';

import { deriveHostname, parseSearchPanelSection, parseSearchResultItem } from '@/features/durable-chat/schema/search-panel';
import type { ToolInvocationDto } from '@agent-infra/contracts';

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

describe('search-panel schema', () => {
  it('derives a hostname from a URL', () => {
    expect(deriveHostname('https://www.example.com/path')).toBe('example.com');
    expect(deriveHostname('not-a-url')).toBe('');
  });

  it('parses a search result item and falls back to hostname from url', () => {
    expect(
      parseSearchResultItem({
        title: 'Latest news',
        url: 'https://www.example.com/news',
        snippet: 'snippet',
        sourceName: 'Example',
        rank: 2
      })
    ).toEqual({
      rank: 2,
      title: 'Latest news',
      url: 'https://www.example.com/news',
      snippet: 'snippet',
      sourceName: 'Example',
      hostname: 'example.com',
      publishedAt: null
    });
  });

  it('rejects result items without title or url', () => {
    expect(parseSearchResultItem({ title: 'x' })).toBeNull();
    expect(parseSearchResultItem({ url: 'https://example.com' })).toBeNull();
  });

  it('parses a search panel section from invocation artifact', () => {
    const section = parseSearchPanelSection(
      createInvocation({
        output: {
          artifact: {
            query: 'deepseek latest news',
            resultCount: 3,
            retrievedAt: '2026-01-01T00:00:00.000Z',
            results: [
              {
                title: 'News',
                url: 'https://example.com/news',
                sourceName: 'Example'
              }
            ]
          }
        }
      })
    );

    expect(section).toEqual({
      toolCallId: 'call-1',
      query: 'deepseek latest news',
      resultCount: 3,
      retrievedAt: '2026-01-01T00:00:00.000Z',
      results: [
        {
          rank: 0,
          title: 'News',
          url: 'https://example.com/news',
          snippet: '',
          sourceName: 'Example',
          hostname: 'example.com',
          publishedAt: null
        }
      ]
    });
  });

  it('falls back to invocation input query when artifact query is missing', () => {
    const section = parseSearchPanelSection(
      createInvocation({
        input: { query: 'fallback query' },
        output: {
          artifact: {
            results: []
          }
        }
      })
    );

    expect(section).toEqual({
      toolCallId: 'call-1',
      query: 'fallback query',
      resultCount: 0,
      retrievedAt: null,
      results: []
    });
  });

  it('returns null when no query can be derived', () => {
    expect(
      parseSearchPanelSection(
        createInvocation({
          output: {
            artifact: {
              results: []
            }
          }
        })
      )
    ).toBeNull();
  });
});
