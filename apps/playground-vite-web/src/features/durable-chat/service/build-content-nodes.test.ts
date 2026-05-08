import type { MessageDto, MessagePartDto } from '@agent-infra/contracts';
import { describe, expect, it } from 'vitest';

import { buildContentNodes } from '@/features/durable-chat/service/build-content-nodes';

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

describe('buildContentNodes', () => {
  it('builds user, assistant, reasoning, search loading, and search summary nodes', () => {
    const nodes = buildContentNodes([
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
        parts: [
          createPart({ id: 'assistant-1:text', type: 'text', messageId: 'assistant-1', textValue: '好的，我来帮你搜索一下。' }),
          createPart({ id: 'assistant-1:reasoning', type: 'reasoning', messageId: 'assistant-1', partIndex: 1, textValue: '先搜索，再总结。' })
        ]
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
      })
    ]);

    expect(nodes.map((node) => node.kind)).toEqual([
      'user-text',
      'assistant-text',
      'assistant-reasoning',
      'assistant-search-loading',
      'assistant-search-summary'
    ]);

    expect(nodes[0]).toMatchObject({
      kind: 'user-text',
      blockHintId: 'user-message:user-1',
      text: '帮我看 Claude 最新新闻'
    });

    const assistantBlockHintId = 'assistant-turn:run-1:2';
    expect(nodes[1]).toMatchObject({
      kind: 'assistant-text',
      blockHintId: assistantBlockHintId,
      text: '好的，我来帮你搜索一下。'
    });
    expect(nodes[2]).toMatchObject({
      kind: 'assistant-reasoning',
      blockHintId: assistantBlockHintId,
      text: '先搜索，再总结。'
    });
    expect(nodes[3]).toMatchObject({
      kind: 'assistant-search-loading',
      blockHintId: assistantBlockHintId,
      toolCallId: 'call-1',
      query: 'Claude latest news'
    });
    expect(nodes[4]).toMatchObject({
      kind: 'assistant-search-summary',
      blockHintId: assistantBlockHintId,
      entry: {
        toolCallId: 'call-1',
        query: 'Claude latest news',
        resultCount: 10
      }
    });
  });

  it('preserves non-search tool parts as assistant-tool-part nodes', () => {
    const nodes = buildContentNodes([
      createMessage({
        id: 'assistant-1',
        role: 'assistant',
        runId: 'run-1',
        seq: 1,
        parts: [createPart({ id: 'assistant-1:text', type: 'text', messageId: 'assistant-1', textValue: 'Checking runtime info.' })]
      }),
      createMessage({
        id: 'tool-1',
        role: 'tool',
        runId: 'run-1',
        seq: 2,
        parts: [
          createPart({
            id: 'tool-1:call',
            type: 'tool-call',
            messageId: 'tool-1',
            jsonValue: {
              toolName: 'getRuntimeInfo',
              toolCallId: 'call-1',
              input: {}
            }
          }),
          createPart({
            id: 'tool-1:result',
            type: 'tool-result',
            messageId: 'tool-1',
            partIndex: 1,
            jsonValue: {
              toolName: 'getRuntimeInfo',
              toolCallId: 'call-1',
              details: { runtime: 'pi' }
            }
          })
        ]
      })
    ]);

    expect(nodes.map((node) => node.kind)).toEqual(['assistant-text', 'assistant-tool-part', 'assistant-tool-part']);
  });

  it('splits block hints when the same run emits a later assistant message boundary', () => {
    const nodes = buildContentNodes([
      createMessage({
        id: 'assistant-1',
        role: 'assistant',
        runId: 'run-1',
        seq: 1,
        parts: [createPart({ id: 'assistant-1:text', type: 'text', messageId: 'assistant-1', textValue: '第一段。' })]
      }),
      createMessage({
        id: 'tool-1',
        role: 'tool',
        runId: 'run-1',
        seq: 2,
        parts: [createSearchCallPart('call-1', 'first query', 'tool-1')]
      }),
      createMessage({
        id: 'assistant-2',
        role: 'assistant',
        runId: 'run-1',
        seq: 3,
        parts: [createPart({ id: 'assistant-2:text', type: 'text', messageId: 'assistant-2', textValue: '第二段。' })]
      })
    ]);

    const assistantTextNodes = nodes.filter((node) => node.kind === 'assistant-text');
    expect(assistantTextNodes).toHaveLength(2);
    expect(assistantTextNodes[0]?.blockHintId).toBe('assistant-turn:run-1:1');
    expect(assistantTextNodes[1]?.blockHintId).toBe('assistant-turn:run-1:3');
  });
});
