import type { MessageDto, MessagePartDto } from '@agent-infra/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReplayConsole } from '@/features/durable-chat/replay-console';
import type { AnswerContainer } from '@/features/durable-chat/types/answer-containers';
import type { TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';

const currentUser = {
  id: 'user-1',
  email: 'user@example.com'
};

const replayConsoleRuntimeMocks = vi.hoisted(() => ({
  useReplayConsoleRuntime: vi.fn()
}));

vi.mock('@/features/durable-chat/runtime/use-replay-console-runtime', () => ({
  useReplayConsoleRuntime: (...args: unknown[]) => replayConsoleRuntimeMocks.useReplayConsoleRuntime(...args)
}));

function createPart(overrides: Partial<MessagePartDto> & Pick<MessagePartDto, 'id' | 'type'>): MessagePartDto {
  return {
    id: overrides.id,
    messageId: overrides.messageId ?? 'message-1',
    partIndex: overrides.partIndex ?? 0,
    type: overrides.type,
    textValue: overrides.textValue ?? null,
    jsonValue: overrides.jsonValue ?? null,
    createdAt: overrides.createdAt ?? '2026-05-08T00:00:00.000Z'
  };
}

function createMessage(overrides: Partial<MessageDto> & Pick<MessageDto, 'id' | 'role' | 'seq'>): MessageDto {
  return {
    id: overrides.id,
    threadId: overrides.threadId ?? 'thread-1',
    runId: overrides.runId ?? null,
    role: overrides.role,
    seq: overrides.seq,
    status: overrides.status ?? 'completed',
    metadata: overrides.metadata ?? null,
    createdAt: overrides.createdAt ?? '2026-05-08T00:00:00.000Z',
    parts: overrides.parts ?? []
  };
}

function createReplayRuntime({
  messages,
  transcriptBlocks,
  answerContainers = [],
  viewStatus = 'playing',
  onOpenSearchResult = vi.fn()
}: {
  messages: MessageDto[];
  transcriptBlocks: TranscriptBlock[];
  answerContainers?: AnswerContainer[];
  viewStatus?: 'idle' | 'playing' | 'paused' | 'completed';
  onOpenSearchResult?: ReturnType<typeof vi.fn>;
}) {
  return {
    sidebarOpen: true,
    threads: [],
    activeThreadId: 'thread-1',
    currentThreadTitle: 'Replay Thread',
    loading: false,
    error: null,
    messagesViewportRef: { current: null },
    answerContainers,
    transcriptBlocks,
    sourceMessages: messages,
    controlState: {
      canPlay: viewStatus === 'idle',
      canPause: viewStatus === 'playing',
      canResume: viewStatus === 'paused',
      canRestart: viewStatus !== 'idle'
    },
    viewState: {
      status: viewStatus,
      currentStepIndex: transcriptBlocks.length - 1,
      totalSteps: transcriptBlocks.length,
      progressLabel: `${Math.max(transcriptBlocks.length, 0)} / ${Math.max(transcriptBlocks.length, 0)}`
    },
    activeSearchResult: null,
    searchPanelError: null,
    searchPanelLoading: false,
    searchPanelOpen: false,
    onOpenSidebar: vi.fn(),
    onCloseSidebar: vi.fn(),
    onOpenThread: vi.fn(),
    onNewChat: vi.fn(),
    onOpenSearchResult,
    onCloseSearchPanel: vi.fn(),
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onRestart: vi.fn()
  };
}

describe('ReplayConsole', () => {
  it('renders replay transcript nodes in order and wires the search label click to open the panel', () => {
    const assistantMessage = createMessage({
      id: 'assistant-1',
      role: 'assistant',
      runId: 'run-1',
      seq: 1,
      parts: [
        createPart({ id: 'assistant-1:text-1', type: 'text', messageId: 'assistant-1', textValue: '好的，我来搜索一下关于 Claude 的最新新闻。' }),
        createPart({ id: 'assistant-1:text-2', type: 'text', messageId: 'assistant-1', partIndex: 1, textValue: '以下是关于 Claude 的最新新闻摘要：' })
      ]
    });
    const openSearchResult = vi.fn();

    replayConsoleRuntimeMocks.useReplayConsoleRuntime.mockReturnValue(
      createReplayRuntime({
        messages: [assistantMessage],
        answerContainers: [
          {
            id: 'answer-container:run-1:assistant-turn-1',
            kind: 'assistant-answer',
            runId: 'run-1',
            transcriptBlockIds: ['assistant-turn-1', 'assistant-turn-1:search', 'assistant-turn-1:text-2'],
            blocks: [
              {
                type: 'assistant-turn',
                id: 'assistant-turn-1',
                runId: 'run-1',
                sourceMessages: [assistantMessage],
                items: [
                  {
                    type: 'text',
                    id: 'assistant-turn-1:text-1',
                    cacheKey: 'assistant-turn-1:text-1',
                    part: assistantMessage.parts[0]!
                  }
                ]
              },
              {
                type: 'assistant-turn',
                id: 'assistant-turn-1:search',
                runId: 'run-1',
                sourceMessages: [assistantMessage],
                items: [
                  {
                    type: 'search-summary',
                    id: 'assistant-turn-1:search-summary',
                    summary: {
                      runId: 'run-1',
                      entries: [
                        {
                          toolCallId: 'call-1',
                          query: 'Claude latest news',
                          resultCount: 10,
                          sourceNames: ['The Verge', 'WSJ'],
                          sources: [
                            { sourceName: 'The Verge', hostname: 'theverge.com' },
                            { sourceName: 'WSJ', hostname: 'wsj.com' }
                          ]
                        }
                      ]
                    }
                  }
                ]
              },
              {
                type: 'assistant-turn',
                id: 'assistant-turn-1:text-2',
                runId: 'run-1',
                sourceMessages: [assistantMessage],
                items: [
                  {
                    type: 'text',
                    id: 'assistant-turn-1:text-2:item',
                    cacheKey: 'assistant-turn-1:text-2',
                    part: assistantMessage.parts[1]!
                  }
                ]
              }
            ],
            actionHostId: 'answer-container:run-1:assistant-turn-1'
          }
        ],
        transcriptBlocks: [
          {
            type: 'assistant-turn',
            id: 'assistant-turn-1',
            runId: 'run-1',
            sourceMessages: [assistantMessage],
            items: [
              {
                type: 'text',
                id: 'assistant-turn-1:text-1',
                cacheKey: 'assistant-turn-1:text-1',
                part: assistantMessage.parts[0]!
              }
            ]
          },
          {
            type: 'assistant-turn',
            id: 'assistant-turn-1:search',
            runId: 'run-1',
            sourceMessages: [assistantMessage],
            items: [
              {
                type: 'search-summary',
                id: 'assistant-turn-1:search-summary',
                summary: {
                  runId: 'run-1',
                  entries: [
                    {
                      toolCallId: 'call-1',
                      query: 'Claude latest news',
                      resultCount: 10,
                      sourceNames: ['The Verge', 'WSJ'],
                      sources: [
                        { sourceName: 'The Verge', hostname: 'theverge.com' },
                        { sourceName: 'WSJ', hostname: 'wsj.com' }
                      ]
                    }
                  ]
                }
              }
            ]
          },
          {
            type: 'assistant-turn',
            id: 'assistant-turn-1:text-2',
            runId: 'run-1',
            sourceMessages: [assistantMessage],
            items: [
              {
                type: 'text',
                id: 'assistant-turn-1:text-2:item',
                cacheKey: 'assistant-turn-1:text-2',
                part: assistantMessage.parts[1]!
              }
            ]
          }
        ],
        onOpenSearchResult: openSearchResult
      })
    );

    render(<ReplayConsole currentUser={currentUser} initialThreadId="thread-1" onLogout={vi.fn()} />);

    const transcriptText = document.body.textContent ?? '';
    expect(transcriptText.indexOf('好的，我来搜索一下关于 Claude 的最新新闻。')).toBeLessThan(
      transcriptText.indexOf('搜索到 10 个网页')
    );
    expect(transcriptText.indexOf('搜索到 10 个网页')).toBeLessThan(
      transcriptText.indexOf('以下是关于 Claude 的最新新闻摘要：')
    );
    expect(screen.getByText(/3 \/ 3 · playing/)).toBeTruthy();
    expect(document.querySelectorAll('[data-message-actions-available="true"]')).toHaveLength(1);
    expect(screen.queryByText(/Search results are already available/i)).toBeNull();
    expect(screen.queryByText('策略收敛')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /搜索到 10 个网页/ }));
    fireEvent.click(screen.getByRole('button', { name: '查看搜索结果' }));

    expect(openSearchResult).toHaveBeenCalledWith('run-1', ['call-1']);
  });

  it('renders a replay search loading node before the final search label', () => {
    const assistantMessage = createMessage({
      id: 'assistant-1',
      role: 'assistant',
      runId: 'run-1',
      seq: 1,
      parts: []
    });

    replayConsoleRuntimeMocks.useReplayConsoleRuntime.mockReturnValue(
      createReplayRuntime({
        messages: [assistantMessage],
        transcriptBlocks: [
          {
            type: 'assistant-turn',
            id: 'assistant-turn-1:search-loading',
            runId: 'run-1',
            sourceMessages: [assistantMessage],
            items: [
              {
                type: 'search-status',
                id: 'assistant-turn-1:status',
                status: {
                  runId: 'run-1',
                  entries: [
                    {
                      toolCallId: 'call-1',
                      query: 'Claude latest news'
                    }
                  ]
                }
              }
            ]
          }
        ],
        viewStatus: 'paused'
      })
    );

    render(<ReplayConsole currentUser={currentUser} initialThreadId="thread-1" onLogout={vi.fn()} />);

    expect(screen.getByText(/正在搜索网页/)).toBeTruthy();
    expect(screen.getByText(/1 \/ 1 · paused/)).toBeTruthy();
    const resumeButtons = screen.getAllByRole('button', { name: '继续' });
    expect(resumeButtons.some((button) => !button.hasAttribute('disabled'))).toBe(true);
  });
});
