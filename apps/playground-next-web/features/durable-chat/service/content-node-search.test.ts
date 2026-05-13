import type { MessagePartDto } from '@agent-infra/contracts';
import { describe, expect, it } from 'vitest';

import { parseSearchLoadingEntry, parseSearchSummaryEntry } from '@/features/durable-chat/service/content-node-search';

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

describe('content-node-search', () => {
  it('parses search loading entries from searchWeb tool calls', () => {
    const entry = parseSearchLoadingEntry(
      createPart({
        id: 'tool-call-1',
        type: 'tool-call',
        jsonValue: {
          toolName: 'searchWeb',
          toolCallId: 'call-1',
          input: { query: 'Claude latest news' }
        }
      })
    );

    expect(entry).toEqual({
      toolCallId: 'call-1',
      query: 'Claude latest news'
    });
  });

  it('parses search summary entries and falls back to legacy memory urls for hostnames', () => {
    const entry = parseSearchSummaryEntry(
      createPart({
        id: 'tool-result-1',
        type: 'tool-result',
        jsonValue: {
          toolName: 'searchWeb',
          toolCallId: 'call-1',
          details: {
            query: 'Claude latest news',
            resultCount: 2,
            sourceNames: ['CNBC'],
            memory: {
              sources: [{ sourceName: 'CNBC', url: 'https://www.cnbc.com/claude-news' }]
            }
          }
        }
      })
    );

    expect(entry).toEqual({
      toolCallId: 'call-1',
      query: 'Claude latest news',
      resultCount: 2,
      sourceNames: ['CNBC'],
      sources: [{ sourceName: 'CNBC', hostname: 'cnbc.com' }]
    });
  });

  it('ignores non-search tool parts', () => {
    expect(
      parseSearchLoadingEntry(
        createPart({
          id: 'tool-call-1',
          type: 'tool-call',
          jsonValue: {
            toolName: 'getRuntimeInfo',
            toolCallId: 'call-1',
            input: {}
          }
        })
      )
    ).toBeNull();

    expect(
      parseSearchSummaryEntry(
        createPart({
          id: 'tool-result-1',
          type: 'tool-result',
          jsonValue: {
            toolName: 'getRuntimeInfo',
            toolCallId: 'call-1',
            details: { runtime: 'pi' }
          }
        })
      )
    ).toBeNull();
  });
});
