import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSharedSnapshotRuntime } from '@/features/durable-chat/runtime/use-shared-snapshot-runtime';

const shareApiMocks = vi.hoisted(() => ({
  fetchThreadSnapshotShare: vi.fn()
}));

vi.mock('@/features/durable-chat/repo/share-api', () => ({
  fetchThreadSnapshotShare: (...args: unknown[]) => shareApiMocks.fetchThreadSnapshotShare(...args)
}));

function createPublicShare() {
  return {
    publicId: 'public-1',
    scopeType: 'thread' as const,
    status: 'active' as const,
    createdAt: '2026-05-09T00:00:00.000Z',
    snapshot: {
      payloadFormat: 'messages_v1' as const,
      payloadVersion: 1 as const,
      title: 'Shared Claude thread',
      messages: [
        {
          id: 'shared-message-1',
          runId: null,
          role: 'user' as const,
          seq: 1,
          createdAt: '2026-05-09T00:00:00.000Z',
          parts: [
            {
              id: 'shared-part-1-1',
              messageId: 'shared-message-1',
              partIndex: 0,
              type: 'text' as const,
              textValue: '帮我看 Claude 最新新闻',
              jsonValue: null,
              createdAt: '2026-05-09T00:00:00.000Z'
            }
          ]
        },
        {
          id: 'shared-message-2',
          runId: 'shared-run-1',
          role: 'assistant' as const,
          seq: 2,
          createdAt: '2026-05-09T00:00:01.000Z',
          parts: [
            {
              id: 'shared-part-2-1',
              messageId: 'shared-message-2',
              partIndex: 0,
              type: 'text' as const,
              textValue: '好的，我来帮你搜索一下。',
              jsonValue: null,
              createdAt: '2026-05-09T00:00:01.000Z'
            },
            {
              id: 'shared-part-2-2',
              messageId: 'shared-message-2',
              partIndex: 1,
              type: 'tool-call' as const,
              textValue: null,
              jsonValue: {
                toolName: 'searchWeb',
                toolCallId: 'shared-tool-call-1',
                input: { query: 'Claude latest news' }
              },
              createdAt: '2026-05-09T00:00:01.500Z'
            }
          ]
        },
        {
          id: 'shared-message-3',
          runId: 'shared-run-1',
          role: 'tool' as const,
          seq: 3,
          createdAt: '2026-05-09T00:00:02.000Z',
          parts: [
            {
              id: 'shared-part-3-1',
              messageId: 'shared-message-3',
              partIndex: 0,
              type: 'tool-result' as const,
              textValue: null,
              jsonValue: {
                toolName: 'searchWeb',
                toolCallId: 'shared-tool-call-1',
                content: [{ type: 'text', text: 'Found relevant results.' }],
                details: {
                  query: 'Claude latest news',
                  resultCount: 8,
                  sourceNames: ['Anthropic'],
                  sources: [{ sourceName: 'Anthropic', hostname: 'anthropic.com' }]
                },
                isError: false
              },
              createdAt: '2026-05-09T00:00:02.000Z'
            }
          ]
        }
      ],
      searchBundles: {
        'shared-tool-call-1': {
          runId: 'shared-run-1',
          toolCallId: 'shared-tool-call-1',
          toolName: 'searchWeb',
          status: 'completed',
          input: { query: 'Claude latest news' },
          output: {
            artifact: {
              provider: 'tavily',
              query: 'Claude latest news',
              resultCount: 8,
              results: [
                {
                  rank: 1,
                  title: 'Anthropic Claude News',
                  url: 'https://www.anthropic.com/news',
                  snippet: 'Latest Claude updates',
                  sourceName: 'Anthropic',
                  hostname: 'anthropic.com'
                }
              ]
            }
          },
          error: null,
          startedAt: '2026-05-09T00:00:01.500Z',
          finishedAt: '2026-05-09T00:00:02.000Z'
        }
      }
    }
  };
}

describe('useSharedSnapshotRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads a public share into transcript blocks and answer containers', async () => {
    shareApiMocks.fetchThreadSnapshotShare.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        share: createPublicShare()
      }
    });

    const { result } = renderHook(() => useSharedSnapshotRuntime({ initialPublicId: 'public-1' }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.currentThreadTitle).toBe('Shared Claude thread');
    expect(result.current.displayedTranscriptBlocks).toHaveLength(2);
    expect(result.current.displayedAnswerContainers).toHaveLength(1);
  });

  it('opens share-local search results without querying the live timeline', async () => {
    shareApiMocks.fetchThreadSnapshotShare.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        share: createPublicShare()
      }
    });

    const { result } = renderHook(() => useSharedSnapshotRuntime({ initialPublicId: 'public-1' }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.onOpenSearchResult('shared-run-1', ['shared-tool-call-1']);
    });

    expect(result.current.searchPanelOpen).toBe(true);
    expect(result.current.activeSearchResult?.toolCallIds).toEqual(['shared-tool-call-1']);
    expect(result.current.activeSearchResult?.provider).toBe('tavily');
  });
});
