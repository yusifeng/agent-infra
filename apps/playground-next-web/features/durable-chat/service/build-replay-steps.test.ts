import type { MessageDto, MessagePartDto } from '@agent-infra/contracts';
import { describe, expect, it } from 'vitest';

import { buildContentNodes } from '@/features/durable-chat/service/build-content-nodes';
import { buildReplaySession, buildReplaySessionFromContentNodes, buildReplayStepsFromContentNodes } from '@/features/durable-chat/service/build-replay-steps';
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

function createSearchCallPart(toolCallId: string, query: string, messageId: string) {
  return createPart({
    id: `${messageId}:${toolCallId}:call`,
    type: 'tool-call',
    messageId,
    jsonValue: {
      toolName: 'searchWeb',
      toolCallId,
      input: { query }
    }
  });
}

function createSearchResultPart(toolCallId: string, query: string, messageId: string, resultCount = 10) {
  return createPart({
    id: `${messageId}:${toolCallId}:result`,
    type: 'tool-result',
    messageId,
    jsonValue: {
      toolName: 'searchWeb',
      toolCallId,
      details: {
        query,
        resultCount,
        sourceNames: ['The Verge', 'Ars Technica'],
        sources: [
          { sourceName: 'The Verge', hostname: 'theverge.com' },
          { sourceName: 'Ars Technica', hostname: 'arstechnica.com' }
        ]
      }
    }
  });
}

function createOpenUrlResultPart(toolCallId: string, messageId: string) {
  return createPart({
    id: `${messageId}:${toolCallId}:result`,
    type: 'tool-result',
    messageId,
    jsonValue: {
      toolName: 'openUrl',
      toolCallId,
      details: {
        status: 'success',
        url: 'https://example.com/character',
        finalUrl: 'https://example.com/character',
        title: '速水玲香 - 百度百科',
        siteName: '百度百科',
        contentQuality: 'good'
      }
    }
  });
}

function createOpenUrlCallPart(toolCallId: string, messageId: string) {
  return createPart({
    id: `${messageId}:${toolCallId}:call`,
    type: 'tool-call',
    messageId,
    jsonValue: {
      toolName: 'openUrl',
      toolCallId,
      input: { url: 'https://example.com/character' }
    }
  });
}

describe('buildReplaySteps', () => {
  it('builds text -> search-loading -> search-summary -> text steps at transcript item granularity', () => {
    const messages = [
      createMessage({
        id: 'user-1',
        role: 'user',
        seq: 1,
        parts: [createPart({ id: 'user-1:text', type: 'text', messageId: 'user-1', textValue: '帮我看 Claude 最新新闻' })]
      }),
      createMessage({
        id: 'assistant-1',
        role: 'assistant',
        runId: 'run-1',
        seq: 2,
        parts: [createPart({ id: 'assistant-1:text', type: 'text', messageId: 'assistant-1', textValue: '好的，我来帮你搜索一下关于 Claude 的最新新闻。' })]
      }),
      createMessage({
        id: 'tool-1',
        role: 'tool',
        runId: 'run-1',
        seq: 3,
        parts: [createSearchCallPart('call-1', 'Claude latest news', 'tool-1')]
      }),
      createMessage({
        id: 'tool-2',
        role: 'tool',
        runId: 'run-1',
        seq: 4,
        parts: [createSearchResultPart('call-1', 'Claude latest news', 'tool-2')]
      }),
      createMessage({
        id: 'assistant-2',
        role: 'assistant',
        runId: 'run-1',
        seq: 5,
        parts: [createPart({ id: 'assistant-2:text', type: 'text', messageId: 'assistant-2', textValue: '以下是关于 Claude 的最新新闻摘要。' })]
      })
    ];

    const steps = buildReplayStepsFromContentNodes(buildContentNodes(messages));

    expect(steps.map((step) => step.kind)).toEqual([
      'text',
      'text',
      'search-loading',
      'search-summary',
      'text',
      'done'
    ]);
    expect(steps[0]).toMatchObject({
      kind: 'text',
      role: 'user',
      content: '帮我看 Claude 最新新闻'
    });
    expect(steps[1]).toMatchObject({
      kind: 'text',
      role: 'assistant',
      content: '好的，我来帮你搜索一下关于 Claude 的最新新闻。'
    });
    expect(steps[2]).toMatchObject({
      kind: 'search-loading',
      query: 'Claude latest news',
      toolCallIds: ['call-1']
    });
    expect(steps[3]).toMatchObject({
      kind: 'search-summary',
      query: 'Claude latest news',
      resultCount: 10,
      sourceNames: ['The Verge', 'Ars Technica'],
      sources: [
        { sourceName: 'The Verge', hostname: 'theverge.com' },
        { sourceName: 'Ars Technica', hostname: 'arstechnica.com' }
      ]
    });
    expect(steps[4]).toMatchObject({
      kind: 'text',
      role: 'assistant',
      content: '以下是关于 Claude 的最新新闻摘要。'
    });
  });

  it('preserves multiple search nodes instead of collapsing them into one replay summary', () => {
    const messages = [
      createMessage({
        id: 'assistant-1',
        role: 'assistant',
        runId: 'run-1',
        seq: 1,
        parts: [createPart({ id: 'assistant-1:text', type: 'text', messageId: 'assistant-1', textValue: '我会分两次搜索。' })]
      }),
      createMessage({
        id: 'tool-1',
        role: 'tool',
        runId: 'run-1',
        seq: 2,
        parts: [createSearchCallPart('call-1', 'first query', 'tool-1')]
      }),
      createMessage({
        id: 'tool-2',
        role: 'tool',
        runId: 'run-1',
        seq: 3,
        parts: [createSearchResultPart('call-1', 'first query', 'tool-2', 8)]
      }),
      createMessage({
        id: 'tool-3',
        role: 'tool',
        runId: 'run-1',
        seq: 4,
        parts: [createSearchCallPart('call-2', 'second query', 'tool-3')]
      }),
      createMessage({
        id: 'tool-4',
        role: 'tool',
        runId: 'run-1',
        seq: 5,
        parts: [createSearchResultPart('call-2', 'second query', 'tool-4', 5)]
      })
    ];

    const steps = buildReplayStepsFromContentNodes(buildContentNodes(messages));

    expect(steps.map((step) => step.kind)).toEqual([
      'text',
      'search-loading',
      'search-summary',
      'search-loading',
      'search-summary',
      'done'
    ]);
    expect(steps.filter((step) => step.kind === 'search-summary')).toHaveLength(2);
    expect(steps.filter((step) => step.kind === 'search-loading')).toHaveLength(2);
  });

  it('preserves openUrl tool parts as replay tool-part steps', () => {
    const messages = [
      createMessage({
        id: 'tool-1',
        role: 'tool',
        runId: 'run-1',
        seq: 1,
        parts: [
          createOpenUrlCallPart('call-open-1', 'tool-1'),
          createOpenUrlResultPart('call-open-1', 'tool-1')
        ]
      })
    ];

    const steps = buildReplayStepsFromContentNodes(buildContentNodes(messages));

    expect(steps.map((step) => step.kind)).toEqual(['tool-part', 'tool-part', 'done']);
    expect(steps[0]).toMatchObject({
      kind: 'tool-part',
      runId: 'run-1'
    });
  });

  it('does not preserve unrelated tool parts as replay tool-part steps', () => {
    const messages = [
      createMessage({
        id: 'tool-1',
        role: 'tool',
        runId: 'run-1',
        seq: 1,
        parts: [
          createPart({
            id: 'tool-1:other-call',
            type: 'tool-call',
            messageId: 'tool-1',
            jsonValue: {
              toolName: 'otherTool',
              toolCallId: 'call-other-1',
              input: {}
            }
          })
        ]
      })
    ];

    const steps = buildReplayStepsFromContentNodes(buildContentNodes(messages));

    expect(steps.map((step) => step.kind)).toEqual(['done']);
  });

  it('supports pure text replies without creating fake search nodes', () => {
    const messages = [
      createMessage({
        id: 'assistant-1',
        role: 'assistant',
        runId: 'run-1',
        seq: 1,
        parts: [
          createPart({ id: 'assistant-1:text', type: 'text', messageId: 'assistant-1', textValue: '这是第一段。' }),
          createPart({ id: 'assistant-1:reasoning', type: 'reasoning', messageId: 'assistant-1', textValue: '这是思考段。' })
        ]
      })
    ];

    const steps = buildReplayStepsFromContentNodes(buildContentNodes(messages));

    expect(steps.map((step) => step.kind)).toEqual(['text', 'text', 'done']);
    expect(steps[0]).toMatchObject({ kind: 'text', variant: 'text', content: '这是第一段。' });
    expect(steps[1]).toMatchObject({ kind: 'text', variant: 'reasoning', content: '这是思考段。' });
  });

  it('replays user reasoning steps from shared content nodes', () => {
    const messages = [
      createMessage({
        id: 'user-1',
        role: 'user',
        seq: 1,
        parts: [
          createPart({ id: 'user-1:text', type: 'text', messageId: 'user-1', textValue: '帮我整理 Claude 新闻' }),
          createPart({
            id: 'user-1:reasoning',
            type: 'reasoning',
            messageId: 'user-1',
            partIndex: 1,
            textValue: '我想先看重点，再看细节。'
          })
        ]
      })
    ];

    const steps = buildReplayStepsFromContentNodes(buildContentNodes(messages));

    expect(steps.map((step) => step.kind)).toEqual(['text', 'text', 'done']);
    expect(steps[0]).toMatchObject({
      kind: 'text',
      role: 'user',
      variant: 'text',
      content: '帮我整理 Claude 新闻'
    });
    expect(steps[1]).toMatchObject({
      kind: 'text',
      role: 'user',
      variant: 'reasoning',
      content: '我想先看重点，再看细节。'
    });
  });

  it('builds a replay session with thread-scoped metadata and empty initial transcript blocks', () => {
    const messages = [
      createMessage({
        id: 'user-1',
        role: 'user',
        seq: 1,
        parts: [createPart({ id: 'user-1:text', type: 'text', messageId: 'user-1', textValue: 'Search GPT-5.5' })]
      })
    ];

    const session = buildReplaySessionFromContentNodes(buildContentNodes(messages));

    expect(session.id).toContain('replay:thread-1:');
    expect(session.threadId).toBe('thread-1');
    expect(session.mode).toBe('thread');
    expect(session.initialTranscriptBlocks).toEqual([]);
    expect(session.steps.at(-1)).toMatchObject({ kind: 'done' });
  });

  it('preserves a fallback thread id when no content nodes are available', () => {
    const session = buildReplaySessionFromContentNodes([], 'thread-empty');

    expect(session.threadId).toBe('thread-empty');
    expect(session.id).toContain('replay:thread-empty:');
    expect(session.steps).toHaveLength(1);
    expect(session.steps[0]).toMatchObject({
      kind: 'done',
      threadId: 'thread-empty'
    });
  });

  it('preserves thread identity in the legacy block wrapper when replayable nodes are absent', () => {
    const blocks: TranscriptBlock[] = [
      {
        type: 'user-message',
        id: 'user-message:user-legacy',
        message: createMessage({
          id: 'user-legacy',
          threadId: 'thread-legacy',
          role: 'user',
          seq: 1,
          parts: [
            createPart({
              id: 'user-legacy:tool-call',
              type: 'tool-call',
              messageId: 'user-legacy',
              jsonValue: { toolName: 'noop', toolCallId: 'call-legacy', input: {} }
            })
          ]
        })
      }
    ];

    const session = buildReplaySession(blocks);

    expect(session.threadId).toBe('thread-legacy');
    expect(session.id).toContain('replay:thread-legacy:');
    expect(session.steps).toHaveLength(1);
    expect(session.steps[0]).toMatchObject({
      kind: 'done',
      threadId: 'thread-legacy'
    });
  });
});
