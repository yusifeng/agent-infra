import type { MessageDto, ThreadMessagesPageInfoDto } from '@agent-infra/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runLoadOlderMessages } from '../src/runtime/load-thread-flow';
import { INITIAL_MESSAGE_PAGE_LIMIT } from '../src/service/chat-runtime';

const { fetchThreadMessagesResponseMock } = vi.hoisted(() => ({
  fetchThreadMessagesResponseMock: vi.fn()
}));

vi.mock('../src/repo/chat-api.js', () => ({
  fetchThreadMessagesResponse: fetchThreadMessagesResponseMock
}));

type Updater<T> = T | ((current: T) => T);

function createSetterSpy<T>() {
  return vi.fn<(next: Updater<T>) => void>();
}

function resolveUpdater<T>(update: Updater<T>, current: T) {
  return typeof update === 'function' ? (update as (value: T) => T)(current) : update;
}

function createMessage(id: string, seq: number): MessageDto {
  return {
    id,
    threadId: 'thread-1',
    runId: null,
    role: seq % 2 === 0 ? 'assistant' : 'user',
    seq,
    status: 'completed',
    metadata: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    parts: []
  };
}

afterEach(() => {
  fetchThreadMessagesResponseMock.mockReset();
});

describe('runLoadOlderMessages', () => {
  it('prepends an older message page and updates page info', async () => {
    fetchThreadMessagesResponseMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        messages: [createMessage('message-1', 1), createMessage('message-2', 2)],
        pageInfo: {
          hasOlder: false,
          hasNewer: true,
          startCursor: 'cursor-1',
          endCursor: 'cursor-2'
        }
      }
    });

    const setError = createSetterSpy<string | null>();
    const setHistoryLoading = createSetterSpy<boolean>();
    const setMessages = createSetterSpy<MessageDto[]>();
    const setMessagePageInfo = createSetterSpy<ThreadMessagesPageInfoDto | null>();

    const didApply = await runLoadOlderMessages({
      threadId: 'thread-1',
      beforeCursor: 'cursor-3',
      historyLoading: false,
      refs: {
        activeThreadIdRef: { current: 'thread-1' }
      },
      actions: {
        setError,
        setHistoryLoading,
        setMessages,
        setMessagePageInfo
      }
    });

    expect(didApply).toBe(true);
    expect(fetchThreadMessagesResponseMock).toHaveBeenCalledWith('thread-1', {
      before: 'cursor-3',
      limit: INITIAL_MESSAGE_PAGE_LIMIT
    });
    expect(setError).toHaveBeenNthCalledWith(1, null);
    expect(setHistoryLoading).toHaveBeenNthCalledWith(1, true);
    expect(setHistoryLoading).toHaveBeenLastCalledWith(false);

    const nextMessages = resolveUpdater(setMessages.mock.calls[0]?.[0], [createMessage('message-3', 3), createMessage('message-4', 4)]);
    expect(nextMessages).toEqual([
      createMessage('message-1', 1),
      createMessage('message-2', 2),
      createMessage('message-3', 3),
      createMessage('message-4', 4)
    ]);

    const nextPageInfo = resolveUpdater<ThreadMessagesPageInfoDto | null>(
      setMessagePageInfo.mock.calls[0]?.[0],
      {
        hasOlder: true,
        hasNewer: false,
        startCursor: 'cursor-3',
        endCursor: 'cursor-4'
      }
    );
    expect(nextPageInfo).toEqual({
      hasOlder: false,
      hasNewer: false,
      startCursor: 'cursor-1',
      endCursor: 'cursor-4'
    });
  });

  it('ignores stale older-page responses after thread switch', async () => {
    fetchThreadMessagesResponseMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        messages: [createMessage('message-1', 1)],
        pageInfo: {
          hasOlder: false,
          hasNewer: true,
          startCursor: 'cursor-1',
          endCursor: 'cursor-1'
        }
      }
    });

    const setMessages = createSetterSpy<MessageDto[]>();
    const setMessagePageInfo = createSetterSpy<ThreadMessagesPageInfoDto | null>();

    const didApply = await runLoadOlderMessages({
      threadId: 'thread-1',
      beforeCursor: 'cursor-2',
      historyLoading: false,
      refs: {
        activeThreadIdRef: { current: 'thread-2' }
      },
      actions: {
        setError: createSetterSpy<string | null>(),
        setHistoryLoading: createSetterSpy<boolean>(),
        setMessages,
        setMessagePageInfo
      }
    });

    expect(didApply).toBe(false);
    expect(setMessages).not.toHaveBeenCalled();
    expect(setMessagePageInfo).not.toHaveBeenCalled();
  });

  it('surfaces fetch failures as load-older errors', async () => {
    fetchThreadMessagesResponseMock.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'upstream unavailable',
      data: {
        messages: [],
        pageInfo: null
      }
    });

    const setError = createSetterSpy<string | null>();

    const didApply = await runLoadOlderMessages({
      threadId: 'thread-1',
      beforeCursor: 'cursor-2',
      historyLoading: false,
      refs: {
        activeThreadIdRef: { current: 'thread-1' }
      },
      actions: {
        setError,
        setHistoryLoading: createSetterSpy<boolean>(),
        setMessages: createSetterSpy<MessageDto[]>(),
        setMessagePageInfo: createSetterSpy<ThreadMessagesPageInfoDto | null>()
      }
    });

    expect(didApply).toBe(false);
    expect(setError).toHaveBeenLastCalledWith('upstream unavailable');
  });
});
