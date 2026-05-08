import { describe, expect, it, vi } from 'vitest';

import { readStoredPinnedThreadIds, writeStoredPinnedThreadIds } from './thread-pin-storage';

describe('thread pin storage repo', () => {
  it('reads pinned thread ids from storage and ignores invalid values', () => {
    const storage = {
      getItem: vi.fn().mockReturnValue(JSON.stringify(['thread-2', '', 42, 'thread-1']))
    };

    expect(readStoredPinnedThreadIds(storage)).toEqual(['thread-2', 'thread-1']);
  });

  it('falls back to an empty list when storage contains invalid json', () => {
    const storage = {
      getItem: vi.fn().mockReturnValue('{')
    };

    expect(readStoredPinnedThreadIds(storage)).toEqual([]);
  });

  it('writes pinned thread ids back to storage', () => {
    const storage = {
      setItem: vi.fn()
    };

    writeStoredPinnedThreadIds(['thread-3', 'thread-1'], storage);

    expect(storage.setItem).toHaveBeenCalledWith('durable-chat:pinned-thread-ids', JSON.stringify(['thread-3', 'thread-1']));
  });
});
