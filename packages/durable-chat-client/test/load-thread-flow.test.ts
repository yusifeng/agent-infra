import type { MessageDto, RunDto, ThreadMessagesPageInfoDto } from '@agent-infra/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyHydratedTranscriptState, runActivateThread, runLoadOlderMessages, runLoadThreadMessages } from '../src/runtime/load-thread-flow';
import { INITIAL_MESSAGE_PAGE_LIMIT } from '../src/service/chat-runtime';
import type { DurableRecoveryState } from '../src/types/runtime';

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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
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

function createRun(id: string, status: RunDto['status']): RunDto {
  return {
    id,
    threadId: 'thread-1',
    triggerMessageId: null,
    provider: 'openai',
    model: 'gpt-4o-mini',
    status,
    usage: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z'
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
        },
        activeRun: null
      }
    });

    const setError = createSetterSpy<string | null>();
    const setHistoryLoading = createSetterSpy<boolean>();
    const setMessages = createSetterSpy<MessageDto[]>();
    const setMessagePageInfo = createSetterSpy<ThreadMessagesPageInfoDto | null>();
    const setActiveResponseRun = createSetterSpy<RunDto | null>();

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
        setMessagePageInfo,
        setActiveResponseRun
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
    expect(setActiveResponseRun).toHaveBeenCalledWith(null);
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
        },
        activeRun: null
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
        setMessagePageInfo,
        setActiveResponseRun: createSetterSpy<RunDto | null>()
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
        pageInfo: null,
        activeRun: null
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
        setMessagePageInfo: createSetterSpy<ThreadMessagesPageInfoDto | null>(),
        setActiveResponseRun: createSetterSpy<RunDto | null>()
      }
    });

    expect(didApply).toBe(false);
    expect(setError).toHaveBeenLastCalledWith('upstream unavailable');
  });
});

describe('runLoadThreadMessages', () => {
  it('hydrates activeResponseRun from durable thread state', async () => {
    const setActiveResponseRun = createSetterSpy<RunDto | null>();
    const applyHydratedTranscript = vi.fn();

    const result = await runLoadThreadMessages({
      threadId: 'thread-1',
      refs: {
        activeThreadIdRef: { current: 'thread-1' },
        logOpenRef: { current: false },
        messagesAbortControllerRef: { current: null },
        messagesRequestIdRef: { current: 0 }
      },
      actions: {
        setActiveResponseRun,
        setError: createSetterSpy<string | null>(),
        setHistoryLoading: createSetterSpy<boolean>(),
        setLiveAssistantDraft: createSetterSpy<any>(),
        setLoadingMessages: createSetterSpy<boolean>(),
        setMessagePageInfo: createSetterSpy<ThreadMessagesPageInfoDto | null>(),
        setOptimisticUserMessage: createSetterSpy<MessageDto | null>(),
        setRecentRunsError: createSetterSpy<string | null>(),
        setRecentRunsLoading: createSetterSpy<boolean>()
      },
      operations: {
        applyHydratedTranscript,
        hydrateTranscript: vi.fn().mockResolvedValue({
          messages: [createMessage('message-1', 1)],
          pageInfo: null,
          activeResponseRun: {
            id: 'run-active',
            threadId: 'thread-1',
            triggerMessageId: null,
            provider: 'openai',
            model: 'gpt-4o-mini',
            status: 'running',
            usage: null,
            error: null,
            startedAt: '2026-01-01T00:00:00.000Z',
            finishedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z'
          }
        }),
        loadLogInspector: vi.fn(),
        resetLogInspectorState: vi.fn()
      }
    });

    expect(result).toEqual({
      ok: true,
      restoredRunId: null
    });
    expect(applyHydratedTranscript).toHaveBeenCalledWith({
      messages: [createMessage('message-1', 1)],
      pageInfo: null,
      activeResponseRun: expect.objectContaining({
        id: 'run-active',
        status: 'running'
      }),
      selectedRunId: null,
      runs: []
    });
    expect(setActiveResponseRun).not.toHaveBeenCalledWith(null);
  });

  it('does not apply stale thread-load responses after a newer load starts', async () => {
    const transcriptDeferred = createDeferred<{
      messages: MessageDto[];
      pageInfo: ThreadMessagesPageInfoDto | null;
      activeResponseRun: RunDto | null;
    }>();
    const messagesRequestIdRef = { current: 0 };
    const applyHydratedTranscript = vi.fn();
    const setLoadingMessages = createSetterSpy<boolean>();

    const loadPromise = runLoadThreadMessages({
      threadId: 'thread-1',
      refs: {
        activeThreadIdRef: { current: 'thread-1' },
        logOpenRef: { current: false },
        messagesAbortControllerRef: { current: null },
        messagesRequestIdRef
      },
      actions: {
        setActiveResponseRun: createSetterSpy<RunDto | null>(),
        setError: createSetterSpy<string | null>(),
        setHistoryLoading: createSetterSpy<boolean>(),
        setLiveAssistantDraft: createSetterSpy<any>(),
        setLoadingMessages,
        setMessagePageInfo: createSetterSpy<ThreadMessagesPageInfoDto | null>(),
        setOptimisticUserMessage: createSetterSpy<MessageDto | null>(),
        setRecentRunsError: createSetterSpy<string | null>(),
        setRecentRunsLoading: createSetterSpy<boolean>()
      },
      operations: {
        applyHydratedTranscript,
        hydrateTranscript: vi.fn().mockReturnValue(transcriptDeferred.promise),
        loadLogInspector: vi.fn(),
        resetLogInspectorState: vi.fn()
      }
    });

    await Promise.resolve();
    messagesRequestIdRef.current += 1;
    transcriptDeferred.resolve({
      messages: [createMessage('message-stale', 1)],
      pageInfo: null,
      activeResponseRun: null
    });

    await expect(loadPromise).resolves.toEqual({
      ok: false,
      restoredRunId: null
    });
    expect(applyHydratedTranscript).not.toHaveBeenCalled();
    expect(setLoadingMessages).toHaveBeenCalledWith(true);
    expect(setLoadingMessages).not.toHaveBeenCalledWith(false);
  });

  it('clears hydrated candidate state when thread load fails', async () => {
    const setAnswerCandidates = createSetterSpy<any[]>();
    const setAnswerSelections = createSetterSpy<any[]>();
    const setRunFeedback = createSetterSpy<any[]>();

    const result = await runLoadThreadMessages({
      threadId: 'thread-1',
      refs: {
        activeThreadIdRef: { current: 'thread-1' },
        logOpenRef: { current: false },
        messagesAbortControllerRef: { current: null },
        messagesRequestIdRef: { current: 0 }
      },
      actions: {
        setActiveResponseRun: createSetterSpy<RunDto | null>(),
        setActiveResponseRuns: createSetterSpy<RunDto[]>(),
        setAnswerCandidates,
        setAnswerSelections,
        setError: createSetterSpy<string | null>(),
        setHistoryLoading: createSetterSpy<boolean>(),
        setLiveAssistantDraft: createSetterSpy<any>(),
        setLiveAssistantDraftsByRunId: createSetterSpy<Record<string, any>>(),
        setLoadingMessages: createSetterSpy<boolean>(),
        setMessagePageInfo: createSetterSpy<ThreadMessagesPageInfoDto | null>(),
        setOptimisticUserMessage: createSetterSpy<MessageDto | null>(),
        setRecentRunsError: createSetterSpy<string | null>(),
        setRecentRunsLoading: createSetterSpy<boolean>(),
        setRunFeedback
      },
      operations: {
        applyHydratedTranscript: vi.fn(),
        hydrateTranscript: vi.fn().mockRejectedValue(new Error('load failed')),
        loadLogInspector: vi.fn(),
        resetLogInspectorState: vi.fn()
      }
    });

    expect(result).toEqual({
      ok: false,
      restoredRunId: null
    });
    expect(setAnswerCandidates).toHaveBeenCalledWith([]);
    expect(setAnswerSelections).toHaveBeenCalledWith([]);
    expect(setRunFeedback).toHaveBeenCalledWith([]);
  });
});

describe('applyHydratedTranscriptState', () => {
  it('hydrates multiple active runs and prunes restored drafts by run id', () => {
    const setActiveResponseRuns = createSetterSpy<RunDto[]>();
    const setLiveAssistantDraftsByRunId = createSetterSpy<Record<string, any>>();
    const actions = {
      setActiveResponseRun: createSetterSpy<RunDto | null>(),
      setActiveResponseRuns,
      setChatPhase: createSetterSpy<'idle' | 'thinking' | 'streaming' | 'transcript-final' | 'failed'>(),
      setError: createSetterSpy<string | null>(),
      setLiveAssistantDraft: createSetterSpy<any>(),
      setLiveAssistantDraftsByRunId,
      setMessages: createSetterSpy<MessageDto[]>(),
      setMessagePageInfo: createSetterSpy<ThreadMessagesPageInfoDto | null>(),
      setOptimisticUserMessage: createSetterSpy<MessageDto | null>(),
      setRecentRuns: createSetterSpy<RunDto[]>(),
      setRecentRunsError: createSetterSpy<string | null>(),
      setSelectedRunId: createSetterSpy<string | null>()
    };

    applyHydratedTranscriptState({
      messages: [
        {
          ...createMessage('assistant-message-1', 2),
          role: 'assistant',
          runId: 'run-a',
          parts: [
            {
              id: 'part-1',
              messageId: 'assistant-message-1',
              partIndex: 0,
              type: 'text',
              textValue: 'persisted A',
              jsonValue: null
            }
          ]
        }
      ],
      pageInfo: null,
      activeResponseRun: createRun('run-a', 'running'),
      activeResponseRuns: [createRun('run-a', 'running'), createRun('run-b', 'queued')],
      selectedRunId: null,
      runs: [],
      actions
    });

    const nextDrafts = resolveUpdater(setLiveAssistantDraftsByRunId.mock.calls[0]?.[0], {
      'run-a': {
        runId: 'run-a',
        messageId: 'assistant-a',
        source: 'restored',
        partialText: 'A',
        segments: []
      },
      'run-b': {
        runId: 'run-b',
        messageId: 'assistant-b',
        source: 'restored',
        partialText: 'B',
        segments: []
      },
      'run-old': {
        runId: 'run-old',
        messageId: 'assistant-old',
        source: 'restored',
        partialText: 'old',
        segments: []
      }
    });

    expect(setActiveResponseRuns).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'run-a' }),
      expect.objectContaining({ id: 'run-b' })
    ]);
    expect(Object.keys(nextDrafts)).toEqual(['run-b']);
  });

  it('keeps a restored live draft for the active running run even when selectedRunId is null', () => {
    const setLiveAssistantDraft = createSetterSpy<any>();
    const actions = {
      setActiveResponseRun: createSetterSpy<RunDto | null>(),
      setChatPhase: createSetterSpy<'idle' | 'thinking' | 'streaming' | 'transcript-final' | 'failed'>(),
      setError: createSetterSpy<string | null>(),
      setLiveAssistantDraft,
      setMessages: createSetterSpy<MessageDto[]>(),
      setMessagePageInfo: createSetterSpy<ThreadMessagesPageInfoDto | null>(),
      setOptimisticUserMessage: createSetterSpy<MessageDto | null>(),
      setRecentRuns: createSetterSpy<RunDto[]>(),
      setRecentRunsError: createSetterSpy<string | null>(),
      setSelectedRunId: createSetterSpy<string | null>()
    };

    applyHydratedTranscriptState({
      messages: [createMessage('message-1', 1)],
      pageInfo: null,
      activeResponseRun: {
        id: 'run-active',
        threadId: 'thread-1',
        triggerMessageId: null,
        provider: 'openai',
        model: 'gpt-4o-mini',
        status: 'running',
        usage: null,
        error: null,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z'
      },
      selectedRunId: null,
      runs: [],
      actions
    });

    const restoredDraft = resolveUpdater(
      setLiveAssistantDraft.mock.calls[0]?.[0],
      {
        runId: 'run-active',
        messageId: 'assistant-live',
        source: 'restored',
        committedText: '',
        partialText: '正在搜索 Claude',
        segmentText: '正在搜索 Claude',
        segmentTextMessageId: 'assistant-live',
        partialReasoning: null,
        segmentReasoningMessageId: null,
        activeTools: [],
        eventType: 'streaming',
        segments: [
          {
            id: 'assistant-live:0',
            messageId: 'assistant-live',
            text: '正在搜索 Claude',
            reasoning: null,
            tools: [],
            eventType: 'streaming'
          }
        ]
      }
    );

    expect(restoredDraft).toEqual({
      runId: 'run-active',
      messageId: 'assistant-live',
      source: 'restored',
      committedText: '',
      partialText: '正在搜索 Claude',
      segmentText: '正在搜索 Claude',
      segmentTextMessageId: 'assistant-live',
      partialReasoning: null,
      segmentReasoningMessageId: null,
      activeTools: [],
      eventType: 'streaming',
      segments: [
        {
          id: 'assistant-live:0',
          messageId: 'assistant-live',
          text: '正在搜索 Claude',
          reasoning: null,
          tools: [],
          eventType: 'streaming'
        }
      ]
    });
  });

  it('drops a restored live draft when durable assistant content for the active run is already present', () => {
    const setLiveAssistantDraft = createSetterSpy<any>();
    const actions = {
      setActiveResponseRun: createSetterSpy<RunDto | null>(),
      setChatPhase: createSetterSpy<'idle' | 'thinking' | 'streaming' | 'transcript-final' | 'failed'>(),
      setError: createSetterSpy<string | null>(),
      setLiveAssistantDraft,
      setMessages: createSetterSpy<MessageDto[]>(),
      setMessagePageInfo: createSetterSpy<ThreadMessagesPageInfoDto | null>(),
      setOptimisticUserMessage: createSetterSpy<MessageDto | null>(),
      setRecentRuns: createSetterSpy<RunDto[]>(),
      setRecentRunsError: createSetterSpy<string | null>(),
      setSelectedRunId: createSetterSpy<string | null>()
    };

    applyHydratedTranscriptState({
      messages: [
        {
          ...createMessage('assistant-message-1', 1),
          role: 'assistant',
          runId: 'run-active',
          parts: [
            {
              id: 'part-1',
              messageId: 'assistant-message-1',
              partIndex: 0,
              type: 'text',
              textValue: '根据搜索结果，这里有一些关于 Claude 的最新新闻摘要：',
              jsonValue: null
            }
          ]
        }
      ],
      pageInfo: null,
      activeResponseRun: {
        id: 'run-active',
        threadId: 'thread-1',
        triggerMessageId: null,
        provider: 'openai',
        model: 'gpt-4o-mini',
        status: 'running',
        usage: null,
        error: null,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z'
      },
      selectedRunId: null,
      runs: [],
      actions
    });

    const nextDraft = resolveUpdater(
      setLiveAssistantDraft.mock.calls[0]?.[0],
      {
        runId: 'run-active',
        messageId: 'assistant-live',
        source: 'restored',
        committedText: '',
        partialText: '好的，我来帮你搜索一下关于 Claude 的最新新闻！',
        segmentText: '好的，我来帮你搜索一下关于 Claude 的最新新闻！',
        segmentTextMessageId: 'assistant-live',
        partialReasoning: null,
        segmentReasoningMessageId: null,
        activeTools: [],
        eventType: 'streaming',
        segments: [
          {
            id: 'assistant-live:0',
            messageId: 'assistant-live',
            text: '好的，我来帮你搜索一下关于 Claude 的最新新闻！',
            reasoning: null,
            tools: [],
            eventType: 'streaming'
          }
        ]
      }
    );

    expect(nextDraft).toBeNull();
  });

  it('keeps a restored live draft when hydrate only has an empty durable assistant shell for the active run', () => {
    const setLiveAssistantDraft = createSetterSpy<any>();
    const actions = {
      setActiveResponseRun: createSetterSpy<RunDto | null>(),
      setChatPhase: createSetterSpy<'idle' | 'thinking' | 'streaming' | 'transcript-final' | 'failed'>(),
      setError: createSetterSpy<string | null>(),
      setLiveAssistantDraft,
      setMessages: createSetterSpy<MessageDto[]>(),
      setMessagePageInfo: createSetterSpy<ThreadMessagesPageInfoDto | null>(),
      setOptimisticUserMessage: createSetterSpy<MessageDto | null>(),
      setRecentRuns: createSetterSpy<RunDto[]>(),
      setRecentRunsError: createSetterSpy<string | null>(),
      setSelectedRunId: createSetterSpy<string | null>()
    };

    applyHydratedTranscriptState({
      messages: [
        {
          ...createMessage('assistant-shell-1', 1),
          role: 'assistant',
          runId: 'run-active',
          parts: [
            {
              id: 'part-1',
              messageId: 'assistant-shell-1',
              partIndex: 0,
              type: 'text',
              textValue: '   ',
              jsonValue: null
            }
          ]
        }
      ],
      pageInfo: null,
      activeResponseRun: {
        id: 'run-active',
        threadId: 'thread-1',
        triggerMessageId: null,
        provider: 'openai',
        model: 'gpt-4o-mini',
        status: 'running',
        usage: null,
        error: null,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z'
      },
      selectedRunId: null,
      runs: [],
      actions
    });

    const currentDraft = {
      runId: 'run-active',
      messageId: 'assistant-live',
      source: 'restored',
      committedText: '',
      partialText: '正在生成最终回复',
      segmentText: '正在生成最终回复',
      segmentTextMessageId: 'assistant-live',
      partialReasoning: null,
      segmentReasoningMessageId: null,
      activeTools: [],
      eventType: 'streaming',
      segments: [
        {
          id: 'assistant-live:0',
          messageId: 'assistant-live',
          text: '正在生成最终回复',
          reasoning: null,
          tools: [],
          eventType: 'streaming'
        }
      ]
    };
    const nextDraft = resolveUpdater(setLiveAssistantDraft.mock.calls[0]?.[0], currentDraft);

    expect(nextDraft).toBe(currentDraft);
  });
});

describe('runActivateThread', () => {
  it('does not apply active-thread state when the request guard is stale before activation', async () => {
    const setActiveThreadId = createSetterSpy<string | null>();
    const setDurableRecoveryState = createSetterSpy<DurableRecoveryState>();
    const loadThreadMessages = vi.fn();
    const activeThreadIdRef = { current: null };
    const shouldAutoScrollRef = { current: false };

    const restoredRunId = await runActivateThread({
      threadId: 'thread-1',
      options: {
        preferredRunId: 'run-1',
        recoveryMode: 'initial-thread',
        isCurrentRequest: () => false
      },
      refs: {
        activeThreadIdRef,
        shouldAutoScrollRef
      },
      actions: {
        setActiveThreadId,
        setDurableRecoveryState
      },
      operations: {
        loadThreadMessages
      }
    });

    expect(restoredRunId).toBeNull();
    expect(activeThreadIdRef.current).toBeNull();
    expect(shouldAutoScrollRef.current).toBe(false);
    expect(setActiveThreadId).not.toHaveBeenCalled();
    expect(setDurableRecoveryState).not.toHaveBeenCalled();
    expect(loadThreadMessages).not.toHaveBeenCalled();
  });

  it('surfaces recovering and restored states for initial thread recovery', async () => {
    const setActiveThreadId = createSetterSpy<string | null>();
    const setDurableRecoveryState = createSetterSpy<DurableRecoveryState>();
    const loadThreadMessages = vi.fn().mockResolvedValue({
      ok: true,
      restoredRunId: 'run-1'
    });

    const restoredRunId = await runActivateThread({
      threadId: 'thread-1',
      options: {
        preferredRunId: 'run-1',
        recoveryMode: 'initial-thread'
      },
      refs: {
        activeThreadIdRef: { current: null },
        shouldAutoScrollRef: { current: false }
      },
      actions: {
        setActiveThreadId,
        setDurableRecoveryState
      },
      operations: {
        loadThreadMessages
      }
    });

    expect(restoredRunId).toBe('run-1');
    expect(setActiveThreadId).toHaveBeenCalledWith('thread-1');
    expect(setDurableRecoveryState).toHaveBeenNthCalledWith(1, {
      phase: 'recovering',
      message: null
    });
    expect(setDurableRecoveryState).toHaveBeenNthCalledWith(2, {
      phase: 'restored',
      message: null
    });
  });

  it('clears recovery state when initial recovery load fails', async () => {
    const setDurableRecoveryState = createSetterSpy<DurableRecoveryState>();

    await runActivateThread({
      threadId: 'thread-1',
      options: {
        recoveryMode: 'initial-thread'
      },
      refs: {
        activeThreadIdRef: { current: null },
        shouldAutoScrollRef: { current: false }
      },
      actions: {
        setActiveThreadId: createSetterSpy<string | null>(),
        setDurableRecoveryState
      },
      operations: {
        loadThreadMessages: vi.fn().mockResolvedValue({
          ok: false,
          restoredRunId: null
        })
      }
    });

    expect(setDurableRecoveryState).toHaveBeenLastCalledWith({
      phase: 'idle',
      message: null
    });
  });
});
