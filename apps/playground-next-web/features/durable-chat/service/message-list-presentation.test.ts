import type { MessageDto } from '@agent-infra/contracts';
import { describe, expect, it } from 'vitest';

import { buildMessageListRenderPlan, buildTranscriptRenderItems } from './message-list-presentation';
import type { AnswerContainer } from '@/features/durable-chat/types/answer-containers';
import type { DurableRecoveryState } from '@/features/durable-chat/types/runtime';
import type { TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';

function createMessage(id: string, threadId = 'thread-1'): MessageDto {
  return {
    id,
    threadId,
    runId: null,
    role: 'user',
    seq: 1,
    status: 'completed',
    metadata: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    parts: []
  };
}

function createUserBlock(id: string, threadId = 'thread-1'): Extract<TranscriptBlock, { type: 'user-message' }> {
  return {
    type: 'user-message',
    id,
    message: createMessage(`${id}:message`, threadId)
  };
}

function createAssistantBlock(id: string, runId = 'run-1'): Extract<TranscriptBlock, { type: 'assistant-turn' }> {
  return {
    type: 'assistant-turn',
    id,
    runId,
    items: [],
    sourceMessages: []
  };
}

function createAnswerContainer(id: string, transcriptBlockIds: string[]): AnswerContainer {
  return {
    id,
    actionHostId: transcriptBlockIds[0] ?? id,
    kind: 'assistant-answer',
    runId: 'run-1',
    transcriptBlockIds,
    blocks: transcriptBlockIds.map((blockId) => createAssistantBlock(blockId))
  };
}

function createAnswerContainerForRun(id: string, runId: string, transcriptBlockIds: string[]): AnswerContainer {
  return {
    ...createAnswerContainer(id, transcriptBlockIds),
    runId,
    blocks: transcriptBlockIds.map((blockId) => createAssistantBlock(blockId, runId))
  };
}

const idleRecovery: DurableRecoveryState = {
  phase: 'idle',
  message: null
};

describe('message list presentation', () => {
  it('uses a silent placeholder while a thread is loading with no visible active-thread messages', () => {
    const plan = buildMessageListRenderPlan({
      activeThreadId: 'thread-1',
      answerContainers: [],
      durableRecoveryState: idleRecovery,
      liveAssistantDraft: null,
      loadingMessages: true,
      messages: [createMessage('message-other', 'thread-2')],
      meta: null,
      showLoadingText: false,
      transcriptBlocks: []
    });

    expect(plan.showSilentThreadLoadingPlaceholder).toBe(true);
    expect(plan.showEmptyState).toBe(false);
    expect(plan.showTranscriptContent).toBe(false);
  });

  it('renders the empty state only when there are no messages, transcript blocks, or live assistant draft', () => {
    const plan = buildMessageListRenderPlan({
      activeThreadId: 'thread-1',
      answerContainers: [],
      durableRecoveryState: idleRecovery,
      liveAssistantDraft: null,
      loadingMessages: false,
      messages: [],
      meta: null,
      showLoadingText: true,
      transcriptBlocks: []
    });

    expect(plan.showEmptyState).toBe(true);
    expect(plan.showEmptyThinkingIndicator).toBe(true);
    expect(plan.showTranscriptContent).toBe(false);
  });

  it('renders live assistant and trailing thinking only in transcript content mode', () => {
    const plan = buildMessageListRenderPlan({
      activeThreadId: 'thread-1',
      answerContainers: [],
      durableRecoveryState: idleRecovery,
      liveAssistantDraft: {
        runId: 'run-1',
        messageId: 'assistant-live',
        source: 'live',
        committedText: '',
        partialText: 'hello',
        segmentText: 'hello',
        segmentTextMessageId: 'assistant-live',
        partialReasoning: null,
        segmentReasoningMessageId: null,
        activeTools: [],
        eventType: 'streaming',
        segments: []
      },
      loadingMessages: false,
      messages: [createMessage('message-1')],
      meta: null,
      showLoadingText: true,
      transcriptBlocks: [createUserBlock('user-block-1')]
    });

    expect(plan.showTranscriptContent).toBe(true);
    expect(plan.showLiveAssistant).toBe(true);
    expect(plan.showTrailingThinkingIndicator).toBe(true);
  });

  it('folds answer-container child blocks into a single render item at the first block', () => {
    const firstAssistant = createAssistantBlock('assistant-block-1');
    const secondAssistant = createAssistantBlock('assistant-block-2');
    const userBlock = createUserBlock('user-block-1');
    const container = createAnswerContainer('answer-container-1', [firstAssistant.id, secondAssistant.id]);

    const items = buildTranscriptRenderItems({
      answerContainers: [container],
      transcriptBlocks: [userBlock, firstAssistant, secondAssistant]
    });

    expect(items).toEqual([
      {
        type: 'transcript-block',
        key: userBlock.id,
        block: userBlock
      },
      {
        type: 'answer-container',
        key: firstAssistant.id,
        container
      }
    ]);
  });

  it('renders a candidate group after its user message and suppresses grouped answer containers', () => {
    const userBlock = createUserBlock('user-block-1');
    const runABlock = createAssistantBlock('assistant-a', 'run-a');
    const runBBlock = createAssistantBlock('assistant-b', 'run-b');
    const runAContainer = createAnswerContainerForRun('container-a', 'run-a', [runABlock.id]);
    const runBContainer = createAnswerContainerForRun('container-b', 'run-b', [runBBlock.id]);

    const items = buildTranscriptRenderItems({
      answerContainers: [runAContainer, runBContainer],
      answerCandidateGroups: [
        {
          id: 'group-1',
          threadId: 'thread-1',
          triggerMessageId: userBlock.message.id,
          selection: null,
          candidates: [
            {
              id: 'candidate-a',
              candidate: {
                id: 'candidate-a',
                threadId: 'thread-1',
                triggerMessageId: userBlock.message.id,
                runId: 'run-a',
                ordinal: 0,
                kind: 'primary',
                createdAt: '2026-01-01T00:00:00.000Z'
              },
              answerContainer: runAContainer,
              liveAssistantDraft: null,
              run: null,
              status: 'completed',
              selected: true,
              isDefault: true,
              feedback: null
            },
            {
              id: 'candidate-b',
              candidate: {
                id: 'candidate-b',
                threadId: 'thread-1',
                triggerMessageId: userBlock.message.id,
                runId: 'run-b',
                ordinal: 1,
                kind: 'alternative',
                createdAt: '2026-01-01T00:00:00.000Z'
              },
              answerContainer: runBContainer,
              liveAssistantDraft: null,
              run: null,
              status: 'completed',
              selected: false,
              isDefault: false,
              feedback: null
            }
          ]
        }
      ],
      transcriptBlocks: [userBlock, runABlock, runBBlock]
    });

    expect(items.map((item) => item.type)).toEqual(['transcript-block', 'answer-candidate-group']);
  });

  it('exposes runtime warning and recovery notice decisions without UI details', () => {
    const plan = buildMessageListRenderPlan({
      activeThreadId: 'thread-1',
      answerContainers: [],
      durableRecoveryState: {
        phase: 'recovering',
        message: 'Recovering stream'
      },
      liveAssistantDraft: null,
      loadingMessages: false,
      messages: [],
      meta: {
        dbMode: 'sqlite',
        dbConnection: 'local',
        runtimeConfigured: false,
        runtimeProvider: 'deepseek',
        runtimeModel: 'deepseek-chat',
        modelOptions: [],
        defaultModelKey: null,
        runtimeConfigError: 'Missing key'
      },
      showLoadingText: false,
      transcriptBlocks: []
    });

    expect(plan.hasRuntimeWarning).toBe(true);
    expect(plan.runtimeWarningMessage).toBe('Missing key');
    expect(plan.hasRecoveryNotice).toBe(true);
    expect(plan.recoveryNoticeMessage).toBe('Recovering stream');
  });
});
