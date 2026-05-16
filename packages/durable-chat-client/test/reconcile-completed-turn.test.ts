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

function resolveUpdater<T>(value: Updater<T>, current: T) {
  return typeof value === 'function' ? (value as (current: T) => T)(current) : value;
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

function createVisibleAssistantMessage(id: string, seq: number, runId = 'run-1'): MessageDto {
  return {
    ...createMessage(id, seq),
    runId,
    role: 'assistant',
    parts: [
      {
        id: `${id}-part-1`,
        messageId: id,
        partIndex: 0,
        type: 'text',
        textValue: 'durable assistant response',
        jsonValue: null,
        createdAt: '2026-01-01T00:00:00.000Z'
      }
    ]
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
      setLiveAssistantDraft: createSetterSpy<any>(),
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
    const nextDraft = resolveUpdater(actions.setLiveAssistantDraft.mock.calls[0]?.[0], null);
    expect(nextDraft).toBeNull();
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

  it('clears the live assistant draft when the first reconcile message fetch fails', async () => {
    fetchThreadMessagesResponseMock.mockResolvedValue({
      ok: false,
      status: 500,
      error: 'messages exploded'
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

    expect(actions.setLiveAssistantDraft).toHaveBeenCalledWith(null);
    expect(actions.setError).toHaveBeenCalledWith('messages exploded');
  });

  it('clears a restored live draft after a non-send reconcile loads durable assistant content for the same run', async () => {
    const durableAssistantMessage = createVisibleAssistantMessage('assistant-message-1', 2, 'run-1');
    fetchThreadMessagesResponseMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        messages: [durableAssistantMessage],
        pageInfo: {
          hasOlder: true,
          hasNewer: false,
          startCursor: 'cursor-2',
          endCursor: 'cursor-2'
        },
        activeRun: null
      }
    });

    const actions = {
      setActiveResponseRun: createSetterSpy<RunDto | null>(),
      setChatPhase: createSetterSpy<'idle' | 'thinking' | 'streaming' | 'transcript-final' | 'failed'>(),
      setError: createSetterSpy<string | null>(),
      setLiveAssistantDraft: createSetterSpy<any>(),
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
      requestId: 7,
      state: {
        messages: [createMessage('message-1', 1)],
        pageInfo: {
          hasOlder: false,
          hasNewer: false,
          startCursor: 'cursor-1',
          endCursor: 'cursor-1'
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

    const nextDraft = resolveUpdater(actions.setLiveAssistantDraft.mock.calls[0]?.[0], {
      runId: 'run-1',
      messageId: 'assistant-live',
      source: 'restored',
      committedText: '',
      partialText: '',
      segmentText: '',
      segmentTextMessageId: 'assistant-live',
      partialReasoning: null,
      segmentReasoningMessageId: null,
      activeTools: [],
      eventType: 'text_end',
      segments: []
    });

    expect(actions.setMessages).toHaveBeenCalledWith([createMessage('message-1', 1), durableAssistantMessage]);
    expect(nextDraft).toBeNull();
    expect(actions.setOptimisticUserMessage).not.toHaveBeenCalled();
  });

  it('keeps a current live draft when completed reconcile has not loaded durable assistant content yet', async () => {
    fetchThreadMessagesResponseMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        messages: [],
        pageInfo: {
          hasOlder: true,
          hasNewer: false,
          startCursor: null,
          endCursor: null
        },
        activeRun: null
      }
    });

    const actions = {
      setActiveResponseRun: createSetterSpy<RunDto | null>(),
      setChatPhase: createSetterSpy<'idle' | 'thinking' | 'streaming' | 'transcript-final' | 'failed'>(),
      setError: createSetterSpy<string | null>(),
      setLiveAssistantDraft: createSetterSpy<any>(),
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
        messages: [createMessage('message-1', 1)],
        pageInfo: {
          hasOlder: false,
          hasNewer: false,
          startCursor: 'cursor-1',
          endCursor: 'cursor-1'
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

    const currentDraft = {
      runId: 'run-1',
      messageId: 'assistant-live',
      source: 'restored',
      committedText: 'still visible',
      partialText: 'still visible',
      segmentText: 'still visible',
      segmentTextMessageId: 'assistant-live',
      partialReasoning: null,
      segmentReasoningMessageId: null,
      activeTools: [],
      eventType: 'text_end',
      segments: [
        {
          id: 'assistant-live:0',
          messageId: 'assistant-live',
          text: 'still visible',
          reasoning: null,
          tools: [],
          eventType: 'text_end'
        }
      ]
    };
    const nextDraft = resolveUpdater(actions.setLiveAssistantDraft.mock.calls[0]?.[0], currentDraft);

    expect(actions.setMessages).toHaveBeenCalledWith([createMessage('message-1', 1)]);
    expect(actions.setOptimisticUserMessage).toHaveBeenCalledWith(null);
    expect(nextDraft).toBe(currentDraft);
  });

  it('keeps a current live draft when durable reconcile only loads an empty assistant shell for the same run', async () => {
    const emptyAssistantShell: MessageDto = {
      ...createMessage('assistant-shell-1', 2),
      role: 'assistant',
      runId: 'run-1',
      parts: [
        {
          id: 'assistant-shell-1:text',
          messageId: 'assistant-shell-1',
          partIndex: 0,
          type: 'text',
          textValue: '   ',
          jsonValue: null,
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ]
    };
    fetchThreadMessagesResponseMock.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        messages: [emptyAssistantShell],
        pageInfo: {
          hasOlder: true,
          hasNewer: false,
          startCursor: 'cursor-2',
          endCursor: 'cursor-2'
        },
        activeRun: null
      }
    });

    const actions = {
      setActiveResponseRun: createSetterSpy<RunDto | null>(),
      setChatPhase: createSetterSpy<'idle' | 'thinking' | 'streaming' | 'transcript-final' | 'failed'>(),
      setError: createSetterSpy<string | null>(),
      setLiveAssistantDraft: createSetterSpy<any>(),
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
        messages: [createMessage('message-1', 1)],
        pageInfo: {
          hasOlder: false,
          hasNewer: false,
          startCursor: 'cursor-1',
          endCursor: 'cursor-1'
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

    const currentDraft = {
      runId: 'run-1',
      messageId: 'assistant-live',
      source: 'restored',
      committedText: 'visible live content',
      partialText: 'visible live content',
      segmentText: 'visible live content',
      segmentTextMessageId: 'assistant-live',
      partialReasoning: null,
      segmentReasoningMessageId: null,
      activeTools: [],
      eventType: 'text_end',
      segments: [
        {
          id: 'assistant-live:0',
          messageId: 'assistant-live',
          text: 'visible live content',
          reasoning: null,
          tools: [],
          eventType: 'text_end'
        }
      ]
    };
    const nextDraft = resolveUpdater(actions.setLiveAssistantDraft.mock.calls[0]?.[0], currentDraft);

    expect(actions.setMessages).toHaveBeenCalledWith([createMessage('message-1', 1), emptyAssistantShell]);
    expect(nextDraft).toBe(currentDraft);
  });
});
