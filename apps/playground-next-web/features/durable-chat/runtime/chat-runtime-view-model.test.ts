import type { MessageDto, RuntimePiMetaDto, RunDto, RunTimelineResponseDto } from '@agent-infra/contracts';
import { describe, expect, it } from 'vitest';

import { buildChatRuntimeViewModel } from './chat-runtime-view-model';
import type { PlaygroundThreadDto } from '@/features/durable-chat/repo/chat-api';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';

const now = '2026-01-01T00:00:00.000Z';

function createThread(overrides: Partial<PlaygroundThreadDto> = {}): PlaygroundThreadDto {
  return {
    id: 'thread-1',
    appId: 'playground',
    title: 'Thread One',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    pinned: false,
    ...overrides
  };
}

function createRun(overrides: Partial<RunDto> = {}): RunDto {
  return {
    id: 'run-1',
    threadId: 'thread-1',
    triggerMessageId: null,
    provider: 'deepseek',
    model: 'deepseek-chat',
    status: 'completed',
    usage: null,
    error: null,
    startedAt: now,
    finishedAt: now,
    createdAt: now,
    ...overrides
  };
}

function createMessage(overrides: Partial<MessageDto> = {}): MessageDto {
  return {
    id: 'message-1',
    threadId: 'thread-1',
    runId: null,
    role: 'user',
    seq: 1,
    status: 'completed',
    metadata: null,
    createdAt: now,
    parts: [
      {
        id: 'part-1',
        messageId: 'message-1',
        partIndex: 0,
        type: 'text',
        textValue: 'hello',
        jsonValue: null,
        createdAt: now
      }
    ],
    ...overrides
  };
}

function createMeta(overrides: Partial<RuntimePiMetaDto> = {}): RuntimePiMetaDto {
  return {
    dbMode: 'sqlite',
    dbConnection: 'local',
    runtimeConfigured: true,
    runtimeProvider: 'deepseek',
    runtimeModel: 'deepseek-chat',
    defaultModelKey: 'deepseek-chat',
    modelOptions: [
      {
        key: 'deepseek-chat',
        provider: 'deepseek',
        model: 'deepseek-chat',
        label: 'DeepSeek',
        description: 'DeepSeek chat'
      },
      {
        key: 'openai-chat',
        provider: 'openai',
        model: 'gpt-4o-mini',
        label: 'OpenAI',
        description: 'OpenAI chat'
      }
    ],
    runtimeConfigError: null,
    ...overrides
  };
}

function createLiveDraft(): LiveAssistantDraft {
  return {
    runId: 'run-1',
    messageId: 'assistant-live',
    source: 'live',
    committedText: '',
    partialText: 'streamed answer',
    segmentText: 'streamed answer',
    segmentTextMessageId: 'assistant-live',
    partialReasoning: null,
    segmentReasoningMessageId: null,
    activeTools: [],
    eventType: 'streaming',
    segments: [
      {
        id: 'assistant-live:0',
        messageId: 'assistant-live',
        text: 'streamed answer',
        reasoning: null,
        tools: [],
        eventType: 'streaming'
      }
    ]
  };
}

function buildInput(overrides: Partial<Parameters<typeof buildChatRuntimeViewModel>[0]> = {}) {
  return {
    activeResponseRun: null,
    activeThreadId: 'thread-1',
    chatPhase: 'idle' as const,
    draft: 'hello',
    liveAssistantDraft: null,
    loadingThreadId: null,
    messagePageInfo: null,
    messages: [createMessage()],
    meta: createMeta(),
    optimisticUserMessage: null,
    pendingNavigationTitle: null,
    pendingNewThreadLoadingId: '__pending-new-thread__',
    persistingTurn: false,
    selectedModelKey: 'deepseek-chat',
    threads: [createThread()],
    timeline: null,
    ...overrides
  };
}

describe('chat runtime view model', () => {
  it('derives current thread, model, send, and transcript state without side effects', () => {
    const timeline: RunTimelineResponseDto = {
      run: createRun(),
      runEvents: [],
      toolInvocations: []
    };

    const viewModel = buildChatRuntimeViewModel(buildInput({
      messagePageInfo: {
        hasOlder: true,
        hasNewer: false,
        startCursor: 'cursor-start',
        endCursor: 'cursor-end'
      },
      threads: [createThread({ pinned: true })],
      timeline
    }));

    expect(viewModel.activeThread?.id).toBe('thread-1');
    expect(viewModel.currentThreadTitle).toBe('Thread One');
    expect(viewModel.currentThreadPinned).toBe(true);
    expect(viewModel.selectedModelOption?.key).toBe('deepseek-chat');
    expect(viewModel.selectedRun?.id).toBe('run-1');
    expect(viewModel.sendDisabled).toBe(false);
    expect(viewModel.hasOlderMessages).toBe(true);
    expect(viewModel.displayedMessages.map((message) => message.id)).toEqual(['message-1']);
    expect(viewModel.displayedTranscriptBlocks).toHaveLength(1);
  });

  it('uses pending navigation title while the active thread row has not hydrated', () => {
    const viewModel = buildChatRuntimeViewModel(buildInput({
      activeThreadId: 'thread-2',
      pendingNavigationTitle: {
        threadId: 'thread-2',
        title: 'Known Title'
      },
      threads: []
    }));

    expect(viewModel.activeThread).toBeNull();
    expect(viewModel.currentThreadTitle).toBe('Known Title');
  });

  it('marks the chat as responding and locks input for active streaming work', () => {
    const viewModel = buildChatRuntimeViewModel(buildInput({
      activeResponseRun: createRun({ status: 'running' }),
      chatPhase: 'streaming',
      liveAssistantDraft: createLiveDraft(),
      loadingThreadId: 'thread-1',
      persistingTurn: true
    }));

    expect(viewModel.responseStatus).toBe('in_progress');
    expect(viewModel.isChatResponding).toBe(true);
    expect(viewModel.showResponseLoading).toBe(true);
    expect(viewModel.inputLocked).toBe(true);
    expect(viewModel.sendDisabled).toBe(true);
    expect(viewModel.liveAssistantActionsAvailable).toBe(false);
  });

  it('keeps live assistant actions available after transcript final while persisting continues', () => {
    const viewModel = buildChatRuntimeViewModel(buildInput({
      chatPhase: 'transcript-final',
      liveAssistantDraft: createLiveDraft(),
      persistingTurn: true
    }));

    expect(viewModel.responseStatus).toBe('idle');
    expect(viewModel.isChatResponding).toBe(false);
    expect(viewModel.liveAssistantActionsAvailable).toBe(true);
  });

  it('includes optimistic user messages in the displayed transcript projection', () => {
    const viewModel = buildChatRuntimeViewModel(buildInput({
      optimisticUserMessage: createMessage({
        id: 'optimistic-user',
        seq: 2
      })
    }));

    expect(viewModel.displayedMessages.map((message) => message.id)).toEqual(['message-1', 'optimistic-user']);
    expect(viewModel.displayedTranscriptBlocks).toHaveLength(2);
  });
});
