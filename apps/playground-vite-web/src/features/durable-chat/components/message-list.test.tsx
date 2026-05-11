import type { MessageDto, MessagePartDto } from '@agent-infra/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ChatMessageList } from './message-list';
import type { AnswerContainer } from '@/features/durable-chat/types/answer-containers';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';
import type { ActiveSearchPanelData } from '@/features/durable-chat/types/search';
import type { TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';

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

function renderMessageList({
  messages,
  transcriptBlocks,
  liveAssistantDraft,
  answerContainers = [],
  getLiveSearchPanelData
}: {
  messages: MessageDto[];
  transcriptBlocks: TranscriptBlock[];
  liveAssistantDraft: LiveAssistantDraft | null;
  answerContainers?: AnswerContainer[];
  getLiveSearchPanelData?: (runId: string, toolCallIds: string[]) => ActiveSearchPanelData | null;
}) {
  return renderToStaticMarkup(
    <ChatMessageList
      meta={null}
      error={null}
      durableRecoveryState={{ phase: 'idle', message: null }}
      hasOlderMessages={false}
      historyLoading={false}
      loadingMessages={false}
      activeThreadId="thread-1"
      messages={messages}
      answerContainers={answerContainers}
      transcriptBlocks={transcriptBlocks}
      liveAssistantDraft={liveAssistantDraft}
      showLoadingText={false}
      centeredEmptyState={false}
      showWelcomeWhenEmpty
      getLiveSearchPanelData={getLiveSearchPanelData}
      onLoadOlderMessages={vi.fn()}
      onOpenSearchResult={vi.fn()}
    />
  );
}

describe('ChatMessageList', () => {
  it('shows actions for assistant blocks with copyable text while excluding search labels from the copy scope', () => {
    const assistantMessage = createMessage({
      id: 'assistant-1',
      role: 'assistant',
      runId: 'run-1',
      seq: 1,
      parts: [
        createPart({ id: 'assistant-1:text-1', type: 'text', messageId: 'assistant-1', textValue: '前置说明。' }),
        createPart({ id: 'assistant-1:text-2', type: 'text', messageId: 'assistant-1', partIndex: 1, textValue: '最终总结。' })
      ]
    });

    const markup = renderMessageList({
      messages: [assistantMessage],
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
            },
            {
              type: 'search-summary',
              id: 'assistant-turn-1:search',
              summary: {
                runId: 'run-1',
                entries: [
                  {
                    toolCallId: 'call-1',
                    query: 'DeepSeek latest news',
                    resultCount: 10,
                    sourceNames: ['CNBC', 'WSJ'],
                    sources: [
                      { sourceName: 'CNBC', hostname: 'cnbc.com' },
                      { sourceName: 'WSJ', hostname: 'wsj.com' }
                    ]
                  }
                ]
              }
            },
            {
              type: 'text',
              id: 'assistant-turn-1:text-2',
              cacheKey: 'assistant-turn-1:text-2',
              part: assistantMessage.parts[1]!
            }
          ]
        }
      ],
      liveAssistantDraft: null
    });

    expect(markup).toContain('前置说明。');
    expect(markup).toContain('最终总结。');
    expect(markup).toContain('搜索到 10 个网页');
    expect(markup).toContain('data-message-actions-available="true"');
  });

  it('renders a single operation host for multiple assistant-turn blocks in one answer container', () => {
    const assistantMessageA = createMessage({
      id: 'assistant-1',
      role: 'assistant',
      runId: 'run-1',
      seq: 1,
      parts: [createPart({ id: 'assistant-1:text-1', type: 'text', messageId: 'assistant-1', textValue: '前置说明。' })]
    });
    const assistantMessageB = createMessage({
      id: 'assistant-2',
      role: 'assistant',
      runId: 'run-1',
      seq: 2,
      parts: [createPart({ id: 'assistant-2:text-1', type: 'text', messageId: 'assistant-2', textValue: '最终总结。' })]
    });

    const transcriptBlocks: TranscriptBlock[] = [
      {
        type: 'assistant-turn',
        id: 'assistant-turn-1',
        runId: 'run-1',
        sourceMessages: [assistantMessageA],
        items: [
          {
            type: 'text',
            id: 'assistant-turn-1:text-1',
            cacheKey: 'assistant-turn-1:text-1',
            part: assistantMessageA.parts[0]!
          },
          {
            type: 'search-summary',
            id: 'assistant-turn-1:search',
            summary: {
              runId: 'run-1',
              entries: [
                {
                  toolCallId: 'call-1',
                  query: 'Claude latest news',
                  resultCount: 10,
                  sourceNames: ['The Verge'],
                  sources: [{ sourceName: 'The Verge', hostname: 'theverge.com' }]
                }
              ]
            }
          }
        ]
      },
      {
        type: 'assistant-turn',
        id: 'assistant-turn-2',
        runId: 'run-1',
        sourceMessages: [assistantMessageB],
        items: [
          {
            type: 'text',
            id: 'assistant-turn-2:text-1',
            cacheKey: 'assistant-turn-2:text-1',
            part: assistantMessageB.parts[0]!
          }
        ]
      }
    ];

    const answerContainer: AnswerContainer = {
      id: 'answer-container:run-1:assistant-turn-1',
      kind: 'assistant-answer',
      runId: 'run-1',
      transcriptBlockIds: ['assistant-turn-1', 'assistant-turn-2'],
      blocks: [
        transcriptBlocks[0] as Extract<TranscriptBlock, { type: 'assistant-turn' }>,
        transcriptBlocks[1] as Extract<TranscriptBlock, { type: 'assistant-turn' }>
      ],
      actionHostId: 'answer-container:run-1:assistant-turn-1'
    };

    const markup = renderMessageList({
      messages: [assistantMessageA, assistantMessageB],
      transcriptBlocks,
      answerContainers: [answerContainer],
      liveAssistantDraft: null
    });

    expect(markup).toContain('前置说明。');
    expect(markup).toContain('最终总结。');
    expect(markup).toContain('搜索到 10 个网页');
    expect(markup).toContain('data-answer-container-id="answer-container:run-1:assistant-turn-1"');
    expect(markup.match(/data-message-actions-available="true"/g)).toHaveLength(1);
  });

  it('keeps one thinking container open until assistant text appears', () => {
    const assistantMessageA = createMessage({
      id: 'assistant-1',
      role: 'assistant',
      runId: 'run-1',
      seq: 1,
      parts: [createPart({ id: 'assistant-1:reasoning', type: 'reasoning', messageId: 'assistant-1', textValue: '先判断问题。' })]
    });
    const assistantMessageB = createMessage({
      id: 'assistant-2',
      role: 'assistant',
      runId: 'run-1',
      seq: 2,
      parts: [
        createPart({ id: 'assistant-2:reasoning', type: 'reasoning', messageId: 'assistant-2', textValue: '我再打开页面看看。' }),
        createPart({ id: 'assistant-2:text', type: 'text', messageId: 'assistant-2', partIndex: 1, textValue: '最终答案。' })
      ]
    });

    const transcriptBlocks: TranscriptBlock[] = [
      {
        type: 'assistant-turn',
        id: 'assistant-turn-1',
        runId: 'run-1',
        sourceMessages: [assistantMessageA],
        items: [
          {
            type: 'reasoning',
            id: 'assistant-turn-1:reasoning',
            part: assistantMessageA.parts[0]!
          },
          {
            type: 'search-summary',
            id: 'assistant-turn-1:search',
            summary: {
              runId: 'run-1',
              entries: [
                {
                  toolCallId: 'call-1',
                  query: '速水玲香 金田一少年事件簿',
                  resultCount: 8,
                  sourceNames: ['百度百科'],
                  sources: [{ sourceName: '百度百科', hostname: 'baike.baidu.com' }]
                }
              ]
            }
          }
        ]
      },
      {
        type: 'assistant-turn',
        id: 'assistant-turn-2',
        runId: 'run-1',
        sourceMessages: [assistantMessageB],
        items: [
          {
            type: 'reasoning',
            id: 'assistant-turn-2:reasoning',
            part: assistantMessageB.parts[0]!
          },
          {
            type: 'text',
            id: 'assistant-turn-2:text',
            cacheKey: 'assistant-turn-2:text',
            part: assistantMessageB.parts[1]!
          }
        ]
      }
    ];

    const answerContainer: AnswerContainer = {
      id: 'answer-container:run-1:assistant-turn-1',
      kind: 'assistant-answer',
      runId: 'run-1',
      transcriptBlockIds: ['assistant-turn-1', 'assistant-turn-2'],
      blocks: [
        transcriptBlocks[0] as Extract<TranscriptBlock, { type: 'assistant-turn' }>,
        transcriptBlocks[1] as Extract<TranscriptBlock, { type: 'assistant-turn' }>
      ],
      actionHostId: 'answer-container:run-1:assistant-turn-1'
    };

    const markup = renderMessageList({
      messages: [assistantMessageA, assistantMessageB],
      transcriptBlocks,
      answerContainers: [answerContainer],
      liveAssistantDraft: null
    });

    expect(markup.match(/data-thinking-container="true"/g)).toHaveLength(1);
    expect(markup).toContain('先判断问题。');
    expect(markup).toContain('我再打开页面看看。');
    expect(markup).toContain('搜索到 8 个网页');
    expect(markup).toContain('最终答案。');
  });

  it('starts a new thinking container when reasoning appears after assistant text', () => {
    const assistantMessage = createMessage({
      id: 'assistant-1',
      role: 'assistant',
      runId: 'run-1',
      seq: 1,
      parts: [
        createPart({ id: 'assistant-1:r1', type: 'reasoning', messageId: 'assistant-1', textValue: '先想一下。' }),
        createPart({ id: 'assistant-1:t1', type: 'text', messageId: 'assistant-1', partIndex: 1, textValue: '第一段正文。' }),
        createPart({ id: 'assistant-1:r2', type: 'reasoning', messageId: 'assistant-1', partIndex: 2, textValue: '再补充一轮思考。' }),
        createPart({ id: 'assistant-1:t2', type: 'text', messageId: 'assistant-1', partIndex: 3, textValue: '第二段正文。' })
      ]
    });

    const transcriptBlocks: TranscriptBlock[] = [
      {
        type: 'assistant-turn',
        id: 'assistant-turn-1',
        runId: 'run-1',
        sourceMessages: [assistantMessage],
        items: [
          {
            type: 'reasoning',
            id: 'assistant-turn-1:r1',
            part: assistantMessage.parts[0]!
          },
          {
            type: 'text',
            id: 'assistant-turn-1:t1',
            cacheKey: 'assistant-turn-1:t1',
            part: assistantMessage.parts[1]!
          },
          {
            type: 'reasoning',
            id: 'assistant-turn-1:r2',
            part: assistantMessage.parts[2]!
          },
          {
            type: 'text',
            id: 'assistant-turn-1:t2',
            cacheKey: 'assistant-turn-1:t2',
            part: assistantMessage.parts[3]!
          }
        ]
      }
    ];

    const answerContainer: AnswerContainer = {
      id: 'answer-container:run-1:assistant-turn-1',
      kind: 'assistant-answer',
      runId: 'run-1',
      transcriptBlockIds: ['assistant-turn-1'],
      blocks: [transcriptBlocks[0] as Extract<TranscriptBlock, { type: 'assistant-turn' }>],
      actionHostId: 'answer-container:run-1:assistant-turn-1'
    };

    const markup = renderMessageList({
      messages: [assistantMessage],
      transcriptBlocks,
      answerContainers: [answerContainer],
      liveAssistantDraft: null
    });

    expect(markup.match(/data-thinking-container="true"/g)).toHaveLength(2);
    expect(markup).toContain('第一段正文。');
    expect(markup).toContain('第二段正文。');
  });

  it('hides actions for search-only assistant blocks', () => {
    const toolMessage = createMessage({
      id: 'tool-1',
      role: 'tool',
      runId: 'run-1',
      seq: 1
    });

    const markup = renderMessageList({
      messages: [toolMessage],
      transcriptBlocks: [
        {
          type: 'assistant-turn',
          id: 'assistant-turn-search-only',
          runId: 'run-1',
          sourceMessages: [toolMessage],
          items: [
            {
              type: 'search-summary',
              id: 'assistant-turn-search-only:search',
              summary: {
                runId: 'run-1',
                entries: [
                  {
                    toolCallId: 'call-1',
                    query: 'Claude latest news',
                    resultCount: 8,
                    sourceNames: ['The Verge'],
                    sources: [{ sourceName: 'The Verge', hostname: 'theverge.com' }]
                  }
                ]
              }
            }
          ]
        }
      ],
      answerContainers: [
        {
          id: 'answer-container:run-1:assistant-turn-search-only',
          kind: 'assistant-answer',
          runId: 'run-1',
          transcriptBlockIds: ['assistant-turn-search-only'],
          blocks: [
            {
              type: 'assistant-turn',
              id: 'assistant-turn-search-only',
              runId: 'run-1',
              sourceMessages: [toolMessage],
              items: [
                {
                  type: 'search-summary',
                  id: 'assistant-turn-search-only:search',
                  summary: {
                    runId: 'run-1',
                    entries: [
                      {
                        toolCallId: 'call-1',
                        query: 'Claude latest news',
                        resultCount: 8,
                        sourceNames: ['The Verge'],
                        sources: [{ sourceName: 'The Verge', hostname: 'theverge.com' }]
                      }
                    ]
                  }
                }
              ]
            }
          ],
          actionHostId: 'answer-container:run-1:assistant-turn-search-only'
        }
      ],
      liveAssistantDraft: null
    });

    expect(markup).toContain('搜索到 8 个网页');
    expect(markup).toContain('data-message-actions-available="false"');
  });

  it('does not render persisted in-progress research labels from transcript search-status items', () => {
    const toolMessage = createMessage({
      id: 'tool-2',
      role: 'tool',
      runId: 'run-2',
      seq: 1
    });

    const markup = renderMessageList({
      messages: [toolMessage],
      transcriptBlocks: [
        {
          type: 'assistant-turn',
          id: 'assistant-turn-search-pending',
          runId: 'run-2',
          sourceMessages: [toolMessage],
          items: [
            {
              type: 'search-status',
              id: 'assistant-turn-search-pending:status',
              status: {
                runId: 'run-2',
                entries: [{ toolCallId: 'call-1', query: '速水玲香 人物' }]
              }
            }
          ]
        }
      ],
      liveAssistantDraft: null
    });

    expect(markup).not.toContain('正在搜索网页');
  });

  it('renders persisted transcript blocks alongside a live draft with search status', () => {
    const userMessage = createMessage({
      id: 'user-1',
      role: 'user',
      seq: 1,
      parts: [createPart({ id: 'user-1:text', type: 'text', messageId: 'user-1', textValue: '帮我看最新的 Claude 新闻' })]
    });
    const persistedAssistantMessage = createMessage({
      id: 'assistant-1',
      role: 'assistant',
      runId: 'run-1',
      seq: 2,
      parts: [createPart({ id: 'assistant-1:text', type: 'text', messageId: 'assistant-1', textValue: '这是已经持久化的上一段内容。' })]
    });

    const liveAssistantDraft: LiveAssistantDraft = {
      runId: 'run-2',
      messageId: 'assistant-live-1',
      source: 'live',
      committedText: '',
      partialText: '好的，我来继续搜索 Claude 的最新新闻。',
      segmentText: '好的，我来继续搜索 Claude 的最新新闻。',
      segmentTextMessageId: 'assistant-live-1',
      partialReasoning: null,
      segmentReasoningMessageId: null,
      activeTools: [
        {
          toolCallId: 'call-live-1',
          toolName: 'searchWeb',
          phase: 'start',
          input: { query: 'Claude latest news' }
        }
      ],
      eventType: 'searching',
      segments: [
        {
          id: 'segment-1',
          messageId: 'assistant-live-1',
          text: '好的，我来继续搜索 Claude 的最新新闻。',
          reasoning: null,
          tools: [
            {
              toolCallId: 'call-live-1',
              toolName: 'searchWeb',
              phase: 'start',
              input: { query: 'Claude latest news' }
            }
          ],
          eventType: 'searching'
        }
      ]
    };

    const markup = renderMessageList({
      messages: [userMessage, persistedAssistantMessage],
      transcriptBlocks: [
        { type: 'user-message', id: 'user-block-1', message: userMessage },
        {
          type: 'assistant-turn',
          id: 'assistant-turn-1',
          runId: 'run-1',
          sourceMessages: [persistedAssistantMessage],
          items: [
            {
              type: 'text',
              id: 'assistant-turn-1:text',
              cacheKey: 'assistant-turn-1:text',
              part: persistedAssistantMessage.parts[0]!
            }
          ]
        }
      ],
      liveAssistantDraft
    });

    expect(markup).toContain('这是已经持久化的上一段内容。');
    expect(markup).toContain('好的，我来继续搜索 Claude 的最新新闻。');
    expect(markup).toContain('正在搜索网页');
  });

  it('renders a clickable live completed search summary when cached panel data is available', () => {
    const liveAssistantDraft: LiveAssistantDraft = {
      runId: 'run-live',
      messageId: 'assistant-live-2',
      source: 'live',
      committedText: '',
      partialText: '我已经查到结果了。',
      segmentText: '我已经查到结果了。',
      segmentTextMessageId: 'assistant-live-2',
      partialReasoning: null,
      segmentReasoningMessageId: null,
      activeTools: [],
      eventType: 'streaming',
      segments: [
        {
          id: 'segment-2',
          messageId: 'assistant-live-2',
          text: '我已经查到结果了。',
          reasoning: null,
          tools: [
            {
              toolCallId: 'call-live-search',
              toolName: 'searchWeb',
              phase: 'completed',
              input: { query: '速水玲香 金田一少年事件簿' }
            }
          ],
          eventType: 'streaming'
        }
      ]
    };

    const markup = renderMessageList({
      messages: [],
      transcriptBlocks: [],
      liveAssistantDraft,
      getLiveSearchPanelData: () => ({
        runId: 'run-live',
        toolCallIds: ['call-live-search'],
        provider: 'tavily',
        resultCount: 9,
        sourceNames: ['百度百科'],
        sections: [
          {
            toolCallId: 'call-live-search',
            query: '速水玲香 金田一少年事件簿',
            resultCount: 9,
            results: [
              {
                rank: 1,
                title: '速水玲香',
                url: 'https://baike.baidu.com/item/x',
                snippet: '...',
                sourceName: '百度百科',
                hostname: 'baike.baidu.com',
                publishedAt: null
              }
            ]
          }
        ]
      })
    });

    expect(markup).toContain('搜索到 9 个网页');
    expect(markup).toContain('百度百科');
  });

  it('renders one live thinking container across reasoning and research until text appears', () => {
    const liveAssistantDraft: LiveAssistantDraft = {
      runId: 'run-live',
      messageId: 'assistant-live-3',
      source: 'live',
      committedText: '',
      partialText: '',
      segmentText: '',
      segmentTextMessageId: null,
      partialReasoning: null,
      segmentReasoningMessageId: null,
      activeTools: [],
      eventType: 'streaming',
      segments: [
        {
          id: 'segment-1',
          messageId: 'assistant-live-3',
          text: '',
          reasoning: '我先搜索一下相关资料。',
          tools: [
            {
              toolCallId: 'call-live-search',
              toolName: 'searchWeb',
              phase: 'completed',
              input: { query: '速水玲香 金田一少年事件簿' }
            }
          ],
          eventType: 'streaming'
        },
        {
          id: 'segment-2',
          messageId: 'assistant-live-3',
          text: '',
          reasoning: '我再打开一个页面确认细节。',
          tools: [
            {
              toolCallId: 'call-live-open',
              toolName: 'openUrl',
              phase: 'completed',
              input: { url: 'https://baike.baidu.com/item/x' }
            }
          ],
          eventType: 'streaming'
        },
        {
          id: 'segment-3',
          messageId: 'assistant-live-3',
          text: '最终答案开始输出。',
          reasoning: null,
          tools: [],
          eventType: 'streaming'
        }
      ]
    };

    const markup = renderMessageList({
      messages: [],
      transcriptBlocks: [],
      liveAssistantDraft,
      getLiveSearchPanelData: () => ({
        runId: 'run-live',
        toolCallIds: ['call-live-search'],
        provider: 'tavily',
        resultCount: 8,
        sourceNames: ['百度百科'],
        sections: [
          {
            toolCallId: 'call-live-search',
            query: '速水玲香 金田一少年事件簿',
            resultCount: 8,
            results: [
              {
                rank: 1,
                title: '速水玲香',
                url: 'https://baike.baidu.com/item/x',
                snippet: '...',
                sourceName: '百度百科',
                hostname: 'baike.baidu.com',
                publishedAt: null
              }
            ]
          }
        ]
      })
    });

    expect(markup.match(/data-thinking-container="true"/g)).toHaveLength(1);
    expect(markup).toContain('我先搜索一下相关资料。');
    expect(markup).toContain('我再打开一个页面确认细节。');
    expect(markup).toContain('搜索到 8 个网页');
    expect(markup).toContain('最终答案开始输出。');
  });
});
