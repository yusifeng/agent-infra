import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SharedSnapshotConsole } from '@/features/durable-chat/shared-snapshot-console';

const runtimeMocks = vi.hoisted(() => ({
  useSharedSnapshotRuntime: vi.fn()
}));

vi.mock('@/features/durable-chat/runtime/use-shared-snapshot-runtime', () => ({
  useSharedSnapshotRuntime: (...args: unknown[]) => runtimeMocks.useSharedSnapshotRuntime(...args)
}));

describe('SharedSnapshotConsole', () => {
  it('renders a readonly shared transcript and opens the local search panel', () => {
    const onOpenSearchResult = vi.fn();

    runtimeMocks.useSharedSnapshotRuntime.mockReturnValue({
      loading: false,
      error: null,
      share: {
        publicId: 'public-1'
      },
      currentThreadTitle: 'Shared Claude thread',
      messagesViewportRef: { current: null },
      displayedMessages: [],
      displayedAnswerContainers: [
        {
          id: 'answer-container:shared-run-1:assistant-turn:shared-run-1:2',
          kind: 'assistant-answer',
          runId: 'shared-run-1',
          transcriptBlockIds: ['assistant-turn:shared-run-1:2'],
          blocks: [
            {
              type: 'assistant-turn',
              id: 'assistant-turn:shared-run-1:2',
              runId: 'shared-run-1',
              sourceMessages: [],
              items: [
                {
                  type: 'text',
                  id: 'text-1',
                  cacheKey: 'text-1',
                  part: {
                    id: 'part-1',
                    messageId: 'message-1',
                    partIndex: 0,
                    type: 'text',
                    textValue: '好的，我来帮你搜索一下。',
                    jsonValue: null,
                    createdAt: '2026-05-09T00:00:00.000Z'
                  }
                },
                {
                  type: 'search-summary',
                  id: 'search-1',
                  summary: {
                    runId: 'shared-run-1',
                    entries: [
                      {
                        toolCallId: 'shared-tool-call-1',
                        query: 'Claude latest news',
                        resultCount: 8,
                        sourceNames: ['Anthropic'],
                        sources: [{ sourceName: 'Anthropic', hostname: 'anthropic.com' }]
                      }
                    ]
                  }
                }
              ]
            }
          ],
          actionHostId: 'answer-container:shared-run-1:assistant-turn:shared-run-1:2'
        }
      ],
      displayedTranscriptBlocks: [
        {
          type: 'assistant-turn',
          id: 'assistant-turn:shared-run-1:2',
          runId: 'shared-run-1',
          sourceMessages: [],
          items: [
            {
              type: 'text',
              id: 'text-1',
              cacheKey: 'text-1',
              part: {
                id: 'part-1',
                messageId: 'message-1',
                partIndex: 0,
                type: 'text',
                textValue: '好的，我来帮你搜索一下。',
                jsonValue: null,
                createdAt: '2026-05-09T00:00:00.000Z'
              }
            },
            {
              type: 'search-summary',
              id: 'search-1',
              summary: {
                runId: 'shared-run-1',
                entries: [
                  {
                    toolCallId: 'shared-tool-call-1',
                    query: 'Claude latest news',
                    resultCount: 8,
                    sourceNames: ['Anthropic'],
                    sources: [{ sourceName: 'Anthropic', hostname: 'anthropic.com' }]
                  }
                ]
              }
            }
          ]
        }
      ],
      activeSearchResult: null,
      searchPanelError: null,
      searchPanelLoading: false,
      searchPanelOpen: false,
      onOpenSearchResult,
      onCloseSearchPanel: vi.fn()
    });

    render(<SharedSnapshotConsole initialPublicId="public-1" />);

    expect(screen.getByText('Shared Claude thread')).toBeTruthy();
    expect(screen.getByText('好的，我来帮你搜索一下。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /搜索到 8 个网页/ }));
    fireEvent.click(screen.getByRole('button', { name: '查看搜索结果' }));

    expect(onOpenSearchResult).toHaveBeenCalledWith('shared-run-1', ['shared-tool-call-1']);
  });
});
