import { describe, expect, it } from 'vitest';

import { normalizeCreateThreadResponse, normalizeThreadsResponse, normalizeUpdateThreadResponse } from './thread-management';

describe('thread management schema', () => {
  it('normalizes thread list responses', () => {
    expect(
      normalizeThreadsResponse({
        threads: [
          {
            id: 'thread-1',
            appId: 'playground-vite-web',
            title: 'Pinned thread',
            status: 'active',
            metadata: null,
            pinned: true,
            runtimeProvider: 'deepseek',
            runtimeModel: 'deepseek-v4-flash',
            createdAt: '2026-05-09T00:00:00.000Z',
            updatedAt: '2026-05-09T00:01:00.000Z',
            archivedAt: null
          }
        ]
      })
    ).toEqual({
      threads: [
        {
          id: 'thread-1',
          appId: 'playground-vite-web',
          userId: null,
          title: 'Pinned thread',
          status: 'active',
          metadata: null,
          pinned: true,
          pinnedAt: null,
          runtimeProvider: 'deepseek',
          runtimeModel: 'deepseek-v4-flash',
          createdAt: '2026-05-09T00:00:00.000Z',
          updatedAt: '2026-05-09T00:01:00.000Z',
          archivedAt: null
        }
      ],
      error: undefined
    });
  });

  it('normalizes create thread responses', () => {
    expect(
      normalizeCreateThreadResponse({
        thread: {
          id: 'thread-1',
          appId: 'playground-vite-web',
          title: 'Created thread',
          status: 'active',
          metadata: null,
          pinned: false,
          runtimeProvider: null,
          runtimeModel: null,
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
        title: 'Created thread',
        status: 'active',
        metadata: null,
        pinned: false,
        pinnedAt: null,
        runtimeProvider: null,
        runtimeModel: null,
        createdAt: '2026-05-09T00:00:00.000Z',
        updatedAt: '2026-05-09T00:01:00.000Z',
        archivedAt: null
      },
      error: undefined
    });
  });

  it('normalizes update thread responses', () => {
    expect(
      normalizeUpdateThreadResponse({
        thread: {
          id: 'thread-1',
          appId: 'playground-vite-web',
          title: 'Renamed thread',
          status: 'active',
          metadata: null,
          pinned: false,
          runtimeProvider: 'openai',
          runtimeModel: 'gpt-5.5',
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
        pinned: false,
        pinnedAt: null,
        runtimeProvider: 'openai',
        runtimeModel: 'gpt-5.5',
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
          pinned: false,
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
