import type { LiveAssistantDraft } from '@agent-infra/durable-chat-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearStoredLiveAssistantDraft,
  persistStoredLiveAssistantDraft,
  readStoredLiveAssistantDraft
} from '@/features/durable-chat/repo/live-draft-storage';

function createStorage() {
  const data = new Map<string, string>();

  return {
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    get length() {
      return data.size;
    }
  } satisfies Storage;
}

function createDraft(): LiveAssistantDraft {
  return {
    runId: 'run-1',
    messageId: 'assistant-1',
    source: 'live',
    committedText: 'hello',
    partialText: '',
    segmentText: '',
    segmentTextMessageId: null,
    partialReasoning: null,
    segmentReasoningMessageId: null,
    activeTools: [],
    eventType: 'streaming',
    segments: []
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('live draft storage repo', () => {
  it('reads/writes/clears drafts through window.sessionStorage', () => {
    const storage = createStorage();
    vi.stubGlobal('window', { sessionStorage: storage });

    persistStoredLiveAssistantDraft('thread-1', createDraft());
    expect(readStoredLiveAssistantDraft('thread-1')).toEqual(createDraft());

    clearStoredLiveAssistantDraft('thread-1');
    expect(readStoredLiveAssistantDraft('thread-1')).toBeNull();
  });

  it('gracefully falls back when window is unavailable', () => {
    expect(readStoredLiveAssistantDraft('thread-1')).toBeNull();
    expect(() => persistStoredLiveAssistantDraft('thread-1', createDraft())).not.toThrow();
    expect(() => clearStoredLiveAssistantDraft('thread-1')).not.toThrow();
  });
});
