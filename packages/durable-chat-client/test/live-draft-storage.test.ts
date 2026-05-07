import { describe, expect, it, vi } from 'vitest';

import {
  clearPersistedLiveAssistantDraft,
  getLiveDraftStorageKey,
  persistLiveAssistantDraft,
  readPersistedLiveAssistantDraft,
  type StorageLike
} from '../src';

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

const draft = {
  runId: 'run-1',
  messageId: 'message-1',
  source: 'live' as const,
  committedText: '',
  partialText: '正在搜索 Claude 新闻',
  segmentText: '正在搜索 Claude 新闻',
  segmentTextMessageId: 'message-1',
  partialReasoning: null,
  segmentReasoningMessageId: null,
  activeTools: [],
  eventType: 'streaming' as const,
  segments: [
    {
      id: 'message-1:0',
      messageId: 'message-1',
      text: '正在搜索 Claude 新闻',
      reasoning: null,
      tools: [],
      eventType: 'streaming' as const
    }
  ]
};

describe('live draft storage', () => {
  it('persists and restores a live assistant draft through injected storage', () => {
    const storage = createStorage();

    persistLiveAssistantDraft('thread-1', draft, storage);

    expect(storage.setItem).toHaveBeenCalledWith(getLiveDraftStorageKey('thread-1'), JSON.stringify(draft));
    expect(readPersistedLiveAssistantDraft('thread-1', storage)).toEqual(draft);
  });

  it('clears the stored draft', () => {
    const storage = createStorage();
    persistLiveAssistantDraft('thread-1', draft, storage);

    clearPersistedLiveAssistantDraft('thread-1', storage);

    expect(storage.removeItem).toHaveBeenCalledWith(getLiveDraftStorageKey('thread-1'));
    expect(readPersistedLiveAssistantDraft('thread-1', storage)).toBeNull();
  });
});
