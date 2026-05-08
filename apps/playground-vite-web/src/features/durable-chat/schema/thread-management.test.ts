import { describe, expect, it } from 'vitest';

import { normalizeUpdateThreadResponse } from './thread-management';

describe('thread management schema', () => {
  it('normalizes update thread responses', () => {
    expect(
      normalizeUpdateThreadResponse({
        thread: {
          id: 'thread-1',
          appId: 'playground-vite-web',
          title: 'Renamed thread',
          status: 'active',
          metadata: null,
          createdAt: '2026-05-09T00:00:00.000Z',
          updatedAt: '2026-05-09T00:01:00.000Z',
          archivedAt: null
        }
      })
    ).toEqual({
      thread: {
        id: 'thread-1',
        appId: 'playground-vite-web',
        userId: null,
        title: 'Renamed thread',
        status: 'active',
        metadata: null,
        createdAt: '2026-05-09T00:00:00.000Z',
        updatedAt: '2026-05-09T00:01:00.000Z',
        archivedAt: null
      },
      error: undefined
    });
  });

  it('falls back gracefully for malformed payloads', () => {
    expect(normalizeUpdateThreadResponse({ thread: { id: 'thread-1' }, error: 'boom' })).toEqual({
      thread: undefined,
      error: 'boom'
    });
  });

  it('rejects payloads with invalid thread statuses', () => {
    expect(
      normalizeUpdateThreadResponse({
        thread: {
          id: 'thread-1',
          appId: 'playground-vite-web',
          title: 'Broken thread',
          status: 'deleted',
          metadata: null,
          createdAt: '2026-05-09T00:00:00.000Z',
          updatedAt: '2026-05-09T00:01:00.000Z',
          archivedAt: null
        }
      })
    ).toEqual({
      thread: undefined,
      error: undefined
    });
  });
});
