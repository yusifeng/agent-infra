import type { PlaygroundThreadDto } from '@/features/durable-chat/repo/chat-api';

export type ThreadSidebarGroup = {
  label: string;
  threads: PlaygroundThreadDto[];
};

export type ThreadSidebarGroups = {
  pinnedThreads: PlaygroundThreadDto[];
  groupedUnpinned: ThreadSidebarGroup[];
};

const ORDERED_GROUP_LABELS = ['今天', '昨天', '7 天内', '更早'];

export function formatThreadGroupLabel(date: Date, now = new Date()) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  if (date >= startOfToday) {
    return '今天';
  }

  if (date >= startOfYesterday) {
    return '昨天';
  }

  if (date >= startOfWeek) {
    return '7 天内';
  }

  return '更早';
}

export function buildThreadSidebarGroups(
  threads: PlaygroundThreadDto[],
  options: {
    now?: Date;
    pinnedThreadIds?: string[];
  } = {}
): ThreadSidebarGroups {
  const { now, pinnedThreadIds } = options;
  const pinnedSet = pinnedThreadIds ? new Set(pinnedThreadIds) : null;
  const activeThreads = threads.filter((thread) => thread.status === 'active');
  const isPinned = (thread: PlaygroundThreadDto) => (pinnedSet ? pinnedSet.has(thread.id) : thread.pinned === true);
  const pinnedThreads = activeThreads.filter(isPinned);
  const unpinnedThreads = activeThreads.filter((thread) => !isPinned(thread));

  const groups = new Map<string, PlaygroundThreadDto[]>();
  for (const thread of unpinnedThreads) {
    const label = formatThreadGroupLabel(new Date(thread.updatedAt), now);
    const current = groups.get(label) ?? [];
    current.push(thread);
    groups.set(label, current);
  }

  const groupedUnpinned = ORDERED_GROUP_LABELS
    .map((label) => ({
      label,
      threads: groups.get(label) ?? []
    }))
    .filter((group) => group.threads.length > 0);

  return { pinnedThreads, groupedUnpinned };
}
