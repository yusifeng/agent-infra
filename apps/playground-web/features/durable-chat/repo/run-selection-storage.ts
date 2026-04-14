import { normalizeStoredRunId } from '../schema/storage';

const SELECTED_RUN_STORAGE_KEY_PREFIX = 'agent-infra.chat-console.selected-run-id';

export function getSelectedRunStorageKey(threadId: string) {
  return `${SELECTED_RUN_STORAGE_KEY_PREFIX}:${threadId}`;
}

export function readPersistedRunId(threadId: string | null | undefined) {
  if (typeof window === 'undefined' || !threadId) {
    return null;
  }

  try {
    return normalizeStoredRunId(window.localStorage.getItem(getSelectedRunStorageKey(threadId)));
  } catch {
    return null;
  }
}

export function persistSelectedRunId(threadId: string | null | undefined, runId: string | null) {
  if (typeof window === 'undefined' || !threadId) {
    return;
  }

  const storageKey = getSelectedRunStorageKey(threadId);

  try {
    const normalizedRunId = normalizeStoredRunId(runId);
    if (normalizedRunId) {
      window.localStorage.setItem(storageKey, normalizedRunId);
    } else {
      window.localStorage.removeItem(storageKey);
    }
  } catch {
    // Storage may be unavailable in privacy-restricted contexts.
  }
}
