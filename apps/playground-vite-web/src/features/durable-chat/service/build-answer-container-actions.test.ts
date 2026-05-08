import { describe, expect, it } from 'vitest';

import { buildAnswerContainerActionContexts } from '@/features/durable-chat/service/build-answer-container-actions';
import type { AnswerContainer, AnswerContainerBlock } from '@/features/durable-chat/types/answer-containers';
import type { AssistantTurnItem } from '@/features/durable-chat/types/transcript-blocks';

function textItem(id: string, textValue: string): AssistantTurnItem {
  return {
    type: 'text',
    id,
    cacheKey: `${id}:cache`,
    part: {
      id: `${id}:part`,
      messageId: `${id}:message`,
      partIndex: 0,
      type: 'text',
      textValue,
      jsonValue: null,
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  };
}

function reasoningItem(id: string, textValue: string): AssistantTurnItem {
  return {
    type: 'reasoning',
    id,
    part: {
      id: `${id}:part`,
      messageId: `${id}:message`,
      partIndex: 0,
      type: 'reasoning',
      textValue,
      jsonValue: null,
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  };
}

function searchSummaryItem(id: string): AssistantTurnItem {
  return {
    type: 'search-summary',
    id,
    summary: {
      runId: 'run-1',
      entries: [
        {
          toolCallId: 'tool-1',
          query: 'latest deepseek news',
          resultCount: 10,
          sourceNames: ['WSJ'],
          sources: [{ sourceName: 'WSJ', hostname: 'wsj.com' }]
        }
      ]
    }
  };
}

function toolPartItem(id: string): AssistantTurnItem {
  return {
    type: 'tool-part',
    id,
    part: {
      id: `${id}:part`,
      messageId: `${id}:message`,
      partIndex: 0,
      type: 'tool-call',
      textValue: null,
      jsonValue: { toolName: 'getRuntimeInfo' },
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  };
}

function assistantTurnBlock(id: string, items: AssistantTurnItem[]): AnswerContainerBlock {
  return {
    type: 'assistant-turn',
    id,
    runId: 'run-1',
    sourceMessages: [],
    items
  };
}

function createContainer(blocks: AnswerContainerBlock[]): AnswerContainer {
  return {
    id: 'container-1',
    kind: 'assistant-answer',
    runId: 'run-1',
    transcriptBlockIds: blocks.map((block) => block.id),
    blocks,
    actionHostId: 'host-1'
  };
}

describe('buildAnswerContainerActionContexts', () => {
  it('collects copyable text and reasoning parts across all blocks in the container', () => {
    const container = createContainer([
      assistantTurnBlock('assistant-1', [textItem('text-1', 'text1'), searchSummaryItem('summary-1')]),
      assistantTurnBlock('assistant-2', [reasoningItem('reasoning-1', 'reasoning1'), textItem('text-2', 'text2')])
    ]);

    const context = buildAnswerContainerActionContexts([container]).get('host-1');

    expect(context?.copyableTextParts.map((part) => part.textValue)).toEqual(['text1', 'text2']);
    expect(context?.copyableReasoningParts.map((part) => part.textValue)).toEqual(['reasoning1']);
    expect(context?.hasVisibleOperation).toBe(true);
  });

  it('marks search and tool payload scope when those items are present', () => {
    const container = createContainer([assistantTurnBlock('assistant-1', [textItem('text-1', 'text1'), searchSummaryItem('summary-1'), toolPartItem('tool-1')])]);

    const context = buildAnswerContainerActionContexts([container]).get('host-1');

    expect(context?.payloadScope).toEqual({
      text: true,
      reasoning: false,
      search: true,
      tool: true
    });
  });

  it('hides operations for a search-only container', () => {
    const container = createContainer([assistantTurnBlock('assistant-1', [searchSummaryItem('summary-1')])]);

    const context = buildAnswerContainerActionContexts([container]).get('host-1');

    expect(context?.copyableTextParts).toEqual([]);
    expect(context?.copyableReasoningParts).toEqual([]);
    expect(context?.hasVisibleOperation).toBe(false);
  });
});
