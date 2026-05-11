import type { MessagePartDto } from '@agent-infra/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildPersistedThinkingTokens,
  buildPersistedThinkingTokensFromBlocks,
  buildThinkingFlowSections,
  isThinkingFlowSectionVisible,
  type ThinkingFlowToken
} from '@/features/durable-chat/service/thinking-flow';
import type { AssistantTurnItem, TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';

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

describe('thinking-flow helpers', () => {
  it('skips blank reasoning parts while preserving research and text token order', () => {
    const items: AssistantTurnItem[] = [
      {
        type: 'reasoning',
        id: 'reasoning-blank',
        part: createPart({ id: 'reasoning-blank-part', type: 'reasoning', textValue: '   ' })
      },
      {
        type: 'reasoning',
        id: 'reasoning-1',
        part: createPart({ id: 'reasoning-1-part', type: 'reasoning', textValue: '先分析问题。' })
      },
      {
        type: 'search-summary',
        id: 'summary-1',
        summary: {
          runId: 'run-1',
          entries: [
            {
              toolCallId: 'call-1',
              query: 'latest o3 news',
              resultCount: 4,
              sourceNames: ['The Verge'],
              sources: [{ sourceName: 'The Verge', hostname: 'theverge.com' }]
            }
          ]
        }
      },
      {
        type: 'text',
        id: 'text-1',
        cacheKey: 'text-1',
        part: createPart({ id: 'text-1-part', type: 'text', textValue: '最终答案。' })
      }
    ];

    expect(buildPersistedThinkingTokens(items, 'run-1')).toMatchObject([
      { kind: 'reasoning', id: 'reasoning-1', text: '先分析问题。' },
      { kind: 'persisted-research', id: 'summary-1', runId: 'run-1' },
      { kind: 'persisted-text', id: 'text-1' }
    ]);
  });

  it('builds trailing thinking sections and flattens tokens across assistant blocks', () => {
    const tokens: ThinkingFlowToken[] = [
      { kind: 'reasoning', id: 'reasoning-1', text: '先想想。' },
      {
        kind: 'persisted-research',
        id: 'summary-1',
        runId: 'run-1',
        item: {
          type: 'search-summary',
          id: 'summary-1',
          summary: {
            runId: 'run-1',
            entries: [
              {
                toolCallId: 'call-1',
                query: 'o3 latest',
                resultCount: 2,
                sourceNames: ['OpenAI'],
                sources: [{ sourceName: 'OpenAI', hostname: 'openai.com' }]
              }
            ]
          }
        }
      },
      {
        kind: 'persisted-text',
        id: 'text-1',
        part: {
          type: 'text',
          id: 'text-1',
          cacheKey: 'text-1',
          part: createPart({ id: 'text-1-part', type: 'text', textValue: '结论。' })
        }
      },
      { kind: 'reasoning', id: 'reasoning-2', text: '继续思考。' }
    ];

    expect(buildThinkingFlowSections(tokens, true)).toMatchObject([
      { type: 'thinking', id: 'thinking:reasoning-1', thinking: false },
      { type: 'content', id: 'content:text-1' },
      { type: 'thinking', id: 'thinking:reasoning-2', thinking: true }
    ]);

    const blocks: Array<Extract<TranscriptBlock, { type: 'assistant-turn' }>> = [
      {
        type: 'assistant-turn',
        id: 'block-1',
        runId: 'run-1',
        sourceMessages: [],
        items: [
          {
            type: 'reasoning',
            id: 'reasoning-a',
            part: createPart({ id: 'reasoning-a-part', type: 'reasoning', textValue: 'A' })
          }
        ]
      },
      {
        type: 'assistant-turn',
        id: 'block-2',
        runId: 'run-1',
        sourceMessages: [],
        items: [
          {
            type: 'text',
            id: 'text-b',
            cacheKey: 'text-b',
            part: createPart({ id: 'text-b-part', type: 'text', textValue: 'B' })
          }
        ]
      }
    ];

    expect(buildPersistedThinkingTokensFromBlocks(blocks).map((token) => token.id)).toEqual(['reasoning-a', 'text-b']);
  });

  it('hides research-only sections when they have no visible summary or status label', () => {
    const invisibleSection = buildThinkingFlowSections(
      [
        {
          kind: 'persisted-research',
          id: 'empty-summary',
          runId: 'run-1',
          item: {
            type: 'search-summary',
            id: 'empty-summary',
            summary: {
              runId: 'run-1',
              entries: []
            }
          }
        }
      ],
      false
    )[0];

    expect(invisibleSection).toBeDefined();
    expect(isThinkingFlowSectionVisible(invisibleSection!, false)).toBe(false);
  });
});
