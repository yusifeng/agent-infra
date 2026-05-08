import type { ToolInvocationDto } from '@agent-infra/contracts';
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
    vi.unstubAllGlobals();
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

  it('filters search tool invocations for search panel loading', async () => {
    const expected = {
      ok: true,
      status: 200,
      data: {
        toolInvocations: [
          {
            id: 'inv-1',
            threadId: 'thread-1',
            runId: 'run-1',
            messageId: 'message-1',
            toolCallId: 'call-1',
            toolName: 'searchWeb'
          },
          {
            id: 'inv-2',
            threadId: 'thread-1',
            runId: 'run-1',
            messageId: 'message-1',
            toolCallId: 'call-2',
            toolName: 'otherTool'
          },
          {
            id: 'inv-3',
            threadId: 'thread-1',
            runId: 'run-1',
            messageId: 'message-1',
            toolCallId: 'call-3',
            toolName: 'searchWeb'
          }
        ] as ToolInvocationDto[]
      },
      error: null
    };
    fetchRunTimelineResponse.mockResolvedValue(expected);

    const { fetchSearchToolInvocations } = await import('@/features/durable-chat/repo/chat-api');
    const result = await fetchSearchToolInvocations('run-1', ['call-1', 'call-3']);

    expect(fetchRunTimelineResponse).toHaveBeenCalledWith('run-1', undefined);
    expect(result).toMatchObject({
      ok: true,
      data: {
        toolInvocations: [
          expect.objectContaining({ toolCallId: 'call-1', toolName: 'searchWeb' }),
          expect.objectContaining({ toolCallId: 'call-3', toolName: 'searchWeb' })
        ]
      }
    });
  });

  it('renames threads through the thread management route', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        thread: {
          id: 'thread-1',
          appId: 'playground-vite-web',
          title: 'Renamed thread',
          status: 'active',
          metadata: null,
          createdAt: '2026-05-09T00:00:00.000Z',
          updatedAt: '2026-05-09T00:01:00.000Z',
          archivedAt: null
        }
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const { renameThread } = await import('@/features/durable-chat/repo/chat-api');
    const signal = new AbortController().signal;
    const result = await renameThread('thread-1', 'Renamed thread', signal);

    expect(fetchMock).toHaveBeenCalledWith('/api/threads/thread-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Renamed thread' }),
      signal
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        thread: expect.objectContaining({ id: 'thread-1', title: 'Renamed thread' })
      }
    });
  });

  it('archives threads through the thread management route', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        thread: {
          id: 'thread-1',
          appId: 'playground-vite-web',
          title: 'Archived thread',
          status: 'archived',
          metadata: null,
          createdAt: '2026-05-09T00:00:00.000Z',
          updatedAt: '2026-05-09T00:02:00.000Z',
          archivedAt: '2026-05-09T00:02:00.000Z'
        }
      })
    });
    vi.stubGlobal('fetch', fetchMock);

    const { archiveThread } = await import('@/features/durable-chat/repo/chat-api');
    const signal = new AbortController().signal;
    const result = await archiveThread('thread-1', signal);

    expect(fetchMock).toHaveBeenCalledWith('/api/threads/thread-1/archive', {
      method: 'POST',
      signal
    });
    expect(result).toMatchObject({
      ok: true,
      data: {
        thread: expect.objectContaining({ id: 'thread-1', status: 'archived' })
      }
    });
  });
});
