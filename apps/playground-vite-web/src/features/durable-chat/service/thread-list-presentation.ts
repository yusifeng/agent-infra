import type { DurableThreadDto } from '@/features/durable-chat/types/thread';

type BuildOrderedThreadsArgs = {
  threads: DurableThreadDto[];
  pinnedThreadIds: string[];
};

export function buildOrderedThreads({ threads, pinnedThreadIds }: BuildOrderedThreadsArgs) {
  const activeThreads = threads.filter((thread) => thread.status === 'active');
  const pinnedSet = new Set(pinnedThreadIds);
  const pinnedRank = new Map(pinnedThreadIds.map((threadId, index) => [threadId, index]));

  return activeThreads.slice().sort((left, right) => {
    const leftPinned = pinnedSet.has(left.id);
    const rightPinned = pinnedSet.has(right.id);

    if (leftPinned && rightPinned) {
      return (pinnedRank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (pinnedRank.get(right.id) ?? Number.MAX_SAFE_INTEGER);
    }

    if (leftPinned) {
      return -1;
    }

    if (rightPinned) {
      return 1;
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}
