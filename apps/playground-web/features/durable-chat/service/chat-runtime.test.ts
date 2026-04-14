import assert from 'node:assert/strict';
import test from 'node:test';

import type { MessageDto, RunDto, RunStreamEventDto } from '@agent-infra/contracts';

import {
  applyRunStateToTimeline,
  buildAssistantMessageFromSnapshot,
  chooseInitialRunId,
  normalizeRuntimeMeta,
  parseSseChunk,
  upsertMessage
} from './chat-runtime';

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

test('normalizeRuntimeMeta fills defaults from model options', () => {
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

  assert.equal(meta.runtimeConfigured, false);
  assert.equal(meta.runtimeProvider, 'openai');
  assert.equal(meta.runtimeModel, 'gpt-4o-mini');
  assert.equal(meta.defaultModelKey, 'openai:gpt-4o-mini');
});

test('chooseInitialRunId prefers explicit run, then latest run record, then latest message run', () => {
  const messages = [createMessage('message-1', 1, 'run-from-message')];
  const runs = [createRun('run-latest', '2026-01-03T00:00:00.000Z')];

  assert.equal(chooseInitialRunId(messages, runs, 'run-latest'), 'run-latest');
  assert.equal(chooseInitialRunId(messages, runs, 'missing'), 'run-latest');
  assert.equal(chooseInitialRunId(messages, [], null), 'run-from-message');
});

test('upsertMessage inserts by sequence and replaces by id', () => {
  const original = [createMessage('message-2', 2, null)];
  const inserted = upsertMessage(original, createMessage('message-1', 1, null));
  assert.deepEqual(
    inserted.map((message) => message.id),
    ['message-1', 'message-2']
  );

  const replaced = upsertMessage(inserted, {
    ...createMessage('message-1', 1, null),
    metadata: { replaced: true }
  });
  assert.deepEqual(replaced[0]?.metadata, { replaced: true });
});

test('buildAssistantMessageFromSnapshot creates reasoning and text parts in order', () => {
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

  assert.equal(message.seq, 2);
  assert.equal(message.parts.length, 2);
  assert.equal(message.parts[0]?.type, 'reasoning');
  assert.equal(message.parts[1]?.type, 'text');
});

test('applyRunStateToTimeline keeps prior events and tool invocations across state updates', () => {
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

  assert.equal(nextTimeline.run?.status, 'running');
  assert.equal(nextTimeline.runEvents.length, 1);
  assert.equal(nextTimeline.toolInvocations.length, 1);
});

test('parseSseChunk returns matching events and preserves incomplete remainder', () => {
  const buffer = [
    'event: run.completed',
    'data: {"type":"run.completed","runId":"run-1","run":{"id":"run-1","threadId":"thread-1","triggerMessageId":null,"provider":"openai","model":"gpt-4o-mini","status":"completed","usage":null,"error":null,"startedAt":null,"finishedAt":null,"createdAt":"2026-01-01T00:00:00.000Z"}}',
    '',
    'event: run.failed',
    'data: {"type":"run.failed"'
  ].join('\n');

  const parsed = parseSseChunk(buffer);

  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.events[0]?.type, 'run.completed');
  assert.match(parsed.remainder, /run\.failed/);
});
