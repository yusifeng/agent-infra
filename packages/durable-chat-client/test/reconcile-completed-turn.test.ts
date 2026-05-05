import type { MessageDto, RunDto } from '@agent-infra/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runReconcileCompletedTurn } from '../src/runtime/reconcile-completed-turn';

const { fetchThreadMessagesResponseMock, fetchThreadRunsResponseMock, fetchRunTimelineResponseMock } = vi.hoisted(() => ({
  fetchThreadMessagesResponseMock: vi.fn(),
  fetchThreadRunsResponseMock: vi.fn(),
  fetchRunTimelineResponseMock: vi.fn()
}));

vi.mock('../src/repo/chat-api.js', () => ({
  fetchRunTimelineResponse: fetchRunTimelineResponseMock,
  fetchThreadMessagesResponse: fetchThreadMessagesResponseMock,
  fetchThreadRunsResponse: fetchThreadRunsResponseMock
}));

type Updater<T> = T | ((current: T) => T);

function createSetterSpy<T>() {
  return vi.fn<(next: Updater<T>) => void>();
}

function createMessage(id: string, seq: number): MessageDto {
  return {
    id,
    threadId: 'thread-1',
    runId: seq >= 3 ? 'run-1' : null,
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
  fetchThreadRunsResponseMock.mockReset();
  fetchRunTimelineResponseMock.mockReset();
});

describe('runReconcileCompletedTurn', () => {
  it('uses after(endCursor) for incremental durable catch-up', async () => {
    fetchThreadMessagesResponseMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        messages: [createMessage('message-3', 3), createMessage('message-4', 4)],
        pageInfo: {
          hasOlder: true,
          hasNewer: false,
          startCursor: 'cursor-3',
          endCursor: 'cursor-4'
        },
        activeRun: null
      }
    });

    const actions = {
      setActiveResponseRun: createSetterSpy<RunDto | null>(),
      setChatPhase: createSetterSpy<'idle' | 'thinking' | 'streaming' | 'transcript-final' | 'failed'>(),
      setError: createSetterSpy<string | null>(),
      setLiveAssistantDraft: createSetterSpy<null>(),
      setLoadingThreadId: createSetterSpy<string | null>(),
      setMessages: createSetterSpy<MessageDto[]>(),
      setMessagePageInfo: createSetterSpy<{
        hasOlder: boolean;
        hasNewer: boolean;
        startCursor: string | null;
        endCursor: string | null;
      } | null>(),
      setOptimisticUserMessage: createSetterSpy<MessageDto | null>(),
      setPersistingTurn: createSetterSpy<boolean>(),
      setRecentRuns: createSetterSpy<never[]>(),
      setRecentRunsError: createSetterSpy<string | null>(),
      setRecentRunsLoading: createSetterSpy<boolean>(),
      setSelectedRunId: createSetterSpy<string | null>(),
      setTimeline: createSetterSpy<null>(),
      setTimelineError: createSetterSpy<string | null>(),
      setTimelineLoading: createSetterSpy<boolean>()
    };

    await runReconcileCompletedTurn({
      threadId: 'thread-1',
      preferredRunId: 'run-1',
      requestId: 4,
      state: {
        messages: [createMessage('message-1', 1), createMessage('message-2', 2)],
        pageInfo: {
          hasOlder: true,
          hasNewer: false,
          startCursor: 'cursor-1',
          endCursor: 'cursor-2'
        }
      },
      refs: {
        activeThreadIdRef: { current: 'thread-1' },
        logOpenRef: { current: false },
        reconcileRequestIdRef: { current: 0 },
        selectedRunIdRef: { current: null },
        sendRequestIdRef: { current: 4 }
      },
      actions
    });

    expect(fetchThreadMessagesResponseMock).toHaveBeenCalledWith('thread-1', {
      after: 'cursor-2',
      signal: expect.any(AbortSignal)
    });
    expect(actions.setMessages).toHaveBeenCalledWith([
      createMessage('message-1', 1),
      createMessage('message-2', 2),
      createMessage('message-3', 3),
      createMessage('message-4', 4)
    ]);
    expect(actions.setMessagePageInfo).toHaveBeenCalledWith({
      hasOlder: true,
      hasNewer: false,
      startCursor: 'cursor-1',
      endCursor: 'cursor-4'
    });
    expect(actions.setActiveResponseRun).toHaveBeenCalledWith(null);
    expect(actions.setOptimisticUserMessage).toHaveBeenCalledWith(null);
    expect(actions.setLiveAssistantDraft).toHaveBeenCalledWith(null);
  });

  it('preserves existing message identity when reconciling without page info', async () => {
    const currentUserMessage: MessageDto = {
      ...createMessage('message-1', 1),
      metadata: {
        clientRenderKey: 'optimistic-user-2'
      }
    };
    const currentAssistantMessage = createMessage('message-2', 2);
    fetchThreadMessagesResponseMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        messages: [
          {
            ...createMessage('message-1', 1),
            metadata: {
              clientRenderKey: 'optimistic-user-2'
            }
          },
          createMessage('message-2', 2),
          createMessage('message-3', 3)
        ],
        pageInfo: {
          hasOlder: false,
          hasNewer: false,
          startCursor: 'cursor-1',
          endCursor: 'cursor-3'
        },
        activeRun: null
      }
    });

    const actions = {
      setActiveResponseRun: createSetterSpy<RunDto | null>(),
      setChatPhase: createSetterSpy<'idle' | 'thinking' | 'streaming' | 'transcript-final' | 'failed'>(),
      setError: createSetterSpy<string | null>(),
      setLiveAssistantDraft: createSetterSpy<null>(),
      setLoadingThreadId: createSetterSpy<string | null>(),
      setMessages: createSetterSpy<MessageDto[]>(),
      setMessagePageInfo: createSetterSpy<{
        hasOlder: boolean;
        hasNewer: boolean;
        startCursor: string | null;
        endCursor: string | null;
      } | null>(),
      setOptimisticUserMessage: createSetterSpy<MessageDto | null>(),
      setPersistingTurn: createSetterSpy<boolean>(),
      setRecentRuns: createSetterSpy<never[]>(),
      setRecentRunsError: createSetterSpy<string | null>(),
      setRecentRunsLoading: createSetterSpy<boolean>(),
      setSelectedRunId: createSetterSpy<string | null>(),
      setTimeline: createSetterSpy<null>(),
      setTimelineError: createSetterSpy<string | null>(),
      setTimelineLoading: createSetterSpy<boolean>()
    };

    await runReconcileCompletedTurn({
      threadId: 'thread-1',
      preferredRunId: null,
      requestId: 4,
      state: {
        messages: [currentUserMessage, currentAssistantMessage],
        pageInfo: null
      },
      refs: {
        activeThreadIdRef: { current: 'thread-1' },
        logOpenRef: { current: false },
        reconcileRequestIdRef: { current: 0 },
        selectedRunIdRef: { current: null },
        sendRequestIdRef: { current: 4 }
      },
      actions
    });

    expect(fetchThreadMessagesResponseMock).toHaveBeenCalledWith('thread-1', expect.any(AbortSignal));
    const reconciledMessages = actions.setMessages.mock.calls.at(0)?.[0];
    expect(Array.isArray(reconciledMessages)).toBe(true);
    expect(reconciledMessages).toHaveLength(3);
    expect(reconciledMessages?.[0]).toBe(currentUserMessage);
    expect(reconciledMessages?.[1]).toBe(currentAssistantMessage);
    expect(reconciledMessages?.[2]).toEqual(createMessage('message-3', 3));
    expect(reconciledMessages?.[0]?.metadata).toEqual({
      clientRenderKey: 'optimistic-user-2'
    });
    expect(actions.setMessagePageInfo).toHaveBeenCalledWith({
      hasOlder: false,
      hasNewer: false,
      startCursor: 'cursor-1',
      endCursor: 'cursor-3'
    });
  });
});
