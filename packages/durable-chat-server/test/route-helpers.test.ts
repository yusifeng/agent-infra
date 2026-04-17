import { describe, expect, it } from 'vitest';

import { InvalidTurnTextError } from '@agent-infra/app';

import { getRouteErrorMessage, getRouteErrorStatus } from '../src/route-errors';
import { toRunDto } from '../src/api-dto';

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
});
