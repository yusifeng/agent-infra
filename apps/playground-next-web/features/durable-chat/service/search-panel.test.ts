import { describe, expect, it } from 'vitest';

import { buildSearchPanelData } from '@/features/durable-chat/service/search-panel';
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

describe('buildSearchPanelData', () => {
  it('builds aggregated search panel data from multiple search invocations', () => {
    const result = buildSearchPanelData([
      createInvocation({
        toolCallId: 'call-1',
        output: {
          artifact: {
            provider: 'tavily',
            query: 'query 1',
            resultCount: 2,
            results: [{ title: 'A', url: 'https://a.com', sourceName: 'Alpha' }]
          }
        }
      }),
      createInvocation({
        id: 'inv-2',
        toolCallId: 'call-2',
        output: {
          artifact: {
            provider: 'tavily',
            query: 'query 2',
            resultCount: 1,
            results: [{ title: 'B', url: 'https://b.com', sourceName: 'Beta' }]
          }
        }
      })
    ]);

    expect(result).toEqual({
      runId: 'run-1',
      toolCallIds: ['call-1', 'call-2'],
      provider: 'tavily',
      resultCount: 3,
      sourceNames: ['Alpha', 'Beta'],
      sections: [
        {
          toolCallId: 'call-1',
          query: 'query 1',
          resultCount: 2,
          retrievedAt: null,
          results: [
            {
              rank: 0,
              title: 'A',
              url: 'https://a.com',
              snippet: '',
              sourceName: 'Alpha',
              hostname: 'a.com',
              publishedAt: null
            }
          ]
        },
        {
          toolCallId: 'call-2',
          query: 'query 2',
          resultCount: 1,
          retrievedAt: null,
          results: [
            {
              rank: 0,
              title: 'B',
              url: 'https://b.com',
              snippet: '',
              sourceName: 'Beta',
              hostname: 'b.com',
              publishedAt: null
            }
          ]
        }
      ]
    });
  });

  it('returns null when no valid search sections are available', () => {
    expect(
      buildSearchPanelData([
        createInvocation({
          toolName: 'otherTool'
        }),
        createInvocation({
          output: {
            artifact: {
              results: []
            }
          }
        })
      ])
    ).toBeNull();
  });
});
