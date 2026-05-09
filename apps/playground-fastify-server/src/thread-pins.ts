import fs from 'node:fs';
import path from 'node:path';

import { ThreadNotActiveError, ThreadNotFoundError } from '@agent-infra/app';

type JsonRecord = Record<string, unknown>;

type AppThread = {
  id: string;
  appId: string;
  userId?: string | null;
  title?: string | null;
  status: 'active' | 'archived';
  metadata?: JsonRecord | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | null;
};

type ThreadPinStore = {
  version: 1;
  pins: Record<
    string,
    {
      appId: string;
      pinnedAt: string;
    }
  >;
};

type PinnedThread = AppThread & {
  pinned: boolean;
};

const THREAD_PIN_STORE_PATH = path.resolve(
  process.cwd(),
  process.env.PLAYGROUND_THREAD_PIN_STORE_PATH ?? 'apps/playground-fastify-server/local.thread-pins.json'
);

function readStore(): ThreadPinStore {
  try {
    const raw = fs.readFileSync(THREAD_PIN_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ThreadPinStore>;
    if (!parsed || parsed.version !== 1 || !parsed.pins || typeof parsed.pins !== 'object') {
      return { version: 1, pins: {} };
    }

    return {
      version: 1,
      pins: Object.fromEntries(
        Object.entries(parsed.pins).filter(
          (entry): entry is [
            string,
            {
              appId: string;
              pinnedAt: string;
            }
          ] => typeof entry[1]?.appId === 'string' && typeof entry[1]?.pinnedAt === 'string'
        )
      )
    };
  } catch {
    return { version: 1, pins: {} };
  }
}

function writeStore(store: ThreadPinStore) {
  fs.mkdirSync(path.dirname(THREAD_PIN_STORE_PATH), { recursive: true });
  fs.writeFileSync(THREAD_PIN_STORE_PATH, JSON.stringify(store, null, 2));
}

function getPinnedAt(store: ThreadPinStore, threadId: string) {
  return store.pins[threadId]?.pinnedAt ?? null;
}

function toPinnedThread(thread: AppThread, store: ThreadPinStore): PinnedThread {
  return {
    ...thread,
    pinned: getPinnedAt(store, thread.id) !== null
  };
}

function toPinnedThreadDto(thread: PinnedThread) {
  return {
    id: thread.id,
    appId: thread.appId,
    userId: thread.userId ?? null,
    title: thread.title ?? null,
    status: thread.status,
    metadata: thread.metadata ?? null,
    pinned: thread.pinned,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    archivedAt: thread.archivedAt?.toISOString() ?? null
  };
}

function toSortTimestamp(value: string | null) {
  return value ? new Date(value).getTime() : Number.NEGATIVE_INFINITY;
}

export function buildPinnedThreadsResponse(threads: AppThread[]) {
  const store = readStore();
  const ordered = threads
    .map((thread) => toPinnedThread(thread, store))
    .sort((left, right) => {
      if (left.pinned && right.pinned) {
        return toSortTimestamp(getPinnedAt(store, right.id)) - toSortTimestamp(getPinnedAt(store, left.id));
      }

      if (left.pinned) {
        return -1;
      }

      if (right.pinned) {
        return 1;
      }

      return right.updatedAt.getTime() - left.updatedAt.getTime();
    });

  return {
    threads: ordered.map(toPinnedThreadDto)
  };
}

export function buildPinnedThreadResponse(thread: AppThread) {
  const store = readStore();
  return {
    thread: toPinnedThreadDto(toPinnedThread(thread, store))
  };
}

export function clearPinnedThreadState(threadId: string) {
  const store = readStore();
  if (!store.pins[threadId]) {
    return;
  }

  delete store.pins[threadId];
  writeStore(store);
}

export function updatePinnedThreadState(thread: AppThread, pinned: boolean, updatedAt: Date) {
  if (thread.status !== 'active') {
    throw new ThreadNotActiveError(thread.id, thread.status);
  }

  const store = readStore();

  if (pinned) {
    store.pins[thread.id] = {
      appId: thread.appId,
      pinnedAt: updatedAt.toISOString()
    };
  } else {
    delete store.pins[thread.id];
  }

  writeStore(store);
}

export async function loadThreadOrThrow(load: () => Promise<AppThread | null>, threadId: string, appId?: string) {
  const thread = await load();
  if (!thread || (appId && thread.appId !== appId)) {
    throw new ThreadNotFoundError(threadId);
  }

  return thread;
}
