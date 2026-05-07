import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchRunTimelineResponse = vi.fn();
const fetchThreadMessagesResponse = vi.fn();
const fetchThreadRunsResponse = vi.fn();

vi.mock('@agent-infra/durable-chat-client', () => ({
  fetchRunTimelineResponse,
  fetchThreadMessagesResponse,
  fetchThreadRunsResponse
}));

describe('chat api repo facade', () => {
  beforeEach(() => {
    fetchRunTimelineResponse.mockReset();
    fetchThreadMessagesResponse.mockReset();
    fetchThreadRunsResponse.mockReset();
  });

  it('forwards thread message requests with options', async () => {
    const expected = { ok: true, status: 200, data: { messages: [], pageInfo: null, activeRun: null }, error: null };
    fetchThreadMessagesResponse.mockResolvedValue(expected);

    const { fetchThreadMessages } = await import('@/features/durable-chat/repo/chat-api');
    const signal = new AbortController().signal;
    const result = await fetchThreadMessages('thread-1', { limit: 20, signal });

    expect(fetchThreadMessagesResponse).toHaveBeenCalledWith('thread-1', { limit: 20, signal });
    expect(result).toBe(expected);
  });

  it('forwards run timeline requests and preserves error responses', async () => {
    const expected = { ok: false, status: 500, data: null, error: 'boom' };
    fetchRunTimelineResponse.mockResolvedValue(expected);

    const { fetchRunTimeline } = await import('@/features/durable-chat/repo/chat-api');
    const signal = new AbortController().signal;
    const result = await fetchRunTimeline('run-1', signal);

    expect(fetchRunTimelineResponse).toHaveBeenCalledWith('run-1', signal);
    expect(result).toBe(expected);
  });

  it('forwards thread run requests', async () => {
    const expected = { ok: true, status: 200, data: { runs: [] }, error: null };
    fetchThreadRunsResponse.mockResolvedValue(expected);

    const { fetchThreadRuns } = await import('@/features/durable-chat/repo/chat-api');
    const signal = new AbortController().signal;
    const result = await fetchThreadRuns('thread-1', 10, signal);

    expect(fetchThreadRunsResponse).toHaveBeenCalledWith('thread-1', 10, signal);
    expect(result).toBe(expected);
  });
});
