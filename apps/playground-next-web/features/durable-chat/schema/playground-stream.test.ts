import { describe, expect, it } from 'vitest';

import { normalizePlaygroundStreamEvent, parsePlaygroundSseChunk } from './playground-stream';

describe('playground stream schema', () => {
  it('normalizes private thread title events', () => {
    expect(
      normalizePlaygroundStreamEvent({
        type: 'thread.title_updated',
        threadId: 'thread-1',
        title: '验证码问题排查',
        updatedAt: '2026-01-01T00:00:00.000Z'
      })
    ).toEqual({
      type: 'thread.title_updated',
      threadId: 'thread-1',
      title: '验证码问题排查',
      updatedAt: '2026-01-01T00:00:00.000Z'
    });

    expect(normalizePlaygroundStreamEvent({ type: 'run.completed' })).toBe(null);
  });

  it('parses regular and private SSE frames as raw events', () => {
    const parsed = parsePlaygroundSseChunk(
      [
        'event: run.completed',
        'data: {"type":"run.completed","runId":"run-1"}',
        '',
        'event: thread.title_updated',
        'data: {"type":"thread.title_updated","threadId":"thread-1","title":"Title","updatedAt":"2026-01-01T00:00:00.000Z"}',
        '',
        'event: run.failed',
        'data: {"type":"run.failed"'
      ].join('\n')
    );

    expect(parsed.events).toEqual([
      {
        type: 'run.completed',
        runId: 'run-1'
      },
      {
        type: 'thread.title_updated',
        threadId: 'thread-1',
        title: 'Title',
        updatedAt: '2026-01-01T00:00:00.000Z'
      }
    ]);
    expect(parsed.remainder).toMatch(/run\.failed/);
  });
});
