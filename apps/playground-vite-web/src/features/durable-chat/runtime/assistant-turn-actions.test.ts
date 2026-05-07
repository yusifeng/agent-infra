import { describe, expect, it } from 'vitest';

import { buildAssistantTurnActionContexts, collectAssistantTurnCopyText } from '@/features/durable-chat/runtime/assistant-turn-actions';
import type { AssistantTurnItem, TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';

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

function assistantTurnBlock(id: string, runId: string | null, items: AssistantTurnItem[]): TranscriptBlock {
  return {
    type: 'assistant-turn',
    id,
    runId,
    sourceMessages: [],
    items
  };
}

describe('assistant turn action helpers', () => {
  it('collects all copyable assistant content inside a single block', () => {
    expect(collectAssistantTurnCopyText([textItem('text-1', 'text1'), searchSummaryItem('summary-1'), textItem('text-2', 'text2')])).toBe(
      'text1\n\ntext2'
    );
  });

  it('shows actions for blocks that contain copyable text even if search labels appear in the middle', () => {
    const blocks: TranscriptBlock[] = [
      assistantTurnBlock('assistant-1', 'run-1', [textItem('text-1', 'text1'), searchSummaryItem('summary-1'), textItem('text-2', 'text2')])
    ];

    const contexts = buildAssistantTurnActionContexts(blocks);

    expect(contexts.get('assistant-1')).toEqual({
      copyText: 'text1\n\ntext2',
      showActions: true
    });
  });

  it('hides actions for search-only assistant blocks', () => {
    const blocks: TranscriptBlock[] = [assistantTurnBlock('assistant-1', 'run-1', [searchSummaryItem('summary-1')])];

    const contexts = buildAssistantTurnActionContexts(blocks);

    expect(contexts.get('assistant-1')).toEqual({
      copyText: '',
      showActions: false
    });
  });

  it('preserves actions for assistant turns without run IDs', () => {
    const blocks: TranscriptBlock[] = [assistantTurnBlock('assistant-1', null, [textItem('text-1', 'legacy text')])];

    const contexts = buildAssistantTurnActionContexts(blocks);

    expect(contexts.get('assistant-1')).toEqual({
      copyText: 'legacy text',
      showActions: true
    });
  });
});
