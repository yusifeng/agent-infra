import type { MessageDto, RunDto, RunTimelineResponseDto, RuntimePiMetaDto, ThreadDto } from '@agent-infra/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { runSendMessageFlow } from '../src/runtime/send-message-flow';
import type { LiveAssistantDraft } from '../src/types/live-assistant-draft';

const { openThreadRunStreamMock } = vi.hoisted(() => ({
  openThreadRunStreamMock: vi.fn()
}));

vi.mock('../src/repo/chat-api.js', () => ({
  openThreadRunStream: openThreadRunStreamMock
}));

type Updater<T> = T | ((current: T) => T);

function createSetterSpy<T>() {
  return vi.fn<(next: Updater<T>) => void>();
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

function createSelectedModelOption(): RuntimePiMetaDto['modelOptions'][number] {
  return {
    key: 'deepseek:deepseek-chat',
    provider: 'deepseek',
    model: 'deepseek-chat',
    label: 'DeepSeek',
    description: 'DeepSeek Chat'
  };
}

function createMessage(id: string, seq: number): MessageDto {
  return {
    id,
    threadId: 'thread-existing',
    runId: null,
    role: 'assistant',
    seq,
    status: 'completed',
    metadata: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    parts: []
  };
}

function createRefs() {
  return {
    activeThreadIdRef: { current: null as string | null },
    logOpenRef: { current: false },
    selectedRunIdRef: { current: null as string | null },
    sendAbortControllerRef: { current: null as AbortController | null },
    sendRequestIdRef: { current: 0 },
    shouldAutoScrollRef: { current: false },
    timelineAbortControllerRef: { current: null as AbortController | null },
    timelineRequestIdRef: { current: 0 }
  };
}

function createActions() {
  return {
    setActiveThreadId: createSetterSpy<string | null>(),
    setActiveResponseRun: createSetterSpy<RunDto | null>(),
    setChatPhase: createSetterSpy<'idle' | 'thinking' | 'streaming' | 'transcript-final' | 'failed'>(),
    setDraft: createSetterSpy<string>(),
    setError: createSetterSpy<string | null>(),
    setLiveAssistantDraft: createSetterSpy<LiveAssistantDraft | null>(),
    setLiveStreamRunId: createSetterSpy<string | null>(),
    setLoadingThreadId: createSetterSpy<string | null>(),
    setMessages: createSetterSpy<MessageDto[]>(),
    setOptimisticUserMessage: createSetterSpy<MessageDto | null>(),
    setPersistingTurn: createSetterSpy<boolean>(),
    setRecentRuns: createSetterSpy<RunDto[]>(),
    setSelectedRunId: createSetterSpy<string | null>(),
    setTimeline: createSetterSpy<RunTimelineResponseDto | null>(),
    setTimelineError: createSetterSpy<string | null>(),
    setTimelineLoading: createSetterSpy<boolean>()
  };
}

afterEach(() => {
  openThreadRunStreamMock.mockReset();
});

describe('runSendMessageFlow', () => {
  it('shows the optimistic user message before a new thread finishes creating', async () => {
    const createThreadDeferred = createDeferred<ThreadDto>();
    const refs = createRefs();
    const actions = createActions();

    openThreadRunStreamMock.mockResolvedValue({
      ok: false,
      status: 500,
      error: 'stream not needed',
      body: null
    });

    const flowPromise = runSendMessageFlow({
      state: {
        activeThreadId: null,
        draft: '你好',
        isChatResponding: false,
        messages: [createMessage('message-1', 1)],
        selectedModelOption: createSelectedModelOption()
      },
      refs,
      actions,
      operations: {
        createThreadRecord: () => createThreadDeferred.promise,
        pendingNewThreadLoadingId: 'pending-new-thread',
        reconcileCompletedTurn: vi.fn(),
        refreshThreads: vi.fn().mockResolvedValue([]),
        replaceCurrentPath: vi.fn()
      }
    });

    await Promise.resolve();

    expect(actions.setOptimisticUserMessage).toHaveBeenCalledTimes(1);
    expect(actions.setOptimisticUserMessage.mock.calls[0]?.[0]).toMatchObject({
      id: 'optimistic-user-1',
      threadId: 'pending-thread-1',
      role: 'user',
      seq: 2
    });
    expect(actions.setLiveAssistantDraft).toHaveBeenCalledWith({
      runId: 'pending-1',
      messageId: 'pending-assistant-1',
      partialText: '',
      partialReasoning: null,
      eventType: 'start'
    });

    createThreadDeferred.resolve({
      id: 'thread-1',
      appId: 'playground',
      title: 'New thread',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    });

    await flowPromise;
  });
});
