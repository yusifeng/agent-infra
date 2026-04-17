import { normalizeStoredRunId } from '../schema/storage.js';

const SELECTED_RUN_STORAGE_KEY_PREFIX = 'agent-infra.chat-console.selected-run-id';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function getSelectedRunStorageKey(threadId: string, keyPrefix = SELECTED_RUN_STORAGE_KEY_PREFIX) {
  return `${keyPrefix}:${threadId}`;
}

export function readPersistedRunId(
  threadId: string | null | undefined,
  storage: StorageLike | null | undefined,
  keyPrefix = SELECTED_RUN_STORAGE_KEY_PREFIX
) {
  if (!storage || !threadId) {
    return null;
  }

  try {
    return normalizeStoredRunId(storage.getItem(getSelectedRunStorageKey(threadId, keyPrefix)));
  } catch {
    return null;
  }
}

export function persistSelectedRunId(
  threadId: string | null | undefined,
  runId: string | null,
  storage: StorageLike | null | undefined,
  keyPrefix = SELECTED_RUN_STORAGE_KEY_PREFIX
) {
  if (!storage || !threadId) {
    return;
  }

  const storageKey = getSelectedRunStorageKey(threadId, keyPrefix);

  try {
    const normalizedRunId = normalizeStoredRunId(runId);
    if (normalizedRunId) {
      storage.setItem(storageKey, normalizedRunId);
    } else {
      storage.removeItem(storageKey);
    }
  } catch {
    // Storage may be unavailable in privacy-restricted contexts.
  }
}
