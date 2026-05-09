import { describe, expect, it } from 'vitest';

import { buildOrderedThreads } from './thread-list-presentation';
import type { PlaygroundThreadDto } from '@/features/durable-chat/types/thread';

function createThread(overrides: Partial<PlaygroundThreadDto> = {}): PlaygroundThreadDto {
  return {
    id: 'thread-1',
    appId: 'playground-vite-web',
    title: 'Thread title',
    status: 'active',
    metadata: null,
    pinned: false,
    pinnedAt: null,
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:00.000Z',
    archivedAt: null,
    ...overrides
  };
}

describe('thread list presentation', () => {
  it('places pinned threads first and preserves most-recent-pin-first order', () => {
    const result = buildOrderedThreads({
      threads: [
        createThread({ id: 'thread-1', updatedAt: '2026-05-09T00:00:01.000Z' }),
        createThread({ id: 'thread-2', updatedAt: '2026-05-09T00:00:03.000Z' }),
        createThread({ id: 'thread-3', updatedAt: '2026-05-09T00:00:02.000Z' })
      ],
      pinnedThreadIds: ['thread-3', 'thread-1']
    });

    expect(result.map((thread) => thread.id)).toEqual(['thread-3', 'thread-1', 'thread-2']);
  });

  it('sorts unpinned active threads by updatedAt descending and excludes archived threads', () => {
    const result = buildOrderedThreads({
      threads: [
        createThread({ id: 'thread-1', updatedAt: '2026-05-09T00:00:01.000Z' }),
        createThread({ id: 'thread-2', updatedAt: '2026-05-09T00:00:03.000Z' }),
        createThread({ id: 'thread-3', status: 'archived', updatedAt: '2026-05-09T00:00:05.000Z', archivedAt: '2026-05-09T00:00:05.000Z' })
      ],
      pinnedThreadIds: []
    });

    expect(result.map((thread) => thread.id)).toEqual(['thread-2', 'thread-1']);
  });
});
