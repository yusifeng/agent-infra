import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchReplayThreadMessages } from './replay-api';

function createMessage(id: string, seq: number) {
  return {
    id,
    threadId: 'thread-1',
    runId: null,
    role: seq % 2 === 0 ? 'assistant' : 'user',
    seq,
    status: 'completed',
    metadata: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    parts: [
      {
        id: `${id}-part`,
        messageId: id,
        partIndex: 0,
        type: 'text',
        textValue: id,
        jsonValue: null,
        createdAt: '2026-01-01T00:00:00.000Z'
      }
    ]
  };
}

describe('replay api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads all replay message pages in transcript order', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          messages: [createMessage('message-3', 3), createMessage('message-4', 4)],
          pageInfo: {
            hasOlder: true,
            hasNewer: false,
            startCursor: 'cursor-3',
            endCursor: 'cursor-4'
          },
          activeRun: null
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          messages: [createMessage('message-1', 1), createMessage('message-2', 2)],
          pageInfo: {
            hasOlder: false,
            hasNewer: true,
            startCursor: 'cursor-1',
            endCursor: 'cursor-2'
          },
          activeRun: null
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchReplayThreadMessages('thread-1');

    expect(result.ok).toBe(true);
    expect(result.data.messages.map((message) => message.id)).toEqual([
      'message-1',
      'message-2',
      'message-3',
      'message-4'
    ]);
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/threads/thread-1/messages?limit=100&before=cursor-3',
      expect.objectContaining({ signal: undefined })
    );
  });
});
