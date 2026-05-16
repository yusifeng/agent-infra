import type { MessagePartDto } from '@agent-infra/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildAnswerContainerContentSections,
  buildLiveAssistantContentSections,
  buildPersistedAssistantContentSections,
  hasVisiblePersistedAssistantContent
} from './assistant-message-presentation';
import type { AnswerContainerBlock } from '@/features/durable-chat/types/answer-containers';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';
import type { AssistantTurnItem } from '@/features/durable-chat/types/transcript-blocks';

function textPart(id: string, text: string, type: MessagePartDto['type'] = 'text'): MessagePartDto {
  return {
    id,
    messageId: 'message-1',
    partIndex: 0,
    type,
    textValue: text,
    jsonValue: null,
    createdAt: '2026-01-01T00:00:00.000Z'
  };
}

function textItem(id: string, text: string): Extract<AssistantTurnItem, { type: 'text' }> {
  return {
    type: 'text',
    id,
    part: textPart(`${id}:part`, text),
    cacheKey: `cache:${id}`
  };
}

function reasoningItem(id: string, text: string): Extract<AssistantTurnItem, { type: 'reasoning' }> {
  return {
    type: 'reasoning',
    id,
    part: textPart(`${id}:part`, text, 'reasoning')
  };
}

function assistantBlock(id: string, items: AssistantTurnItem[]): AnswerContainerBlock {
  return {
    type: 'assistant-turn',
    id,
    runId: 'run-1',
    sourceMessages: [],
    items
  };
}

function createLiveDraft(input: { text?: string; reasoning?: string }): LiveAssistantDraft {
  return {
    runId: 'run-1',
    messageId: 'assistant-live',
    source: 'live',
    committedText: '',
    partialText: input.text ?? '',
    segmentText: input.text ?? '',
    segmentTextMessageId: input.text ? 'assistant-live' : null,
    partialReasoning: input.reasoning ?? null,
    segmentReasoningMessageId: input.reasoning ? 'assistant-live' : null,
    activeTools: [],
    eventType: 'streaming',
    segments: [
      {
        id: 'assistant-live:0',
        messageId: 'assistant-live',
        text: input.text ?? '',
        reasoning: input.reasoning ?? null,
        tools: [],
        eventType: 'streaming'
      }
    ]
  };
}

describe('assistant message presentation', () => {
  it('builds persisted assistant sections from reasoning followed by text', () => {
    const sections = buildPersistedAssistantContentSections(
      [reasoningItem('reasoning-1', 'thinking'), textItem('text-1', 'answer')],
      'run-1',
      false
    );

    expect(sections.map((section) => section.type)).toEqual(['thinking', 'content']);
    expect(sections[0]?.id).toBe('thinking:reasoning-1');
    expect(sections[1]).toMatchObject({
      type: 'content',
      token: {
        kind: 'persisted-text',
        id: 'text-1'
      }
    });
    expect(hasVisiblePersistedAssistantContent([textItem('text-1', 'answer')], 'run-1', false)).toBe(true);
  });

  it('does not expose empty reasoning as visible persisted assistant content', () => {
    const items = [reasoningItem('reasoning-1', '   ')];

    expect(buildPersistedAssistantContentSections(items, 'run-1', false)).toEqual([]);
    expect(hasVisiblePersistedAssistantContent(items, 'run-1', false)).toBe(false);
  });

  it('builds answer-container sections across assistant blocks', () => {
    const sections = buildAnswerContainerContentSections(
      [
        assistantBlock('assistant-1', [textItem('text-1', 'first')]),
        assistantBlock('assistant-2', [reasoningItem('reasoning-1', 'thinking'), textItem('text-2', 'second')])
      ],
      false
    );

    expect(sections.map((section) => section.type)).toEqual(['content', 'thinking', 'content']);
  });

  it('builds live assistant sections from reasoning followed by text', () => {
    const sections = buildLiveAssistantContentSections(createLiveDraft({ reasoning: 'live thinking', text: 'live answer' }));

    expect(sections.map((section) => section.type)).toEqual(['thinking', 'content']);
    expect(sections[0]).toMatchObject({
      type: 'thinking',
      thinking: false
    });
  });

  it('keeps trailing live reasoning open while streaming', () => {
    const sections = buildLiveAssistantContentSections(createLiveDraft({ reasoning: 'live thinking' }));

    expect(sections).toEqual([
      expect.objectContaining({
        type: 'thinking',
        thinking: true
      })
    ]);
  });
});
