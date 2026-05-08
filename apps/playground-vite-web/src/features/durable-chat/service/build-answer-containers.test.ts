import { describe, expect, it } from 'vitest';

import { buildAnswerContainers } from '@/features/durable-chat/service/build-answer-containers';
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

function assistantTurnBlock(id: string, runId: string | null, items: AssistantTurnItem[]): TranscriptBlock {
  return {
    type: 'assistant-turn',
    id,
    runId,
    sourceMessages: [],
    items
  };
}

function userBlock(id: string): TranscriptBlock {
  return {
    type: 'user-message',
    id,
    message: {
      id: `${id}:message`,
      threadId: 'thread-1',
      runId: null,
      role: 'user',
      seq: 1,
      status: 'completed',
      metadata: null,
      parts: [],
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  };
}

describe('buildAnswerContainers', () => {
  it('creates a single container for a single assistant transcript block', () => {
    const containers = buildAnswerContainers([assistantTurnBlock('assistant-1', 'run-1', [textItem('text-1', 'hello')])]);

    expect(containers).toHaveLength(1);
    expect(containers[0]).toMatchObject({
      runId: 'run-1',
      transcriptBlockIds: ['assistant-1']
    });
  });

  it('groups contiguous assistant transcript blocks from the same run into one container', () => {
    const containers = buildAnswerContainers([
      assistantTurnBlock('assistant-1', 'run-1', [textItem('text-1', 'first')]),
      assistantTurnBlock('assistant-2', 'run-1', [textItem('text-2', 'second')])
    ]);

    expect(containers).toHaveLength(1);
    expect(containers[0]?.transcriptBlockIds).toEqual(['assistant-1', 'assistant-2']);
  });

  it('breaks containers when a user block appears between assistant transcript blocks', () => {
    const containers = buildAnswerContainers([
      assistantTurnBlock('assistant-1', 'run-1', [textItem('text-1', 'first')]),
      userBlock('user-1'),
      assistantTurnBlock('assistant-2', 'run-1', [textItem('text-2', 'second')])
    ]);

    expect(containers).toHaveLength(2);
    expect(containers[0]?.transcriptBlockIds).toEqual(['assistant-1']);
    expect(containers[1]?.transcriptBlockIds).toEqual(['assistant-2']);
  });

  it('does not merge legacy assistant transcript blocks without a run id', () => {
    const containers = buildAnswerContainers([
      assistantTurnBlock('assistant-1', null, [textItem('text-1', 'legacy first')]),
      assistantTurnBlock('assistant-2', null, [textItem('text-2', 'legacy second')])
    ]);

    expect(containers).toHaveLength(2);
    expect(containers[0]?.transcriptBlockIds).toEqual(['assistant-1']);
    expect(containers[1]?.transcriptBlockIds).toEqual(['assistant-2']);
  });
});
