import type { RunDto } from '@agent-infra/contracts';
import { describe, expect, it } from 'vitest';

import {
  selectPrimaryActiveResponseRun,
  selectPrimaryLiveAssistantDraft
} from './use-chat-session-controller';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';
import type { ChatSessionState } from '@/features/durable-chat/types/state';

function createRun(id: string): RunDto {
  return {
    id,
    threadId: 'thread-1',
    triggerMessageId: 'message-user',
    provider: 'openai',
    model: 'gpt-4o-mini',
    status: 'running',
    usage: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z'
  };
}

function createDraft(runId: string): LiveAssistantDraft {
  return {
    runId,
    messageId: `assistant-${runId}`,
    source: 'restored',
    committedText: '',
    partialText: runId,
    segmentText: runId,
    segmentTextMessageId: `assistant-${runId}`,
    partialReasoning: null,
    segmentReasoningMessageId: null,
    activeTools: [],
    eventType: 'streaming',
    segments: [
      {
        id: `assistant-${runId}:0`,
        messageId: `assistant-${runId}`,
        text: runId,
        reasoning: null,
        tools: [],
        eventType: 'streaming'
      }
    ]
  };
}

function createState(overrides: Partial<ChatSessionState>): ChatSessionState {
  return {
    threads: [],
    activeThreadId: 'thread-1',
    messages: [],
    draft: '',
    optimisticUserMessage: null,
    meta: null,
    selectedModelKey: '',
    selectedWebSearchEnabled: false,
    selectedThinkingEnabled: false,
    selectedReasoningEffort: 'high',
    chatPhase: 'streaming',
    persistingTurn: false,
    loadingThreadId: 'thread-1',
    loadingMessages: false,
    historyLoading: false,
    error: null,
    liveStreamRunId: null,
    liveStreamRunIds: [],
    liveAssistantDraft: null,
    liveAssistantDraftsByRunId: {},
    messagePageInfo: null,
    activeResponseRun: null,
    activeResponseRuns: [],
    durableRecoveryState: {
      phase: 'idle',
      message: null
    },
    sidebarOpen: true,
    showScrollToBottom: false,
    ...overrides
  };
}

describe('selectPrimaryLiveAssistantDraft', () => {
  it('selects the draft aligned with the current live stream instead of object insertion order', () => {
    const runA = createRun('run-a');
    const runB = createRun('run-b');
    const draftA = createDraft('run-a');
    const draftB = createDraft('run-b');

    expect(selectPrimaryLiveAssistantDraft(
      createState({
        liveStreamRunId: 'run-b',
        liveStreamRunIds: ['run-b', 'run-a'],
        activeResponseRun: runB,
        activeResponseRuns: [runB, runA]
      }),
      {
        'run-a': draftA,
        'run-b': draftB
      }
    )).toBe(draftB);
  });
});

describe('selectPrimaryActiveResponseRun', () => {
  it('preserves the explicit active run when it is still present in the active run list', () => {
    const runA = createRun('run-a');
    const runB = createRun('run-b');

    expect(selectPrimaryActiveResponseRun(
      createState({
        activeResponseRun: runB,
        activeResponseRuns: [runA, runB]
      }),
      [runA, runB]
    )).toBe(runB);
  });
});
