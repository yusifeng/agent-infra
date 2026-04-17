import {
  getSelectedRunStorageKey,
  persistSelectedRunId as persistSelectedRunIdToStorage,
  readPersistedRunId as readPersistedRunIdFromStorage
} from '@agent-infra/durable-chat-client';

function getBrowserStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export { getSelectedRunStorageKey };

export function readPersistedRunId(threadId: string | null | undefined) {
  return readPersistedRunIdFromStorage(threadId, getBrowserStorage());
}

export function persistSelectedRunId(threadId: string | null | undefined, runId: string | null) {
  persistSelectedRunIdToStorage(threadId, runId, getBrowserStorage());
}
