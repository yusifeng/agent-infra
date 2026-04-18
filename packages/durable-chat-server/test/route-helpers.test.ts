import { describe, expect, it } from 'vitest';

import { InvalidTurnTextError } from '@agent-infra/app';

import { toRunDto } from '../src/api-dto';
import {
  buildRunTextTurnResponse,
  buildRunTimelineResponse,
  buildRunReadyEvent,
  buildRunTerminalEvent,
  buildThreadMessagesResponse,
  buildThreadRunsResponse,
  buildThreadsResponse,
  encodeSseEvent,
  parseCreateThreadTitle,
  parseThreadRunsLimit,
  parseRunTextTurnInput
} from '../src/chat-route-helpers';
import { getRouteErrorMessage, getRouteErrorStatus } from '../src/route-errors';

describe('durable chat server route helpers', () => {
  it('maps app errors to route status codes and messages', () => {
    const error = new InvalidTurnTextError();

    expect(getRouteErrorStatus(error)).toBe(400);
    expect(getRouteErrorMessage(error, 'fallback')).toBe(error.message);
    expect(getRouteErrorStatus(new Error('boom'))).toBe(500);
    expect(getRouteErrorMessage(null, 'fallback')).toBe('fallback');
  });

  it('serializes nullable runs into dto shapes', () => {
    expect(toRunDto(null)).toBeNull();

    expect(
      toRunDto({
        id: 'run-1',
        threadId: 'thread-1',
        triggerMessageId: null,
        provider: 'deepseek',
        model: 'deepseek-chat',
        status: 'completed',
        usage: null,
        error: null,
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        finishedAt: new Date('2026-01-01T00:00:01.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z')
      })
    ).toEqual({
      id: 'run-1',
      threadId: 'thread-1',
      triggerMessageId: null,
      provider: 'deepseek',
      model: 'deepseek-chat',
      status: 'completed',
      usage: null,
      error: null,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:00:01.000Z',
      createdAt: '2026-01-01T00:00:00.000Z'
    });
  });

  it('normalizes thread and turn request inputs', () => {
    expect(parseCreateThreadTitle({ title: '  Demo thread  ' })).toBe('Demo thread');
    expect(parseCreateThreadTitle({ title: '   ' })).toBe('New Thread');
    expect(parseCreateThreadTitle(null)).toBe('New Thread');

    expect(
      parseRunTextTurnInput({
        text: 'hello',
        provider: ' deepseek ',
        model: ' deepseek-chat '
      })
    ).toEqual({
      text: 'hello',
      provider: 'deepseek',
      model: 'deepseek-chat'
    });
    expect(parseRunTextTurnInput(null)).toEqual({
      text: '',
      provider: undefined,
      model: undefined
    });

    expect(parseThreadRunsLimit(null)).toBe(8);
    expect(parseThreadRunsLimit('0')).toBe(8);
    expect(parseThreadRunsLimit('2')).toBe(2);
    expect(parseThreadRunsLimit('50')).toBe(20);
  });

  it('builds thread and message dto responses', () => {
    expect(
      buildThreadsResponse([
        {
          id: 'thread-1',
          appId: 'playground-runtime-pi',
          userId: null,
          title: 'Demo thread',
          status: 'active',
          metadata: { source: 'demo' },
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          archivedAt: null
        }
      ])
    ).toEqual({
      threads: [
        {
          id: 'thread-1',
          appId: 'playground-runtime-pi',
          userId: null,
          title: 'Demo thread',
          status: 'active',
          metadata: { source: 'demo' },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          archivedAt: null
        }
      ]
    });

    expect(
      buildThreadMessagesResponse([
        {
          id: 'message-1',
          threadId: 'thread-1',
          runId: null,
          role: 'user',
          seq: 1,
          status: 'completed',
          metadata: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          parts: [
            {
              id: 'part-1',
              messageId: 'message-1',
              partIndex: 0,
              type: 'text',
              textValue: 'hello',
              jsonValue: null,
              createdAt: new Date('2026-01-01T00:00:00.000Z')
            }
          ]
        }
      ])
    ).toEqual({
      messages: [
        {
          id: 'message-1',
          threadId: 'thread-1',
          runId: null,
          role: 'user',
          seq: 1,
          status: 'completed',
          metadata: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          parts: [
            {
              id: 'part-1',
              messageId: 'message-1',
              partIndex: 0,
              type: 'text',
              textValue: 'hello',
              jsonValue: null,
              createdAt: '2026-01-01T00:00:00.000Z'
            }
          ]
        }
      ]
    });

    expect(
      buildThreadRunsResponse([
        {
          id: 'run-1',
          threadId: 'thread-1',
          triggerMessageId: null,
          provider: 'deepseek',
          model: 'deepseek-chat',
          status: 'completed',
          usage: null,
          error: null,
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          finishedAt: new Date('2026-01-01T00:00:01.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z')
        }
      ])
    ).toEqual({
      runs: [
        {
          id: 'run-1',
          threadId: 'thread-1',
          triggerMessageId: null,
          provider: 'deepseek',
          model: 'deepseek-chat',
          status: 'completed',
          usage: null,
          error: null,
          startedAt: '2026-01-01T00:00:00.000Z',
          finishedAt: '2026-01-01T00:00:01.000Z',
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ]
    });
  });

  it('builds run stream events and encodes sse frames', () => {
    const readyEvent = buildRunReadyEvent({
      run: {
        id: 'run-1',
        threadId: 'thread-1',
        triggerMessageId: 'message-1',
        provider: 'deepseek',
        model: 'deepseek-chat',
        status: 'queued',
        usage: null,
        error: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z')
      },
      userMessage: {
        id: 'message-1',
        threadId: 'thread-1',
        runId: null,
        role: 'user',
        seq: 1,
        status: 'completed',
        metadata: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        parts: [
          {
            id: 'part-1',
            messageId: 'message-1',
            partIndex: 0,
            type: 'text',
            textValue: 'hello',
            jsonValue: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z')
          }
        ]
      },
      runtimeSelection: {
        provider: 'deepseek',
        model: 'deepseek-chat'
      }
    });

    expect(readyEvent).toMatchObject({
      type: 'run.ready',
      runId: 'run-1'
    });
    expect(encodeSseEvent(readyEvent)).toContain('event: run.ready');

    expect(
      buildRunTerminalEvent('run-1', {
        id: 'run-1',
        threadId: 'thread-1',
        triggerMessageId: 'message-1',
        provider: 'deepseek',
        model: 'deepseek-chat',
        status: 'completed',
        usage: null,
        error: null,
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        finishedAt: new Date('2026-01-01T00:00:01.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z')
      })
    ).toMatchObject({
      type: 'run.completed',
      runId: 'run-1'
    });

    expect(
      buildRunTerminalEvent('run-1', {
        id: 'run-1',
        threadId: 'thread-1',
        triggerMessageId: 'message-1',
        provider: 'deepseek',
        model: 'deepseek-chat',
        status: 'failed',
        usage: null,
        error: 'boom',
        startedAt: new Date('2026-01-01T00:00:00.000Z'),
        finishedAt: new Date('2026-01-01T00:00:01.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z')
      })
    ).toMatchObject({
      type: 'run.failed',
      runId: 'run-1',
      error: 'boom'
    });
  });

  it('builds run and timeline response dto payloads', () => {
    expect(
      buildRunTextTurnResponse({
        run: {
          id: 'run-1',
          threadId: 'thread-1',
          triggerMessageId: 'message-1',
          provider: 'deepseek',
          model: 'deepseek-chat',
          status: 'completed',
          usage: null,
          error: null,
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          finishedAt: new Date('2026-01-01T00:00:01.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z')
        },
        messages: [
          {
            id: 'message-1',
            threadId: 'thread-1',
            runId: 'run-1',
            role: 'assistant',
            seq: 2,
            status: 'completed',
            metadata: null,
            createdAt: new Date('2026-01-01T00:00:01.000Z'),
            parts: [
              {
                id: 'part-1',
                messageId: 'message-1',
                partIndex: 0,
                type: 'text',
                textValue: 'ok',
                jsonValue: null,
                createdAt: new Date('2026-01-01T00:00:01.000Z')
              }
            ]
          }
        ],
        debug: {
          runEventCount: 1,
          toolInvocationCount: 0
        },
        executionError: undefined
      })
    ).toEqual({
      run: {
        id: 'run-1',
        threadId: 'thread-1',
        triggerMessageId: 'message-1',
        provider: 'deepseek',
        model: 'deepseek-chat',
        status: 'completed',
        usage: null,
        error: null,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:00:01.000Z',
        createdAt: '2026-01-01T00:00:00.000Z'
      },
      messages: [
        {
          id: 'message-1',
          threadId: 'thread-1',
          runId: 'run-1',
          role: 'assistant',
          seq: 2,
          status: 'completed',
          metadata: null,
          createdAt: '2026-01-01T00:00:01.000Z',
          parts: [
            {
              id: 'part-1',
              messageId: 'message-1',
              partIndex: 0,
              type: 'text',
              textValue: 'ok',
              jsonValue: null,
              createdAt: '2026-01-01T00:00:01.000Z'
            }
          ]
        }
      ],
      debug: {
        runEventCount: 1,
        toolInvocationCount: 0
      },
      error: undefined
    });

    expect(
      buildRunTimelineResponse({
        run: {
          id: 'run-1',
          threadId: 'thread-1',
          triggerMessageId: 'message-1',
          provider: 'deepseek',
          model: 'deepseek-chat',
          status: 'completed',
          usage: null,
          error: null,
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          finishedAt: new Date('2026-01-01T00:00:01.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z')
        },
        runEvents: [
          {
            id: 'event-1',
            threadId: 'thread-1',
            runId: 'run-1',
            seq: 1,
            type: 'agent_start',
            payload: { model: 'deepseek-chat' },
            createdAt: new Date('2026-01-01T00:00:00.000Z')
          }
        ],
        toolInvocations: [
          {
            id: 'tool-1',
            threadId: 'thread-1',
            runId: 'run-1',
            messageId: 'message-1',
            toolName: 'echo',
            toolCallId: 'call-1',
            status: 'completed',
            input: { text: 'ok' },
            output: { text: 'ok' },
            error: null,
            startedAt: new Date('2026-01-01T00:00:00.000Z'),
            finishedAt: new Date('2026-01-01T00:00:01.000Z'),
            createdAt: new Date('2026-01-01T00:00:00.000Z')
          }
        ]
      })
    ).toEqual({
      run: {
        id: 'run-1',
        threadId: 'thread-1',
        triggerMessageId: 'message-1',
        provider: 'deepseek',
        model: 'deepseek-chat',
        status: 'completed',
        usage: null,
        error: null,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: '2026-01-01T00:00:01.000Z',
        createdAt: '2026-01-01T00:00:00.000Z'
      },
      runEvents: [
        {
          id: 'event-1',
          threadId: 'thread-1',
          runId: 'run-1',
          seq: 1,
          type: 'agent_start',
          payload: { model: 'deepseek-chat' },
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      toolInvocations: [
        {
          id: 'tool-1',
          threadId: 'thread-1',
          runId: 'run-1',
          messageId: 'message-1',
          toolName: 'echo',
          toolCallId: 'call-1',
          status: 'completed',
          input: { text: 'ok' },
          output: { text: 'ok' },
          error: null,
          startedAt: '2026-01-01T00:00:00.000Z',
          finishedAt: '2026-01-01T00:00:01.000Z',
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ]
    });
  });
});
