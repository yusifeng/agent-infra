import type { MessageDto, MessagePartDto } from '@agent-infra/contracts';
import { describe, expect, it } from 'vitest';

import { buildTranscriptBlocks, filterTranscriptBlocksForLiveRun } from './build-transcript-blocks';

function createPart(overrides: Partial<MessagePartDto> & Pick<MessagePartDto, 'id' | 'type'>): MessagePartDto {
  return {
    id: overrides.id,
    messageId: overrides.messageId ?? 'message-1',
    partIndex: overrides.partIndex ?? 0,
    type: overrides.type,
    textValue: overrides.textValue ?? null,
    jsonValue: overrides.jsonValue ?? null,
    createdAt: overrides.createdAt ?? '2026-05-07T00:00:00.000Z'
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
    createdAt: overrides.createdAt ?? '2026-05-07T00:00:00.000Z',
    parts: overrides.parts ?? []
  };
}

describe('buildTranscriptBlocks', () => {
  it('keeps assistant message boundaries while attaching following tool messages from the same run', () => {
    const blocks = buildTranscriptBlocks([
      createMessage({
        id: 'user-1',
        role: 'user',
        seq: 1,
        parts: [createPart({ id: 'user-1:text', type: 'text', textValue: 'Search GPT-5.5 news', messageId: 'user-1' })]
      }),
      createMessage({
        id: 'assistant-1',
        role: 'assistant',
        runId: 'run-1',
        seq: 2,
        parts: [createPart({ id: 'assistant-1:text', type: 'text', textValue: 'I will search that.', messageId: 'assistant-1' })]
      }),
      createMessage({
        id: 'tool-1',
        role: 'tool',
        runId: 'run-1',
        seq: 3,
        parts: [
          createPart({
            id: 'tool-1:call',
            type: 'tool-call',
            messageId: 'tool-1',
            jsonValue: {
              toolName: 'searchWeb',
              toolCallId: 'call-1',
              input: { query: 'GPT-5.5 latest news' }
            }
          })
        ]
      }),
      createMessage({
        id: 'tool-2',
        role: 'tool',
        runId: 'run-1',
        seq: 4,
        parts: [
          createPart({
            id: 'tool-2:result',
            type: 'tool-result',
            messageId: 'tool-2',
            jsonValue: {
              toolName: 'searchWeb',
              toolCallId: 'call-1',
              details: {
                query: 'GPT-5.5 latest news',
                resultCount: 3,
                sourceNames: ['CNBC'],
                sources: [{ sourceName: 'CNBC', hostname: 'cnbc.com' }]
              }
            }
          })
        ]
      }),
      createMessage({
        id: 'assistant-2',
        role: 'assistant',
        runId: 'run-1',
        seq: 5,
        parts: [createPart({ id: 'assistant-2:text', type: 'text', textValue: 'Here is the summary.', messageId: 'assistant-2' })]
      })
    ]);

    expect(blocks).toHaveLength(3);
    expect(blocks[0]?.type).toBe('user-message');
    expect(blocks[1]?.type).toBe('assistant-turn');
    expect(blocks[2]?.type).toBe('assistant-turn');
    if (blocks[1]?.type !== 'assistant-turn' || blocks[2]?.type !== 'assistant-turn') {
      throw new Error('expected assistant-turn block');
    }

    expect(blocks[1].sourceMessages.map((message) => message.id)).toEqual(['assistant-1', 'tool-1', 'tool-2']);
    expect(blocks[1].items.map((item) => item.type)).toEqual(['text', 'search-summary']);
    expect(blocks[2].sourceMessages.map((message) => message.id)).toEqual(['assistant-2']);
    expect(blocks[2].items.map((item) => item.type)).toEqual(['text']);
  });

  it('keeps a pending search status when a search call has not completed yet', () => {
    const blocks = buildTranscriptBlocks([
      createMessage({
        id: 'assistant-1',
        role: 'assistant',
        runId: 'run-1',
        seq: 1,
        parts: [createPart({ id: 'assistant-1:text', type: 'text', textValue: 'I will search that.', messageId: 'assistant-1' })]
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
              toolName: 'searchWeb',
              toolCallId: 'call-1',
              input: { query: 'GPT-5.5 latest news' }
            }
          })
        ]
      })
    ]);

    expect(blocks).toHaveLength(1);
    if (blocks[0]?.type !== 'assistant-turn') {
      throw new Error('expected assistant-turn block');
    }

    expect(blocks[0].items.map((item) => item.type)).toEqual(['text', 'search-status']);
  });

  it('preserves legacy assistant messages without a run id', () => {
    const blocks = buildTranscriptBlocks([
      createMessage({
        id: 'assistant-legacy',
        role: 'assistant',
        runId: null,
        seq: 1,
        parts: [createPart({ id: 'assistant-legacy:text', type: 'text', textValue: 'Legacy assistant reply.', messageId: 'assistant-legacy' })]
      })
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe('assistant-turn');
    if (blocks[0]?.type !== 'assistant-turn') {
      throw new Error('expected assistant-turn block');
    }

    expect(blocks[0].runId).toBeNull();
    expect(blocks[0].sourceMessages.map((message) => message.id)).toEqual(['assistant-legacy']);
    expect(blocks[0].items.map((item) => item.type)).toEqual(['text']);
  });

  it('preserves non-search tool parts in the assistant turn', () => {
    const blocks = buildTranscriptBlocks([
      createMessage({
        id: 'assistant-1',
        role: 'assistant',
        runId: 'run-1',
        seq: 1,
        parts: [createPart({ id: 'assistant-1:text', type: 'text', textValue: 'Checking runtime info.', messageId: 'assistant-1' })]
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
            jsonValue: {
              toolName: 'getRuntimeInfo',
              toolCallId: 'call-1',
              details: { runtime: 'pi' }
            }
          })
        ]
      })
    ]);

    expect(blocks).toHaveLength(1);
    if (blocks[0]?.type !== 'assistant-turn') {
      throw new Error('expected assistant-turn block');
    }

    expect(blocks[0].items.map((item) => item.type)).toEqual(['text', 'tool-part', 'tool-part']);
  });

  it('derives search sources from legacy memory URLs when hostname metadata is missing', () => {
    const blocks = buildTranscriptBlocks([
      createMessage({
        id: 'tool-1',
        role: 'tool',
        runId: 'run-1',
        seq: 1,
        parts: [
          createPart({
            id: 'tool-1:result',
            type: 'tool-result',
            messageId: 'tool-1',
            jsonValue: {
              toolName: 'searchWeb',
              toolCallId: 'call-1',
              details: {
                query: 'AMD latest news',
                resultCount: 2,
                sourceNames: ['CNBC'],
                memory: {
                  sources: [{ sourceName: 'CNBC', url: 'https://www.cnbc.com/amd-news' }]
                }
              }
            }
          })
        ]
      })
    ]);

    expect(blocks).toHaveLength(1);
    if (blocks[0]?.type !== 'assistant-turn') {
      throw new Error('expected assistant-turn block');
    }

    const summaryItem = blocks[0].items[0];
    expect(summaryItem?.type).toBe('search-summary');
    if (summaryItem?.type !== 'search-summary') {
      throw new Error('expected search-summary item');
    }

    expect(summaryItem.summary.entries[0]?.sources).toEqual([{ sourceName: 'CNBC', hostname: 'cnbc.com' }]);
  });

  it('hides the persisted assistant turns for the currently streaming run', () => {
    const blocks = buildTranscriptBlocks([
      createMessage({
        id: 'user-1',
        role: 'user',
        seq: 1,
        parts: [createPart({ id: 'user-1:text', type: 'text', textValue: 'Search GPT-5.5 news', messageId: 'user-1' })]
      }),
      createMessage({
        id: 'assistant-1',
        role: 'assistant',
        runId: 'run-live',
        seq: 2,
        parts: [createPart({ id: 'assistant-1:text', type: 'text', textValue: 'First streamed segment.', messageId: 'assistant-1' })]
      }),
      createMessage({
        id: 'tool-1',
        role: 'tool',
        runId: 'run-live',
        seq: 3,
        parts: [
          createPart({
            id: 'tool-1:result',
            type: 'tool-result',
            messageId: 'tool-1',
            jsonValue: {
              toolName: 'searchWeb',
              toolCallId: 'call-1',
              details: {
                query: 'Claude latest news',
                resultCount: 2,
                sourceNames: ['Bloomberg'],
                sources: [{ sourceName: 'Bloomberg', hostname: 'bloomberg.com' }]
              }
            }
          })
        ]
      }),
      createMessage({
        id: 'assistant-2',
        role: 'assistant',
        runId: 'run-live',
        seq: 4,
        parts: [createPart({ id: 'assistant-2:text', type: 'text', textValue: 'Current live segment.', messageId: 'assistant-2' })]
      })
    ]);

    const filtered = filterTranscriptBlocksForLiveRun(blocks, 'run-live');

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.type).toBe('user-message');
  });
});
