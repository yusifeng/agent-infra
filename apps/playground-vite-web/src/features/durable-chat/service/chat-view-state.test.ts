import type { MessageDto, RunDto, RuntimePiMetaDto } from '@agent-infra/contracts';
import { describe, expect, it } from 'vitest';

import { buildChatViewState } from './chat-view-state';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';
import type { PlaygroundThreadDto } from '@/features/durable-chat/types/thread';

function createMessage(overrides: Partial<MessageDto> = {}): MessageDto {
  return {
    id: 'message-1',
    threadId: 'thread-1',
    runId: 'run-1',
    role: 'assistant',
    seq: 1,
    status: 'completed',
    createdAt: '2026-05-08T00:00:00.000Z',
    parts: [
      {
        id: 'part-1',
        messageId: 'message-1',
        partIndex: 0,
        type: 'text',
        textValue: 'hello',
        createdAt: '2026-05-08T00:00:00.000Z'
      }
    ],
    ...overrides
  };
}

function createThread(overrides: Partial<PlaygroundThreadDto> = {}): PlaygroundThreadDto {
  return {
    id: 'thread-1',
    appId: 'playground-vite-web',
    title: 'Thread title',
    status: 'active',
    pinned: false,
    pinnedAt: null,
    createdAt: '2026-05-08T00:00:00.000Z',
    updatedAt: '2026-05-08T00:00:00.000Z',
    ...overrides
  };
}

function createRun(overrides: Partial<RunDto> = {}): RunDto {
  return {
    id: 'run-1',
    threadId: 'thread-1',
    status: 'running',
    createdAt: '2026-05-08T00:00:00.000Z',
    ...overrides
  };
}

function createMeta(overrides: Partial<RuntimePiMetaDto> = {}): RuntimePiMetaDto {
  return {
    dbMode: 'sqlite',
    dbConnection: 'memory',
    runtimeConfigured: true,
    runtimeProvider: 'openai',
    runtimeModel: 'gpt-5.5',
    modelOptions: [
      {
        key: 'gpt-5.5',
        provider: 'openai',
        model: 'gpt-5.5',
        label: 'GPT-5.5',
        description: 'Primary model'
      }
    ],
    defaultModelKey: 'gpt-5.5',
    runtimeConfigError: null,
    ...overrides
  };
}

function createLiveDraft(overrides: Partial<LiveAssistantDraft> = {}): LiveAssistantDraft {
  return {
    runId: 'run-1',
    messageId: 'message-1',
    source: 'live',
    committedText: '',
    partialText: '',
    segmentText: '',
    segmentTextMessageId: null,
    partialReasoning: null,
    segmentReasoningMessageId: null,
    activeTools: [],
    eventType: 'streaming',
    segments: [],
    ...overrides
  };
}

describe('buildChatViewState', () => {
  it('derives the main chat view state from runtime inputs', () => {
    const result = buildChatViewState({
      threads: [createThread()],
      pinnedThreadIds: [],
      activeThreadId: 'thread-1',
      messages: [createMessage()],
      draft: 'hello',
      optimisticUserMessage: null,
      meta: createMeta(),
      selectedModelKey: 'gpt-5.5',
      activeResponseRun: null,
      chatPhase: 'idle',
      persistingTurn: false,
      loadingThreadId: null,
      messagePageInfo: { hasOlder: true, hasNewer: false, startCursor: 'start', endCursor: 'end' },
      liveAssistantDraft: null,
      pendingNewThreadLoadingId: '__pending__'
    });

    expect(result.activeThread?.id).toBe('thread-1');
    expect(result.displayedThreads).toHaveLength(1);
    expect(result.selectedModelOption?.key).toBe('gpt-5.5');
    expect(result.currentThreadTitle).toBe('Thread title');
    expect(result.isChatResponding).toBe(false);
    expect(result.sendDisabled).toBe(false);
    expect(result.inputLocked).toBe(false);
    expect(result.displayedMessages).toHaveLength(1);
    expect(result.displayedTranscriptBlocks).toHaveLength(1);
    expect(result.displayedAnswerContainers).toHaveLength(1);
    expect(result.hasOlderMessages).toBe(true);
  });

  it('disables send and locks input while the main chat is responding', () => {
    const optimisticUserMessage = createMessage({ id: 'optimistic-1', role: 'user' });

    const result = buildChatViewState({
      threads: [createThread()],
      pinnedThreadIds: [],
      activeThreadId: 'thread-1',
      messages: [],
      draft: 'hello',
      optimisticUserMessage,
      meta: createMeta(),
      selectedModelKey: 'gpt-5.5',
      activeResponseRun: createRun({ status: 'running' }),
      chatPhase: 'streaming',
      persistingTurn: false,
      loadingThreadId: null,
      messagePageInfo: null,
      liveAssistantDraft: createLiveDraft(),
      pendingNewThreadLoadingId: '__pending__'
    });

    expect(result.isChatResponding).toBe(true);
    expect(result.showResponseLoading).toBe(true);
    expect(result.sendDisabled).toBe(true);
    expect(result.inputLocked).toBe(true);
    expect(result.displayedMessages).toHaveLength(1);
    expect(result.displayedAnswerContainers).toHaveLength(0);
  });

  it('projects threads through the pinned-first sidebar ordering rules', () => {
    const result = buildChatViewState({
      threads: [
        createThread({ id: 'thread-1', updatedAt: '2026-05-09T00:00:01.000Z' }),
        createThread({ id: 'thread-2', updatedAt: '2026-05-09T00:00:03.000Z' }),
        createThread({ id: 'thread-3', updatedAt: '2026-05-09T00:00:02.000Z' })
      ],
      pinnedThreadIds: ['thread-3', 'thread-1'],
      activeThreadId: 'thread-1',
      messages: [],
      draft: '',
      optimisticUserMessage: null,
      meta: createMeta(),
      selectedModelKey: 'gpt-5.5',
      activeResponseRun: null,
      chatPhase: 'idle',
      persistingTurn: false,
      loadingThreadId: null,
      messagePageInfo: null,
      liveAssistantDraft: null,
      pendingNewThreadLoadingId: '__pending__'
    });

    expect(result.displayedThreads.map((thread) => thread.id)).toEqual(['thread-3', 'thread-1', 'thread-2']);
  });
});
