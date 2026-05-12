import { describe, expect, it } from 'vitest';

import {
  normalizePlaygroundPrivateStreamEvent,
  normalizePlaygroundStreamEvent,
  parsePlaygroundSseChunk
} from '@/features/durable-chat/schema/playground-stream';

describe('playground stream schema', () => {
  it('normalizes a playground-private thread title event', () => {
    expect(
      normalizePlaygroundPrivateStreamEvent({
        type: 'thread.title_updated',
        threadId: 'thread-1',
        title: '验证码问题排查',
        updatedAt: '2026-05-12T00:00:00.000Z'
      })
    ).toEqual({
      type: 'thread.title_updated',
      threadId: 'thread-1',
      title: '验证码问题排查',
      updatedAt: '2026-05-12T00:00:00.000Z'
    });
  });

  it('accepts an intentionally empty updated title', () => {
    expect(
      normalizePlaygroundPrivateStreamEvent({
        type: 'thread.title_updated',
        threadId: 'thread-1',
        title: '',
        updatedAt: '2026-05-12T00:00:00.000Z'
      })
    ).toEqual({
      type: 'thread.title_updated',
      threadId: 'thread-1',
      title: '',
      updatedAt: '2026-05-12T00:00:00.000Z'
    });
  });

  it('normalizes shared run events through the playground stream union', () => {
    expect(
      normalizePlaygroundStreamEvent({
        type: 'run.completed',
        runId: 'run-1',
        run: {
          id: 'run-1',
          threadId: 'thread-1',
          triggerMessageId: null,
          provider: 'deepseek',
          model: 'deepseek-v4-pro',
          status: 'completed',
          usage: null,
          error: null,
          startedAt: '2026-05-12T00:00:00.000Z',
          finishedAt: '2026-05-12T00:00:01.000Z',
          createdAt: '2026-05-12T00:00:00.000Z'
        }
      })
    ).toEqual({
      type: 'run.completed',
      runId: 'run-1',
      run: {
        id: 'run-1',
        threadId: 'thread-1',
        triggerMessageId: null,
        provider: 'deepseek',
        model: 'deepseek-v4-pro',
        status: 'completed',
        usage: null,
        error: null,
        startedAt: '2026-05-12T00:00:00.000Z',
        finishedAt: '2026-05-12T00:00:01.000Z',
        createdAt: '2026-05-12T00:00:00.000Z'
      }
    });
  });

  it('parses mixed shared and private events from one SSE chunk', () => {
    const parsed = parsePlaygroundSseChunk(
      [
        'event: run.ready',
        'data: {"type":"run.ready","runId":"run-1","run":{"id":"run-1","threadId":"thread-1","triggerMessageId":null,"provider":"deepseek","model":"deepseek-v4-pro","status":"queued","usage":null,"error":null,"startedAt":null,"finishedAt":null,"createdAt":"2026-05-12T00:00:00.000Z"},"userMessage":{"id":"msg-1","threadId":"thread-1","runId":null,"role":"user","seq":1,"status":"completed","metadata":null,"createdAt":"2026-05-12T00:00:00.000Z","parts":[]}}',
        '',
        'event: thread.title_updated',
        'data: {"type":"thread.title_updated","threadId":"thread-1","title":"验证码问题排查","updatedAt":"2026-05-12T00:00:02.000Z"}',
        '',
        'partial'
      ].join('\n')
    );

    expect(parsed.events).toEqual([
      {
        type: 'run.ready',
        runId: 'run-1',
        run: {
          id: 'run-1',
          threadId: 'thread-1',
          triggerMessageId: null,
          provider: 'deepseek',
          model: 'deepseek-v4-pro',
          status: 'queued',
          usage: null,
          error: null,
          startedAt: null,
          finishedAt: null,
          createdAt: '2026-05-12T00:00:00.000Z'
        },
        userMessage: {
          id: 'msg-1',
          threadId: 'thread-1',
          runId: null,
          role: 'user',
          seq: 1,
          status: 'completed',
          metadata: null,
          createdAt: '2026-05-12T00:00:00.000Z',
          parts: []
        }
      },
      {
        type: 'thread.title_updated',
        threadId: 'thread-1',
        title: '验证码问题排查',
        updatedAt: '2026-05-12T00:00:02.000Z'
      }
    ]);
    expect(parsed.remainder).toBe('partial');
  });

  it('preserves newlines across repeated SSE data lines', () => {
    const parsed = parsePlaygroundSseChunk(
      [
        'event: thread.title_updated',
        'data: {"type":"thread.title_updated","threadId":"thread-1",',
        'data: "title":"验证码问题排查","updatedAt":"2026-05-12T00:00:02.000Z"}',
        '',
        ''
      ].join('\n')
    );

    expect(parsed.events).toEqual([
      {
        type: 'thread.title_updated',
        threadId: 'thread-1',
        title: '验证码问题排查',
        updatedAt: '2026-05-12T00:00:02.000Z'
      }
    ]);
  });

  it('preserves payload indentation beyond the optional single SSE space', () => {
    const parsed = parsePlaygroundSseChunk(
      [
        'event: thread.title_updated',
        'data: {"type":"thread.title_updated","threadId":"thread-1",',
        'data:  "title":"验证码问题排查","updatedAt":"2026-05-12T00:00:02.000Z"}',
        '',
        ''
      ].join('\n')
    );

    expect(parsed.events).toEqual([
      {
        type: 'thread.title_updated',
        threadId: 'thread-1',
        title: '验证码问题排查',
        updatedAt: '2026-05-12T00:00:02.000Z'
      }
    ]);
  });

  it('parses CRLF-delimited SSE frames', () => {
    const parsed = parsePlaygroundSseChunk(
      [
        'event: thread.title_updated',
        'data: {"type":"thread.title_updated","threadId":"thread-1","title":"验证码问题排查","updatedAt":"2026-05-12T00:00:02.000Z"}',
        '',
        ''
      ].join('\r\n')
    );

    expect(parsed.events).toEqual([
      {
        type: 'thread.title_updated',
        threadId: 'thread-1',
        title: '验证码问题排查',
        updatedAt: '2026-05-12T00:00:02.000Z'
      }
    ]);
  });
});
