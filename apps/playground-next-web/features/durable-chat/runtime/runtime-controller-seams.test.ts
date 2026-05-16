import type { RunDto } from '@agent-infra/contracts';
import { describe, expect, it } from 'vitest';

import {
  resolveActiveRunAttachDecision,
  resolveInspectorLoadDecision,
  resolveThreadRouteDecision
} from './runtime-controller-seams';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';

function createRun(overrides: Partial<RunDto> = {}): RunDto {
  return {
    id: 'run-1',
    threadId: 'thread-1',
    triggerMessageId: null,
    provider: 'openai',
    model: 'gpt-4o-mini',
    status: 'running',
    usage: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function createLiveDraft(): LiveAssistantDraft {
  return {
    runId: 'run-1',
    messageId: 'assistant-live',
    source: 'restored',
    committedText: '',
    partialText: 'still visible',
    segmentText: 'still visible',
    segmentTextMessageId: 'assistant-live',
    partialReasoning: null,
    segmentReasoningMessageId: null,
    activeTools: [],
    eventType: 'streaming',
    segments: [
      {
        id: 'assistant-live:0',
        messageId: 'assistant-live',
        text: 'still visible',
        reasoning: null,
        tools: [],
        eventType: 'streaming'
      }
    ]
  };
}

describe('runtime controller seams', () => {
  it('attaches only when the active thread has an active run and no send or attach is already in flight', () => {
    expect(resolveActiveRunAttachDecision({
      activeThreadId: 'thread-1',
      activeResponseRun: createRun(),
      attachedRunId: null,
      sendInFlight: false
    })).toEqual({
      type: 'attach',
      threadId: 'thread-1',
      runId: 'run-1'
    });

    expect(resolveActiveRunAttachDecision({
      activeThreadId: 'thread-1',
      activeResponseRun: createRun(),
      attachedRunId: null,
      sendInFlight: true
    })).toEqual({ type: 'idle' });

    expect(resolveActiveRunAttachDecision({
      activeThreadId: 'thread-1',
      activeResponseRun: createRun(),
      attachedRunId: 'run-1',
      sendInFlight: false
    })).toEqual({ type: 'idle' });
  });

  it('aborts attach state when the run is stale, terminal, or missing active thread context', () => {
    expect(resolveActiveRunAttachDecision({
      activeThreadId: 'thread-2',
      activeResponseRun: createRun(),
      attachedRunId: 'run-1',
      sendInFlight: false
    })).toEqual({ type: 'abort' });

    expect(resolveActiveRunAttachDecision({
      activeThreadId: 'thread-1',
      activeResponseRun: createRun({ status: 'completed' }),
      attachedRunId: 'run-1',
      sendInFlight: false
    })).toEqual({ type: 'abort' });

    expect(resolveActiveRunAttachDecision({
      activeThreadId: null,
      activeResponseRun: createRun(),
      attachedRunId: 'run-1',
      sendInFlight: false
    })).toEqual({ type: 'abort' });
  });

  it('keeps an active thread route idle while visible optimistic or live content is still present', () => {
    expect(resolveThreadRouteDecision({
      activeThreadId: 'thread-1',
      chatPhase: 'streaming',
      initialThreadId: 'thread-1',
      liveAssistantDraft: createLiveDraft(),
      loadingThreadId: 'thread-1',
      optimisticUserMessage: null,
      runtimeBootstrapped: true
    })).toEqual({ type: 'idle' });

    expect(resolveThreadRouteDecision({
      activeThreadId: 'thread-1',
      chatPhase: 'idle',
      initialThreadId: 'thread-1',
      liveAssistantDraft: null,
      loadingThreadId: null,
      optimisticUserMessage: { id: 'optimistic-user' },
      runtimeBootstrapped: true
    })).toEqual({ type: 'idle' });
  });

  it('separates initial runtime bootstrap, thread activation, and reset-to-new decisions', () => {
    expect(resolveThreadRouteDecision({
      activeThreadId: null,
      chatPhase: 'idle',
      initialThreadId: 'thread-1',
      liveAssistantDraft: null,
      loadingThreadId: null,
      optimisticUserMessage: null,
      runtimeBootstrapped: false
    })).toEqual({ type: 'initialize' });

    expect(resolveThreadRouteDecision({
      activeThreadId: 'thread-2',
      chatPhase: 'idle',
      initialThreadId: 'thread-1',
      liveAssistantDraft: null,
      loadingThreadId: null,
      optimisticUserMessage: null,
      runtimeBootstrapped: true
    })).toEqual({
      type: 'activate-thread',
      threadId: 'thread-1'
    });

    expect(resolveThreadRouteDecision({
      activeThreadId: 'thread-1',
      chatPhase: 'idle',
      initialThreadId: null,
      liveAssistantDraft: null,
      loadingThreadId: null,
      optimisticUserMessage: null,
      runtimeBootstrapped: true
    })).toEqual({ type: 'reset-to-new' });
  });

  it('loads inspector only when the panel is open, a thread is active, and messages are not loading', () => {
    expect(resolveInspectorLoadDecision({
      activeThreadId: 'thread-1',
      loadingMessages: false,
      logOpen: true
    })).toEqual({
      type: 'load',
      threadId: 'thread-1'
    });

    expect(resolveInspectorLoadDecision({
      activeThreadId: 'thread-1',
      loadingMessages: true,
      logOpen: true
    })).toEqual({ type: 'idle' });

    expect(resolveInspectorLoadDecision({
      activeThreadId: 'thread-1',
      loadingMessages: false,
      logOpen: false
    })).toEqual({ type: 'reset' });
  });
});
