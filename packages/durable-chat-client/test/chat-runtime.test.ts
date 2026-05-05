import type { MessageDto, RunDto, RunStreamEventDto } from '@agent-infra/contracts';
import { describe, expect, it } from 'vitest';

import {
  attachMessageRenderKey,
  applyRunStateToTimeline,
  buildAssistantMessageFromSnapshot,
  buildOptimisticUserMessage,
  chooseInitialRunId,
  deriveDurableResponseStatus,
  deriveMainChatResponseStatus,
  getMessageRenderKey,
  getChatPhaseForAssistantSnapshot,
  mergeMessageWindow,
  mergeThreadMessagesPageInfo,
  normalizeRuntimeMeta,
  parseSseChunk,
  resolvePostReconcileChatPhase,
  resolveSettledChatPhase,
  shouldShowMainChatLoading,
  upsertMessage
} from '../src/service/chat-runtime';

function createRun(id: string, createdAt: string): RunDto {
  return {
    id,
    threadId: 'thread-1',
    triggerMessageId: null,
    provider: 'openai',
    model: 'gpt-4o-mini',
    status: 'queued',
    usage: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt
  };
}

function createMessage(id: string, seq: number, runId: string | null): MessageDto {
  return {
    id,
    threadId: 'thread-1',
    runId,
    role: 'assistant',
    seq,
    status: 'completed',
    metadata: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    parts: []
  };
}

describe('durable-chat-client service', () => {
  it('normalizeRuntimeMeta fills defaults from model options', () => {
    const meta = normalizeRuntimeMeta({
      modelOptions: [
        {
          key: 'openai:gpt-4o-mini',
          provider: 'openai',
          model: 'gpt-4o-mini',
          label: 'OpenAI',
          description: 'default'
        }
      ]
    });

    expect(meta.runtimeConfigured).toBe(false);
    expect(meta.runtimeProvider).toBe('openai');
    expect(meta.runtimeModel).toBe('gpt-4o-mini');
    expect(meta.defaultModelKey).toBe('openai:gpt-4o-mini');
  });

  it('chooseInitialRunId prefers explicit run, then latest run record, then latest message run', () => {
    const messages = [createMessage('message-1', 1, 'run-from-message')];
    const runs = [createRun('run-latest', '2026-01-03T00:00:00.000Z')];

    expect(chooseInitialRunId(messages, runs, 'run-latest')).toBe('run-latest');
    expect(chooseInitialRunId(messages, runs, 'missing')).toBe('run-latest');
    expect(chooseInitialRunId(messages, [], null)).toBe('run-from-message');
  });

  it('derives durable and main chat response status from active runs and local phases', () => {
    expect(deriveDurableResponseStatus(null)).toBe('idle');
    expect(deriveDurableResponseStatus({ ...createRun('run-1', '2026-01-01T00:00:00.000Z'), status: 'running' })).toBe('in_progress');

    expect(
      deriveMainChatResponseStatus({
        activeResponseRun: { ...createRun('run-2', '2026-01-02T00:00:00.000Z'), status: 'running' },
        activeThreadId: 'thread-1',
        loadingThreadId: null,
        chatPhase: 'idle',
        persistingTurn: false,
        pendingNewThreadLoadingId: '__pending__'
      })
    ).toBe('in_progress');

    expect(
      deriveMainChatResponseStatus({
        activeResponseRun: null,
        activeThreadId: null,
        loadingThreadId: '__pending__',
        chatPhase: 'thinking',
        persistingTurn: false,
        pendingNewThreadLoadingId: '__pending__'
      })
    ).toBe('queued');

    expect(
      shouldShowMainChatLoading(
        deriveMainChatResponseStatus({
          activeResponseRun: null,
          activeThreadId: 'thread-1',
          loadingThreadId: 'thread-1',
          chatPhase: 'transcript-final',
          persistingTurn: true,
          pendingNewThreadLoadingId: '__pending__'
        })
      )
    ).toBe(false);

    expect(
      shouldShowMainChatLoading(
        deriveMainChatResponseStatus({
          activeResponseRun: null,
          activeThreadId: 'thread-1',
          loadingThreadId: 'thread-1',
          chatPhase: 'streaming',
          persistingTurn: false,
          pendingNewThreadLoadingId: '__pending__'
        })
      )
    ).toBe(true);
  });

  it('upsertMessage inserts by sequence and replaces by id', () => {
    const original = [createMessage('message-2', 2, null)];
    const inserted = upsertMessage(original, createMessage('message-1', 1, null));
    expect(inserted.map((message) => message.id)).toEqual(['message-1', 'message-2']);

    const replaced = upsertMessage(inserted, {
      ...createMessage('message-1', 1, null),
      metadata: { replaced: true }
    });
    expect(replaced[0]?.metadata).toEqual({ replaced: true });
  });

  it('preserves the client render key and object identity for equivalent message updates', () => {
    const current = attachMessageRenderKey(createMessage('message-1', 1, null), 'optimistic-user-1');
    const updated = upsertMessage([current], createMessage('message-1', 1, null));

    expect(updated[0]).toBe(current);
    expect(getMessageRenderKey(updated[0] as MessageDto)).toBe('optimistic-user-1');
  });

  it('merges durable message windows and keeps sequence order', () => {
    const merged = mergeMessageWindow(
      [createMessage('message-2', 2, null), createMessage('message-3', 3, null)],
      [createMessage('message-1', 1, null), createMessage('message-3', 3, 'run-1')]
    );

    expect(merged.map((message) => message.id)).toEqual(['message-1', 'message-2', 'message-3']);
    expect(merged[2]?.runId).toBe('run-1');
  });

  it('merges page info differently for prepend and append windows', () => {
    const currentPageInfo = {
      hasOlder: true,
      hasNewer: false,
      startCursor: 'cursor-4',
      endCursor: 'cursor-7'
    };

    expect(
      mergeThreadMessagesPageInfo(
        currentPageInfo,
        {
          hasOlder: false,
          hasNewer: true,
          startCursor: 'cursor-1',
          endCursor: 'cursor-3'
        },
        'prepend'
      )
    ).toEqual({
      hasOlder: false,
      hasNewer: false,
      startCursor: 'cursor-1',
      endCursor: 'cursor-7'
    });

    expect(
      mergeThreadMessagesPageInfo(
        currentPageInfo,
        {
          hasOlder: true,
          hasNewer: false,
          startCursor: 'cursor-8',
          endCursor: 'cursor-9'
        },
        'append'
      )
    ).toEqual({
      hasOlder: true,
      hasNewer: false,
      startCursor: 'cursor-4',
      endCursor: 'cursor-9'
    });

    expect(
      mergeThreadMessagesPageInfo(
        currentPageInfo,
        {
          hasOlder: true,
          hasNewer: false,
          startCursor: null,
          endCursor: null
        },
        'append'
      )
    ).toEqual(currentPageInfo);
  });

  it('buildAssistantMessageFromSnapshot creates reasoning and text parts in order', () => {
    const message = buildAssistantMessageFromSnapshot(
      [createMessage('message-1', 1, null)],
      'thread-1',
      'run-1',
      {
        messageId: 'assistant-1',
        eventType: 'text_end',
        partialText: 'final answer',
        partialReasoning: 'work'
      }
    );

    expect(message.seq).toBe(2);
    expect(message.parts).toHaveLength(2);
    expect(message.parts[0]?.type).toBe('reasoning');
    expect(message.parts[1]?.type).toBe('text');
  });

  it('buildOptimisticUserMessage appends a user draft with optimistic metadata', () => {
    const message = buildOptimisticUserMessage('thread-1', 3, 'hello', [createMessage('message-1', 1, null)]);

    expect(message.id).toBe('optimistic-user-3');
    expect(message.seq).toBe(2);
    expect(message.metadata).toEqual({ optimistic: true, clientRenderKey: 'optimistic-user-3' });
    expect(getMessageRenderKey(message)).toBe('optimistic-user-3');
    expect(message.parts[0]?.textValue).toBe('hello');
  });

  it('applyRunStateToTimeline keeps prior events and tool invocations across state updates', () => {
    const readyEvent: Extract<RunStreamEventDto, { type: 'run.ready' }> = {
      type: 'run.ready',
      runId: 'run-1',
      run: createRun('run-1', '2026-01-01T00:00:00.000Z'),
      userMessage: createMessage('message-1', 1, null)
    };

    const readyTimeline = applyRunStateToTimeline(null, readyEvent);
    const stateEvent: Extract<RunStreamEventDto, { type: 'run.state' }> = {
      type: 'run.state',
      runId: 'run-1',
      run: { ...createRun('run-1', '2026-01-01T00:00:00.000Z'), status: 'running' }
    };

    const nextTimeline = applyRunStateToTimeline(
      {
        ...readyTimeline,
        runEvents: [
          {
            id: 'event-1',
            threadId: 'thread-1',
            runId: 'run-1',
            seq: 1,
            type: 'agent_start',
            payload: null,
            createdAt: '2026-01-01T00:00:00.000Z'
          }
        ],
        toolInvocations: [
          {
            id: 'tool-1',
            threadId: 'thread-1',
            runId: 'run-1',
            messageId: 'message-1',
            toolName: 'search',
            toolCallId: 'call-1',
            status: 'running',
            input: null,
            output: null,
            error: null,
            startedAt: null,
            finishedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z'
          }
        ]
      },
      stateEvent
    );

    expect(nextTimeline.run?.status).toBe('running');
    expect(nextTimeline.runEvents).toHaveLength(1);
    expect(nextTimeline.toolInvocations).toHaveLength(1);
  });

  it('parseSseChunk returns matching events and preserves incomplete remainder', () => {
    const buffer = [
      'event: run.completed',
      'data: {"type":"run.completed","runId":"run-1","run":{"id":"run-1","threadId":"thread-1","triggerMessageId":null,"provider":"openai","model":"gpt-4o-mini","status":"completed","usage":null,"error":null,"startedAt":null,"finishedAt":null,"createdAt":"2026-01-01T00:00:00.000Z"}}',
      '',
      'event: run.failed',
      'data: {"type":"run.failed"'
    ].join('\n');

    const parsed = parseSseChunk(buffer);

    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]?.type).toBe('run.completed');
    expect(parsed.remainder).toMatch(/run\.failed/);
  });

  it('resolves chat phases for live assistant and completion transitions', () => {
    expect(
      getChatPhaseForAssistantSnapshot({
        messageId: 'assistant-1',
        eventType: 'start',
        partialText: '',
        partialReasoning: null
      })
    ).toBe('thinking');

    expect(
      getChatPhaseForAssistantSnapshot({
        messageId: 'assistant-1',
        eventType: 'text_delta',
        partialText: 'hello',
        partialReasoning: null
      })
    ).toBe('streaming');

    expect(
      getChatPhaseForAssistantSnapshot({
        messageId: 'assistant-1',
        eventType: 'text_end',
        partialText: 'done',
        partialReasoning: null
      })
    ).toBe('transcript-final');

    expect(resolveSettledChatPhase('thinking')).toBe('idle');
    expect(resolveSettledChatPhase('transcript-final')).toBe('transcript-final');
    expect(resolveSettledChatPhase('failed')).toBe('failed');
    expect(resolvePostReconcileChatPhase('streaming')).toBe('idle');
    expect(resolvePostReconcileChatPhase('failed')).toBe('failed');
  });
});
