import type { PlaygroundThreadDto } from '../types/playground-thread-dto.js';
import type { PlaygroundAppThread } from '../types/playground-app-thread.js';
import type { PlaygroundThreadCatalogRow } from '../repo/thread-catalog-repo.js';

export function projectPlaygroundThreadDto(
  thread: PlaygroundAppThread,
  catalogRow: Pick<PlaygroundThreadCatalogRow, 'pinnedAt' | 'runtimeProvider' | 'runtimeModel'> | null
): PlaygroundThreadDto {
  return {
    id: thread.id,
    appId: thread.appId,
    userId: thread.userId ?? null,
    title: thread.title ?? null,
    status: thread.status,
    metadata: thread.metadata ?? null,
    pinned: catalogRow?.pinnedAt != null,
    pinnedAt: catalogRow?.pinnedAt?.toISOString() ?? null,
    runtimeProvider: catalogRow?.runtimeProvider ?? null,
    runtimeModel: catalogRow?.runtimeModel ?? null,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    archivedAt: thread.archivedAt?.toISOString() ?? null
  };
}

export function projectPlaygroundThreadList(
  threads: PlaygroundAppThread[],
  catalogRows: PlaygroundThreadCatalogRow[]
): PlaygroundThreadDto[] {
  const rowsByThreadId = new Map(catalogRows.map((row) => [row.threadId, row]));
  const visibleThreads = threads.filter((thread) => thread.status === 'active' && rowsByThreadId.has(thread.id));

  return visibleThreads
    .map((thread) => projectPlaygroundThreadDto(thread, rowsByThreadId.get(thread.id) ?? null))
    .sort((left, right) => {
      if (left.pinned && right.pinned) {
        return new Date(right.pinnedAt ?? 0).getTime() - new Date(left.pinnedAt ?? 0).getTime();
      }

      if (left.pinned) {
        return -1;
      }

      if (right.pinned) {
        return 1;
      }

      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
}
