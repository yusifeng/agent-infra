const STORAGE_KEY = 'durable-chat:pinned-thread-ids';

function getLocalStorage() {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function readStoredPinnedThreadIds(storage: Pick<Storage, 'getItem'> | null = getLocalStorage()) {
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  } catch {
    return [];
  }
}

export function writeStoredPinnedThreadIds(
  threadIds: string[],
  storage: Pick<Storage, 'setItem'> | null = getLocalStorage()
) {
  if (!storage) {
    return;
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(threadIds));
}
