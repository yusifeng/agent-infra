import { describe, expect, it } from 'vitest';

import type { PlaygroundThreadDto } from '@/features/durable-chat/repo/chat-api';

import { buildThreadSidebarGroups, formatThreadGroupLabel } from './thread-sidebar-groups';

function createThread(overrides: Partial<PlaygroundThreadDto>): PlaygroundThreadDto {
  return {
    id: 'thread-1',
    appId: 'playground-next-web',
    title: null,
    runtimeProvider: null,
    runtimeModel: null,
    status: 'active',
    pinned: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

describe('thread sidebar groups', () => {
  const now = new Date(2026, 4, 14, 12);

  it('labels threads by relative update date', () => {
    expect(formatThreadGroupLabel(new Date(2026, 4, 14, 0, 1), now)).toBe('今天');
    expect(formatThreadGroupLabel(new Date(2026, 4, 13, 23), now)).toBe('昨天');
    expect(formatThreadGroupLabel(new Date(2026, 4, 10, 12), now)).toBe('7 天内');
    expect(formatThreadGroupLabel(new Date(2026, 3, 1, 12), now)).toBe('更早');
  });

  it('derives pinned threads from thread DTOs when no override ids are provided', () => {
    const groups = buildThreadSidebarGroups(
      [
        createThread({ id: 'pinned', pinned: true, updatedAt: '2026-05-14T02:00:00.000Z' }),
        createThread({ id: 'today', updatedAt: '2026-05-14T01:00:00.000Z' }),
        createThread({ id: 'archived', status: 'archived', pinned: true, updatedAt: '2026-05-14T01:00:00.000Z' })
      ],
      { now }
    );

    expect(groups.pinnedThreads.map((thread) => thread.id)).toEqual(['pinned']);
    expect(groups.groupedUnpinned).toEqual([
      {
        label: '今天',
        threads: [expect.objectContaining({ id: 'today' })]
      }
    ]);
  });

  it('uses explicit pinned ids when replay or callers need an override', () => {
    const groups = buildThreadSidebarGroups(
      [
        createThread({ id: 'pinned-dto', pinned: true, updatedAt: '2026-05-14T02:00:00.000Z' }),
        createThread({ id: 'explicit', updatedAt: '2026-05-13T02:00:00.000Z' })
      ],
      { now, pinnedThreadIds: ['explicit'] }
    );

    expect(groups.pinnedThreads.map((thread) => thread.id)).toEqual(['explicit']);
    expect(groups.groupedUnpinned).toEqual([
      {
        label: '今天',
        threads: [expect.objectContaining({ id: 'pinned-dto' })]
      }
    ]);
  });
});
