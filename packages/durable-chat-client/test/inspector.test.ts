import { describe, expect, it, vi } from 'vitest';

import {
  createInitialRunInspectorState,
  getSelectedRunStorageKey,
  persistSelectedRunId,
  readPersistedRunId,
  type StorageLike
} from '../src/index';

function createStorage(): StorageLike {
  const values = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    })
  };
}

describe('durable-chat-client inspector helpers', () => {
  it('creates the default optional inspector state slice', () => {
    expect(createInitialRunInspectorState()).toEqual({
      logOpen: false,
      selectedRunId: null,
      recentRuns: [],
      recentRunsLoading: false,
      recentRunsError: null,
      timeline: null,
      timelineLoading: false,
      timelineError: null
    });
  });

  it('persists and normalizes selected runs through an injected storage adapter', () => {
    const storage = createStorage();
    const storageKey = getSelectedRunStorageKey('thread-1');

    persistSelectedRunId('thread-1', ' run-1 ', storage);

    expect(storage.setItem).toHaveBeenCalledWith(storageKey, 'run-1');
    expect(readPersistedRunId('thread-1', storage)).toBe('run-1');

    persistSelectedRunId('thread-1', '   ', storage);

    expect(storage.removeItem).toHaveBeenCalledWith(storageKey);
    expect(readPersistedRunId('thread-1', storage)).toBeNull();
  });
});
