import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchThreadMessagesResponse = vi.fn();
const fetchThreadRunsResponse = vi.fn();
const fetchThreads = vi.fn();

vi.mock('@/features/durable-chat/repo/chat-api', () => ({
  fetchThreads: (...args: unknown[]) => fetchThreads(...args),
  fetchThreadMessages: (...args: unknown[]) => fetchThreadMessagesResponse(...args),
  fetchThreadRuns: (...args: unknown[]) => fetchThreadRunsResponse(...args)
}));

describe('replay api repo facade', () => {
  beforeEach(() => {
    fetchThreadMessagesResponse.mockReset();
    fetchThreadRunsResponse.mockReset();
    fetchThreads.mockReset();
  });

  it('loads all replay thread message pages before returning basis data', async () => {
    fetchThreads.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { threads: [{ id: 'thread-1', title: 'Replay thread' }] }
    });
    fetchThreadRunsResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { items: [] }
    });
    fetchThreadMessagesResponse
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        error: null,
        data: {
          messages: [{ id: 'message-2' }],
          pageInfo: { hasOlder: true, hasNewer: false, startCursor: 'cursor-2', endCursor: 'cursor-3' },
          activeRun: null
        }
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        error: null,
        data: {
          messages: [{ id: 'message-1' }],
          pageInfo: { hasOlder: false, hasNewer: false, startCursor: null, endCursor: 'cursor-1' },
          activeRun: null
        }
      });

    const { fetchReplayThreadBasis } = await import('@/features/durable-chat/repo/replay-api');
    const result = await fetchReplayThreadBasis('thread-1');

    expect(fetchThreadMessagesResponse).toHaveBeenNthCalledWith(
      1,
      'thread-1',
      expect.objectContaining({ before: null, limit: 100 })
    );
    expect(fetchThreadMessagesResponse).toHaveBeenNthCalledWith(
      2,
      'thread-1',
      expect.objectContaining({ before: 'cursor-2', limit: 100 })
    );
    expect(result).toMatchObject({
      ok: true,
      data: {
        messages: [{ id: 'message-1' }, { id: 'message-2' }]
      }
    });
  });

  it('surfaces upstream errors without masking them', async () => {
    fetchThreads.mockResolvedValue({
      ok: false,
      status: 500,
      error: 'threads failed',
      data: { threads: [] }
    });
    fetchThreadRunsResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { items: [] }
    });
    fetchThreadMessagesResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { messages: [], pageInfo: null, activeRun: null }
    });

    const { fetchReplayThreadBasis } = await import('@/features/durable-chat/repo/replay-api');
    const result = await fetchReplayThreadBasis('thread-1');

    expect(result).toEqual({
      ok: false,
      status: 500,
      error: 'threads failed',
      data: null
    });
  });
});
