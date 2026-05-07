import type { MessageDto, MessagePartDto } from '@agent-infra/contracts';
import type { LiveAssistantDraft } from '@agent-infra/durable-chat-client';
import { describe, expect, it } from 'vitest';

import { buildTranscriptPresentation } from './transcript-presentation';

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

function createLiveDraft(runId: string): LiveAssistantDraft {
  return {
    runId,
    messageId: `${runId}:assistant`,
    source: 'live',
    committedText: '',
    partialText: '',
    segmentText: '',
    segmentTextMessageId: null,
    partialReasoning: null,
    segmentReasoningMessageId: null,
    activeTools: [],
    eventType: 'streaming',
    segments: []
  };
}

describe('buildTranscriptPresentation', () => {
  it('upserts optimistic user messages into displayed messages', () => {
    const userMessage = createMessage({
      id: 'user-1',
      role: 'user',
      seq: 1,
      parts: [createPart({ id: 'user-1:text', type: 'text', messageId: 'user-1', textValue: 'hello' })]
    });
    const optimisticUserMessage = createMessage({
      id: 'user-2',
      role: 'user',
      seq: 2,
      metadata: { optimistic: true },
      parts: [createPart({ id: 'user-2:text', type: 'text', messageId: 'user-2', textValue: 'pending' })]
    });

    const presentation = buildTranscriptPresentation({
      messages: [userMessage],
      optimisticUserMessage,
      liveAssistantDraft: null
    });

    expect(presentation.displayedMessages.map((message) => message.id)).toEqual(['user-1', 'user-2']);
  });

  it('filters persisted transcript blocks for the active live run', () => {
    const persistedAssistant = createMessage({
      id: 'assistant-1',
      role: 'assistant',
      runId: 'run-live',
      seq: 1,
      parts: [createPart({ id: 'assistant-1:text', type: 'text', messageId: 'assistant-1', textValue: 'persisted' })]
    });
    const olderAssistant = createMessage({
      id: 'assistant-2',
      role: 'assistant',
      runId: 'run-old',
      seq: 2,
      parts: [createPart({ id: 'assistant-2:text', type: 'text', messageId: 'assistant-2', textValue: 'older' })]
    });

    const presentation = buildTranscriptPresentation({
      messages: [persistedAssistant, olderAssistant],
      optimisticUserMessage: null,
      liveAssistantDraft: createLiveDraft('run-live')
    });

    expect(presentation.displayedTranscriptBlocks.map((block) => block.id)).toEqual(['assistant-turn:run-old:2']);
  });
});
