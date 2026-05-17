import type {
  AnswerCandidateDto,
  AnswerSelectionDto,
  MessageDto,
  RunDto,
  RunFeedbackDto,
  RunTimelineResponseDto,
  RuntimePiMetaDto,
  ThreadDto
} from '@agent-infra/contracts';
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

function resolveUpdater<T>(next: Updater<T> | undefined, current: T) {
  if (!next) {
    return current;
  }

  return typeof next === 'function' ? (next as (value: T) => T)(current) : next;
}

function replaySetterCalls<T>(calls: Array<[Updater<T>]>, initial: T) {
  return calls.reduce((current, [next]) => resolveUpdater(next, current), initial);
}

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
    key: 'deepseek:deepseek-v4-flash',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
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

function createUserMessage(id: string, seq: number): MessageDto {
  return {
    id,
    threadId: 'thread-existing',
    runId: null,
    role: 'user',
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
        textValue: '你好',
        jsonValue: null,
        createdAt: '2026-01-01T00:00:00.000Z'
      }
    ]
  };
}

function createRun(id: string, status: RunDto['status']): RunDto {
  return {
    id,
    threadId: 'thread-existing',
    triggerMessageId: null,
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    status,
    usage: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z'
  };
}

function createLiveSegment(
  id: string,
  messageId: string,
  options: {
    text?: string;
    reasoning?: string | null;
    tools?: LiveAssistantDraft['activeTools'];
    eventType?: LiveAssistantDraft['eventType'];
  } = {}
) {
  return {
    id,
    messageId,
    text: options.text ?? '',
    reasoning: options.reasoning ?? null,
    tools: options.tools ?? [],
    eventType: options.eventType ?? 'start'
  };
}

function createTextStream(events: unknown[]) {
  const encoder = new TextEncoder();
  const payload = events
    .map((event) => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    }
  });
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
    setActiveResponseRuns: createSetterSpy<RunDto[]>(),
    setAnswerCandidates: createSetterSpy<AnswerCandidateDto[]>(),
    setAnswerSelections: createSetterSpy<AnswerSelectionDto[]>(),
    setChatPhase: createSetterSpy<'idle' | 'thinking' | 'streaming' | 'transcript-final' | 'failed'>(),
    setDraft: createSetterSpy<string>(),
    setError: createSetterSpy<string | null>(),
    setLiveAssistantDraft: createSetterSpy<LiveAssistantDraft | null>(),
    setLiveAssistantDraftsByRunId: createSetterSpy<Record<string, LiveAssistantDraft>>(),
    setLiveStreamRunId: createSetterSpy<string | null>(),
    setLiveStreamRunIds: createSetterSpy<string[]>(),
    setLoadingThreadId: createSetterSpy<string | null>(),
    setMessages: createSetterSpy<MessageDto[]>(),
    setOptimisticUserMessage: createSetterSpy<MessageDto | null>(),
    setPersistingTurn: createSetterSpy<boolean>(),
    setRecentRuns: createSetterSpy<RunDto[]>(),
    setRunFeedback: createSetterSpy<RunFeedbackDto[]>(),
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
        selectedThinkingEnabled: false,
        selectedReasoningEffort: 'high',
        selectedModelOption: createSelectedModelOption()
      },
      refs,
      actions,
      operations: {
        createThreadRecord: () => createThreadDeferred.promise,
        pendingNewThreadLoadingId: 'pending-new-thread',
        reconcileCompletedTurn: vi.fn(),
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
      source: 'live',
      committedText: '',
      partialText: '',
      segmentText: '',
      segmentTextMessageId: null,
      partialReasoning: null,
      segmentReasoningMessageId: null,
      activeTools: [],
      eventType: 'start',
      segments: [createLiveSegment('pending-assistant-1:0', 'pending-assistant-1')]
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

  it('keeps the live assistant draft through text_end and only persists the durable user row', async () => {
    const refs = createRefs();
    refs.activeThreadIdRef.current = 'thread-existing';
    const actions = createActions();
    const reconcileCompletedTurn = vi.fn().mockResolvedValue(undefined);

    openThreadRunStreamMock.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      requestId: 'req-1',
      body: createTextStream([
        {
          type: 'run.ready',
          runId: 'run-1',
          run: createRun('run-1', 'queued'),
          userMessage: {
            id: 'message-user-1',
            threadId: 'thread-existing',
            runId: null,
            role: 'user',
            seq: 2,
            status: 'completed',
            metadata: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            parts: [
              {
                id: 'part-user-1',
                messageId: 'message-user-1',
                partIndex: 0,
                type: 'text',
                textValue: '你好',
                jsonValue: null,
                createdAt: '2026-01-01T00:00:00.000Z'
              }
            ]
          }
        },
        {
          type: 'run.assistant',
          runId: 'run-1',
          assistant: {
            messageId: 'assistant-1',
            kind: 'assistant_delta',
            textDelta: '你好，有什么可以帮你？'
          }
        },
        {
          type: 'run.completed',
          runId: 'run-1',
          run: createRun('run-1', 'completed')
        }
      ])
    });

    await runSendMessageFlow({
      state: {
        activeThreadId: 'thread-existing',
        draft: '你好',
        isChatResponding: false,
        messages: [createMessage('message-1', 1)],
        selectedThinkingEnabled: true,
        selectedReasoningEffort: 'max',
        selectedModelOption: createSelectedModelOption()
      },
      refs,
      actions,
      operations: {
        createThreadRecord: vi.fn(),
        pendingNewThreadLoadingId: 'pending-new-thread',
        reconcileCompletedTurn,
        replaceCurrentPath: vi.fn()
      }
    });

    expect(openThreadRunStreamMock).toHaveBeenCalledWith(
      'thread-existing',
      expect.objectContaining({
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        thinkingEnabled: true,
        reasoningEffort: 'max'
      }),
      expect.any(AbortSignal)
    );

    expect(actions.setMessages).toHaveBeenCalledTimes(1);
    const afterUserReady = resolveUpdater(actions.setMessages.mock.calls[0]?.[0], [createMessage('message-1', 1)]);
    const persistedUserMessage = afterUserReady[1];
    expect(persistedUserMessage?.metadata).toEqual({ clientRenderKey: 'optimistic-user-1' });

    const finalLiveAssistantDraft = replaySetterCalls(actions.setLiveAssistantDraft.mock.calls as Array<[Updater<LiveAssistantDraft | null>]>, null);
    expect(finalLiveAssistantDraft).toEqual({
      runId: 'run-1',
      messageId: 'assistant-1',
      source: 'live',
      committedText: '',
      partialText: '你好，有什么可以帮你？',
      segmentText: '你好，有什么可以帮你？',
      segmentTextMessageId: 'assistant-1',
      partialReasoning: null,
      segmentReasoningMessageId: null,
      activeTools: [],
      eventType: 'streaming',
      segments: [createLiveSegment('assistant-1:0', 'assistant-1', { text: '你好，有什么可以帮你？', eventType: 'streaming' })]
    });
    expect(reconcileCompletedTurn).toHaveBeenCalledWith('thread-existing', 'run-1', 1);
  });

  it('passes explicit dual-answer request flags to the stream endpoint', async () => {
    const refs = createRefs();
    refs.activeThreadIdRef.current = 'thread-existing';
    const actions = createActions();

    openThreadRunStreamMock.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      requestId: 'req-1',
      body: createTextStream([
        {
          type: 'run.ready',
          runId: 'run-1',
          run: createRun('run-1', 'queued'),
          userMessage: createUserMessage('message-user-1', 2)
        },
        {
          type: 'run.completed',
          runId: 'run-1',
          run: createRun('run-1', 'completed')
        }
      ])
    });

    await runSendMessageFlow({
      state: {
        activeThreadId: 'thread-existing',
        draft: '你好',
        isChatResponding: false,
        messages: [createMessage('message-1', 1)],
        selectedWebSearchEnabled: false,
        selectedThinkingEnabled: false,
        selectedReasoningEffort: 'high',
        selectedModelOption: createSelectedModelOption(),
        answerMode: 'dual',
        candidateCount: 2
      },
      refs,
      actions,
      operations: {
        createThreadRecord: vi.fn(),
        pendingNewThreadLoadingId: 'pending-new-thread',
        reconcileCompletedTurn: vi.fn().mockResolvedValue(undefined),
        replaceCurrentPath: vi.fn()
      }
    });

    expect(openThreadRunStreamMock).toHaveBeenCalledWith(
      'thread-existing',
      expect.objectContaining({
        answerMode: 'dual',
        candidateCount: 2
      }),
      expect.any(AbortSignal)
    );
  });

  it('hydrates candidate grouping state from dual run.ready events', async () => {
    const refs = createRefs();
    refs.activeThreadIdRef.current = 'thread-existing';
    const actions = createActions();

    openThreadRunStreamMock.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      requestId: 'req-1',
      body: createTextStream([
        {
          type: 'run.ready',
          runId: 'run-a',
          run: createRun('run-a', 'queued'),
          userMessage: createUserMessage('message-user-1', 2),
          triggerMessageId: 'message-user-1',
          candidateId: 'candidate-a',
          ordinal: 0,
          kind: 'primary'
        },
        {
          type: 'run.ready',
          runId: 'run-b',
          run: createRun('run-b', 'queued'),
          userMessage: createUserMessage('message-user-1', 2),
          triggerMessageId: 'message-user-1',
          candidateId: 'candidate-b',
          ordinal: 1,
          kind: 'alternative'
        }
      ])
    });

    await runSendMessageFlow({
      state: {
        activeThreadId: 'thread-existing',
        draft: '你好',
        isChatResponding: false,
        messages: [createMessage('message-1', 1)],
        selectedWebSearchEnabled: false,
        selectedThinkingEnabled: false,
        selectedReasoningEffort: 'high',
        selectedModelOption: createSelectedModelOption(),
        answerMode: 'dual',
        candidateCount: 2
      },
      refs,
      actions,
      operations: {
        createThreadRecord: vi.fn(),
        pendingNewThreadLoadingId: 'pending-new-thread',
        reconcileCompletedTurn: vi.fn().mockResolvedValue(undefined),
        replaceCurrentPath: vi.fn()
      }
    });

    const candidates = replaySetterCalls(actions.setAnswerCandidates.mock.calls, []);
    expect(candidates).toMatchObject([
      { id: 'candidate-a', runId: 'run-a', ordinal: 0, kind: 'primary', triggerMessageId: 'message-user-1' },
      { id: 'candidate-b', runId: 'run-b', ordinal: 1, kind: 'alternative', triggerMessageId: 'message-user-1' }
    ]);
    const selections = replaySetterCalls(actions.setAnswerSelections.mock.calls, []);
    expect(selections).toMatchObject([
      { selectedRunId: 'run-a', source: 'default', triggerMessageId: 'message-user-1' }
    ]);
  });

  it('forwards custom stream events through the optional stream handler', async () => {
    const refs = createRefs();
    refs.activeThreadIdRef.current = 'thread-existing';
    const actions = createActions();
    const onCustomEvent = vi.fn();
    const customStreamPayload = [
      'event: run.ready',
      `data: ${JSON.stringify({
        type: 'run.ready',
        runId: 'run-custom-1',
        run: createRun('run-custom-1', 'queued'),
        userMessage: {
          id: 'message-user-custom-1',
          threadId: 'thread-existing',
          runId: null,
          role: 'user',
          seq: 2,
          status: 'completed',
          metadata: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          parts: [
            {
              id: 'part-user-custom-1',
              messageId: 'message-user-custom-1',
              partIndex: 0,
              type: 'text',
              textValue: '你好',
              jsonValue: null,
              createdAt: '2026-01-01T00:00:00.000Z'
            }
          ]
        }
      })}`,
      '',
      'event: thread.title_updated',
      'data: {"type":"thread.title_updated","threadId":"thread-existing","title":"验证码问题排查","updatedAt":"2026-01-01T00:00:10.000Z"}',
      '',
      'event: run.completed',
      `data: ${JSON.stringify({
        type: 'run.completed',
        runId: 'run-custom-1',
        run: createRun('run-custom-1', 'completed')
      })}`,
      ''
    ].join('\n');

    openThreadRunStreamMock.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      requestId: 'req-custom-1',
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(customStreamPayload));
          controller.close();
        }
      })
    });

    await runSendMessageFlow({
      state: {
        activeThreadId: 'thread-existing',
        draft: '你好',
        isChatResponding: false,
        messages: [createMessage('message-1', 1)],
        selectedWebSearchEnabled: false,
        selectedThinkingEnabled: false,
        selectedReasoningEffort: 'high',
        selectedModelOption: createSelectedModelOption()
      },
      refs,
      actions,
      operations: {
        createThreadRecord: vi.fn(),
        pendingNewThreadLoadingId: 'pending-new-thread',
        reconcileCompletedTurn: vi.fn().mockResolvedValue(undefined),
        replaceCurrentPath: vi.fn()
      },
      stream: {
        parseChunk(buffer) {
          const frames = buffer.split('\n\n');
          const remainder = frames.pop() ?? '';
          const events = frames.flatMap((frame) => {
            const lines = frame.split('\n');
            const dataLines = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart());
            if (dataLines.length === 0) {
              return [];
            }

            return [JSON.parse(dataLines.join('\n'))];
          });

          return { events, remainder };
        },
        onEvent: onCustomEvent
      }
    });

    expect(onCustomEvent).toHaveBeenCalledWith({
      type: 'thread.title_updated',
      threadId: 'thread-existing',
      title: '验证码问题排查',
      updatedAt: '2026-01-01T00:00:10.000Z'
    });
    expect(actions.setMessages).toHaveBeenCalledTimes(1);
  });

  it('starts the next assistant message without concatenating prior persisted text into the live draft', async () => {
    const refs = createRefs();
    refs.activeThreadIdRef.current = 'thread-existing';
    const actions = createActions();

    openThreadRunStreamMock.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      requestId: 'req-2',
      body: createTextStream([
        {
          type: 'run.ready',
          runId: 'run-2',
          run: createRun('run-2', 'queued'),
          userMessage: {
            id: 'message-user-2',
            threadId: 'thread-existing',
            runId: null,
            role: 'user',
            seq: 2,
            status: 'completed',
            metadata: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            parts: [
              {
                id: 'part-user-2',
                messageId: 'message-user-2',
                partIndex: 0,
                type: 'text',
                textValue: '帮我查最新新闻',
                jsonValue: null,
                createdAt: '2026-01-01T00:00:00.000Z'
              }
            ]
          }
        },
        {
          type: 'run.assistant',
          runId: 'run-2',
          assistant: {
            messageId: 'assistant-2a',
            kind: 'assistant_delta',
            textDelta: '我先搜索一下。'
          }
        },
        {
          type: 'run.assistant',
          runId: 'run-2',
          assistant: {
            messageId: 'assistant-2b',
            kind: 'tool_event',
            toolCallId: 'call-search-1',
            toolName: 'searchWeb',
            phase: 'start',
            input: { query: '最新新闻' }
          }
        },
        {
          type: 'run.assistant',
          runId: 'run-2',
          assistant: {
            messageId: 'assistant-2b',
            kind: 'assistant_delta',
            textDelta: '再补充一点细节。'
          }
        },
        {
          type: 'run.completed',
          runId: 'run-2',
          run: createRun('run-2', 'completed')
        }
      ])
    });

    await runSendMessageFlow({
      state: {
        activeThreadId: 'thread-existing',
        draft: '帮我查最新新闻',
        isChatResponding: false,
        messages: [createMessage('message-1', 1)],
        selectedWebSearchEnabled: true,
        selectedThinkingEnabled: false,
        selectedReasoningEffort: 'high',
        selectedModelOption: createSelectedModelOption()
      },
      refs,
      actions,
      operations: {
        createThreadRecord: vi.fn(),
        pendingNewThreadLoadingId: 'pending-new-thread',
        reconcileCompletedTurn: vi.fn().mockResolvedValue(undefined),
        replaceCurrentPath: vi.fn()
      }
    });

    expect(actions.setMessages).toHaveBeenCalledTimes(1);
    const afterUserReady = resolveUpdater(actions.setMessages.mock.calls[0]?.[0], [createMessage('message-1', 1)]);
    expect(afterUserReady[1]?.parts[0]?.textValue).toBe('帮我查最新新闻');

    const finalLiveAssistantDraft = replaySetterCalls(actions.setLiveAssistantDraft.mock.calls as Array<[Updater<LiveAssistantDraft | null>]>, null);
    expect(finalLiveAssistantDraft).toEqual({
      runId: 'run-2',
      messageId: 'assistant-2b',
      source: 'live',
      committedText: '',
      partialText: '再补充一点细节。',
      segmentText: '再补充一点细节。',
      segmentTextMessageId: 'assistant-2b',
      partialReasoning: null,
      segmentReasoningMessageId: null,
      activeTools: [],
      eventType: 'streaming',
      segments: [
        createLiveSegment('assistant-2a:0', 'assistant-2a', { text: '我先搜索一下。', eventType: 'streaming' }),
        createLiveSegment('assistant-2b:1', 'assistant-2b', {
          tools: [
            {
              toolCallId: 'call-search-1',
              toolName: 'searchWeb',
              phase: 'start',
              input: { query: '最新新闻' }
            }
          ],
          eventType: 'searching'
        }),
        createLiveSegment('assistant-2b:2', 'assistant-2b', {
          text: '再补充一点细节。',
          eventType: 'streaming'
        })
      ]
    });
  });

  it('keeps the completed search tool visible until the next assistant message starts', async () => {
    const refs = createRefs();
    refs.activeThreadIdRef.current = 'thread-existing';
    const actions = createActions();

    openThreadRunStreamMock.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      requestId: 'req-2b',
      body: createTextStream([
        {
          type: 'run.ready',
          runId: 'run-2b',
          run: createRun('run-2b', 'queued'),
          userMessage: {
            id: 'message-user-2b',
            threadId: 'thread-existing',
            runId: null,
            role: 'user',
            seq: 2,
            status: 'completed',
            metadata: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            parts: [
              {
                id: 'part-user-2b',
                messageId: 'message-user-2b',
                partIndex: 0,
                type: 'text',
                textValue: '帮我查 Claude 新闻',
                jsonValue: null,
                createdAt: '2026-01-01T00:00:00.000Z'
              }
            ]
          }
        },
        {
          type: 'run.assistant',
          runId: 'run-2b',
          assistant: {
            messageId: 'assistant-2b-a',
            kind: 'assistant_delta',
            textDelta: '好的，我来帮你搜索一下。'
          }
        },
        {
          type: 'run.assistant',
          runId: 'run-2b',
          assistant: {
            messageId: 'assistant-2b-a',
            kind: 'tool_event',
            toolCallId: 'call-search-2b',
            toolName: 'searchWeb',
            phase: 'start',
            input: { query: 'Claude latest news' }
          }
        },
        {
          type: 'run.assistant',
          runId: 'run-2b',
          assistant: {
            messageId: 'assistant-2b-a',
            kind: 'tool_event',
            toolCallId: 'call-search-2b',
            toolName: 'searchWeb',
            phase: 'completed',
            input: { query: 'Claude latest news' }
          }
        },
        {
          type: 'run.completed',
          runId: 'run-2b',
          run: createRun('run-2b', 'completed')
        }
      ])
    });

    await runSendMessageFlow({
      state: {
        activeThreadId: 'thread-existing',
        draft: '帮我查 Claude 新闻',
        isChatResponding: false,
        messages: [createMessage('message-1', 1)],
        selectedWebSearchEnabled: true,
        selectedThinkingEnabled: false,
        selectedReasoningEffort: 'high',
        selectedModelOption: createSelectedModelOption()
      },
      refs,
      actions,
      operations: {
        createThreadRecord: vi.fn(),
        pendingNewThreadLoadingId: 'pending-new-thread',
        reconcileCompletedTurn: vi.fn().mockResolvedValue(undefined),
        replaceCurrentPath: vi.fn()
      }
    });

    const finalLiveAssistantDraft = replaySetterCalls(actions.setLiveAssistantDraft.mock.calls as Array<[Updater<LiveAssistantDraft | null>]>, null);
    expect(finalLiveAssistantDraft).toEqual({
      runId: 'run-2b',
      messageId: 'assistant-2b-a',
      source: 'live',
      committedText: '',
      partialText: '好的，我来帮你搜索一下。',
      segmentText: '好的，我来帮你搜索一下。',
      segmentTextMessageId: 'assistant-2b-a',
      partialReasoning: null,
      segmentReasoningMessageId: null,
      activeTools: [],
      eventType: 'streaming',
      segments: [
        createLiveSegment('assistant-2b-a:0', 'assistant-2b-a', {
          text: '好的，我来帮你搜索一下。',
          tools: [
            {
              toolCallId: 'call-search-2b',
              toolName: 'searchWeb',
              phase: 'completed',
              input: { query: 'Claude latest news' }
            }
          ],
          eventType: 'streaming'
        })
      ]
    });
  });

  it('does not re-show the committed sentence when toolcall events echo the same partialText', async () => {
    const refs = createRefs();
    refs.activeThreadIdRef.current = 'thread-existing';
    const actions = createActions();

    openThreadRunStreamMock.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      requestId: 'req-3',
      body: createTextStream([
        {
          type: 'run.ready',
          runId: 'run-3',
          run: createRun('run-3', 'queued'),
          userMessage: {
            id: 'message-user-3',
            threadId: 'thread-existing',
            runId: null,
            role: 'user',
            seq: 2,
            status: 'completed',
            metadata: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            parts: [
              {
                id: 'part-user-3',
                messageId: 'message-user-3',
                partIndex: 0,
                type: 'text',
                textValue: '帮我搜索 GPT-5.5 新闻',
                jsonValue: null,
                createdAt: '2026-01-01T00:00:00.000Z'
              }
            ]
          }
        },
        {
          type: 'run.assistant',
          runId: 'run-3',
          assistant: {
            messageId: 'assistant-3',
            kind: 'assistant_delta',
            textDelta: '好的，我来搜索一下。'
          }
        },
        {
          type: 'run.assistant',
          runId: 'run-3',
          assistant: {
            messageId: 'assistant-3',
            kind: 'tool_event',
            toolCallId: 'call-search-2',
            toolName: 'searchWeb',
            phase: 'start',
            input: { query: 'GPT-5.5 新闻' }
          }
        },
        {
          type: 'run.completed',
          runId: 'run-3',
          run: createRun('run-3', 'completed')
        }
      ])
    });

    await runSendMessageFlow({
      state: {
        activeThreadId: 'thread-existing',
        draft: '帮我搜索 GPT-5.5 新闻',
        isChatResponding: false,
        messages: [createMessage('message-1', 1)],
        selectedWebSearchEnabled: true,
        selectedThinkingEnabled: false,
        selectedReasoningEffort: 'high',
        selectedModelOption: createSelectedModelOption()
      },
      refs,
      actions,
      operations: {
        createThreadRecord: vi.fn(),
        pendingNewThreadLoadingId: 'pending-new-thread',
        reconcileCompletedTurn: vi.fn().mockResolvedValue(undefined),
        replaceCurrentPath: vi.fn()
      }
    });

    const finalLiveAssistantDraft = replaySetterCalls(actions.setLiveAssistantDraft.mock.calls as Array<[Updater<LiveAssistantDraft | null>]>, null);
    expect(finalLiveAssistantDraft).toEqual({
      runId: 'run-3',
      messageId: 'assistant-3',
      source: 'live',
      committedText: '',
      partialText: '好的，我来搜索一下。',
      segmentText: '好的，我来搜索一下。',
      segmentTextMessageId: 'assistant-3',
      partialReasoning: null,
      segmentReasoningMessageId: null,
      activeTools: [
        {
          toolCallId: 'call-search-2',
          toolName: 'searchWeb',
          phase: 'start',
          input: { query: 'GPT-5.5 新闻' }
        }
      ],
      eventType: 'searching',
      segments: [
        createLiveSegment('assistant-3:0', 'assistant-3', {
          text: '好的，我来搜索一下。',
          tools: [
            {
              toolCallId: 'call-search-2',
              toolName: 'searchWeb',
              phase: 'start',
              input: { query: 'GPT-5.5 新闻' }
            }
          ],
          eventType: 'searching'
        })
      ]
    });
  });

  it('replaces the live assistant text when the stream sends a non-prefix rewrite', async () => {
    const refs = createRefs();
    refs.activeThreadIdRef.current = 'thread-existing';
    const actions = createActions();

    openThreadRunStreamMock.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      requestId: 'req-4',
      body: createTextStream([
        {
          type: 'run.ready',
          runId: 'run-4',
          run: createRun('run-4', 'queued'),
          userMessage: {
            id: 'message-user-4',
            threadId: 'thread-existing',
            runId: null,
            role: 'user',
            seq: 2,
            status: 'completed',
            metadata: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            parts: [
              {
                id: 'part-user-4',
                messageId: 'message-user-4',
                partIndex: 0,
                type: 'text',
                textValue: '给我最新消息',
                jsonValue: null,
                createdAt: '2026-01-01T00:00:00.000Z'
              }
            ]
          }
        },
        {
          type: 'run.assistant',
          runId: 'run-4',
          assistant: {
            messageId: 'assistant-4',
            kind: 'assistant_delta',
            textDelta: '好的，我来搜索一下。'
          }
        },
        {
          type: 'run.assistant',
          runId: 'run-4',
          assistant: {
            messageId: 'assistant-4',
            kind: 'assistant_replace',
            textSnapshot: '我来搜索最新消息。'
          }
        },
        {
          type: 'run.completed',
          runId: 'run-4',
          run: createRun('run-4', 'completed')
        }
      ])
    });

    await runSendMessageFlow({
      state: {
        activeThreadId: 'thread-existing',
        draft: '给我最新消息',
        isChatResponding: false,
        messages: [createMessage('message-1', 1)],
        selectedWebSearchEnabled: true,
        selectedThinkingEnabled: false,
        selectedReasoningEffort: 'high',
        selectedModelOption: createSelectedModelOption()
      },
      refs,
      actions,
      operations: {
        createThreadRecord: vi.fn(),
        pendingNewThreadLoadingId: 'pending-new-thread',
        reconcileCompletedTurn: vi.fn().mockResolvedValue(undefined),
        replaceCurrentPath: vi.fn()
      }
    });

    const finalLiveAssistantDraft = replaySetterCalls(actions.setLiveAssistantDraft.mock.calls as Array<[Updater<LiveAssistantDraft | null>]>, null);
    expect(finalLiveAssistantDraft).toEqual({
      runId: 'run-4',
      messageId: 'assistant-4',
      source: 'live',
      committedText: '',
      partialText: '我来搜索最新消息。',
      segmentText: '我来搜索最新消息。',
      segmentTextMessageId: 'assistant-4',
      partialReasoning: null,
      segmentReasoningMessageId: null,
      activeTools: [],
      eventType: 'streaming',
      segments: [createLiveSegment('assistant-4:0', 'assistant-4', { text: '我来搜索最新消息。', eventType: 'streaming' })]
    });
  });

  it('replaces only the current segment when a later assistant segment rewrites its text', async () => {
    const refs = createRefs();
    refs.activeThreadIdRef.current = 'thread-existing';
    const actions = createActions();

    openThreadRunStreamMock.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      requestId: 'req-4b',
      body: createTextStream([
        {
          type: 'run.ready',
          runId: 'run-4b',
          run: createRun('run-4b', 'queued'),
          userMessage: {
            id: 'message-user-4b',
            threadId: 'thread-existing',
            runId: null,
            role: 'user',
            seq: 2,
            status: 'completed',
            metadata: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            parts: [
              {
                id: 'part-user-4b',
                messageId: 'message-user-4b',
                partIndex: 0,
                type: 'text',
                textValue: '两次搜索',
                jsonValue: null,
                createdAt: '2026-01-01T00:00:00.000Z'
              }
            ]
          }
        },
        {
          type: 'run.assistant',
          runId: 'run-4b',
          assistant: {
            messageId: 'assistant-4b-a',
            kind: 'assistant_delta',
            textDelta: '第一段。'
          }
        },
        {
          type: 'run.assistant',
          runId: 'run-4b',
          assistant: {
            messageId: 'assistant-4b-b',
            kind: 'assistant_delta',
            textDelta: '第二段旧文案。'
          }
        },
        {
          type: 'run.assistant',
          runId: 'run-4b',
          assistant: {
            messageId: 'assistant-4b-b',
            kind: 'assistant_replace',
            textSnapshot: '第二段新文案。'
          }
        },
        {
          type: 'run.completed',
          runId: 'run-4b',
          run: createRun('run-4b', 'completed')
        }
      ])
    });

    await runSendMessageFlow({
      state: {
        activeThreadId: 'thread-existing',
        draft: '两次搜索',
        isChatResponding: false,
        messages: [createMessage('message-1', 1)],
        selectedWebSearchEnabled: true,
        selectedThinkingEnabled: false,
        selectedReasoningEffort: 'high',
        selectedModelOption: createSelectedModelOption()
      },
      refs,
      actions,
      operations: {
        createThreadRecord: vi.fn(),
        pendingNewThreadLoadingId: 'pending-new-thread',
        reconcileCompletedTurn: vi.fn().mockResolvedValue(undefined),
        replaceCurrentPath: vi.fn()
      }
    });

    const finalLiveAssistantDraft = replaySetterCalls(actions.setLiveAssistantDraft.mock.calls as Array<[Updater<LiveAssistantDraft | null>]>, null);
    expect(finalLiveAssistantDraft).toEqual({
      runId: 'run-4b',
      messageId: 'assistant-4b-b',
      source: 'live',
      committedText: '',
      partialText: '第二段新文案。',
      segmentText: '第二段新文案。',
      segmentTextMessageId: 'assistant-4b-b',
      partialReasoning: null,
      segmentReasoningMessageId: null,
      activeTools: [],
      eventType: 'streaming',
      segments: [
        createLiveSegment('assistant-4b-a:0', 'assistant-4b-a', { text: '第一段。', eventType: 'streaming' }),
        createLiveSegment('assistant-4b-b:1', 'assistant-4b-b', { text: '第二段新文案。', eventType: 'streaming' })
      ]
    });
  });

  it('starts a new live segment when an assistant replace follows a completed search tool', async () => {
    const refs = createRefs();
    refs.activeThreadIdRef.current = 'thread-existing';
    const actions = createActions();

    openThreadRunStreamMock.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      requestId: 'req-4c',
      body: createTextStream([
        {
          type: 'run.ready',
          runId: 'run-4c',
          run: createRun('run-4c', 'queued'),
          userMessage: {
            id: 'message-user-4c',
            threadId: 'thread-existing',
            runId: null,
            role: 'user',
            seq: 2,
            status: 'completed',
            metadata: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            parts: [
              {
                id: 'part-user-4c',
                messageId: 'message-user-4c',
                partIndex: 0,
                type: 'text',
                textValue: '搜 Claude 新闻',
                jsonValue: null,
                createdAt: '2026-01-01T00:00:00.000Z'
              }
            ]
          }
        },
        {
          type: 'run.assistant',
          runId: 'run-4c',
          assistant: {
            messageId: 'assistant-4c',
            kind: 'assistant_delta',
            textDelta: '好的，我来帮你搜索一下关于 Claude 的最新新闻！'
          }
        },
        {
          type: 'run.assistant',
          runId: 'run-4c',
          assistant: {
            messageId: 'assistant-4c',
            kind: 'tool_event',
            toolCallId: 'call-search-4c',
            toolName: 'searchWeb',
            phase: 'completed',
            input: { query: 'Claude latest news' }
          }
        },
        {
          type: 'run.assistant',
          runId: 'run-4c',
          assistant: {
            messageId: 'assistant-4c',
            kind: 'assistant_replace',
            textSnapshot: '以下是关于 Claude 的最新新闻摘要：'
          }
        },
        {
          type: 'run.completed',
          runId: 'run-4c',
          run: createRun('run-4c', 'completed')
        }
      ])
    });

    await runSendMessageFlow({
      state: {
        activeThreadId: 'thread-existing',
        draft: '搜 Claude 新闻',
        isChatResponding: false,
        messages: [createMessage('message-1', 1)],
        selectedWebSearchEnabled: true,
        selectedThinkingEnabled: false,
        selectedReasoningEffort: 'high',
        selectedModelOption: createSelectedModelOption()
      },
      refs,
      actions,
      operations: {
        createThreadRecord: vi.fn(),
        pendingNewThreadLoadingId: 'pending-new-thread',
        reconcileCompletedTurn: vi.fn().mockResolvedValue(undefined),
        replaceCurrentPath: vi.fn()
      }
    });

    const finalLiveAssistantDraft = replaySetterCalls(actions.setLiveAssistantDraft.mock.calls as Array<[Updater<LiveAssistantDraft | null>]>, null);
    expect(finalLiveAssistantDraft).toEqual({
      runId: 'run-4c',
      messageId: 'assistant-4c',
      source: 'live',
      committedText: '',
      partialText: '以下是关于 Claude 的最新新闻摘要：',
      segmentText: '以下是关于 Claude 的最新新闻摘要：',
      segmentTextMessageId: 'assistant-4c',
      partialReasoning: null,
      segmentReasoningMessageId: null,
      activeTools: [],
      eventType: 'streaming',
      segments: [
        createLiveSegment('assistant-4c:0', 'assistant-4c', {
          text: '好的，我来帮你搜索一下关于 Claude 的最新新闻！',
          tools: [
            {
              toolCallId: 'call-search-4c',
              toolName: 'searchWeb',
              phase: 'completed',
              input: { query: 'Claude latest news' }
            }
          ],
          eventType: 'streaming'
        }),
        createLiveSegment('assistant-4c:1', 'assistant-4c', {
          text: '以下是关于 Claude 的最新新闻摘要：',
          eventType: 'streaming'
        })
      ]
    });
  });

  it('does not carry reasoning text across assistant message segments in the same run', async () => {
    const refs = createRefs();
    refs.activeThreadIdRef.current = 'thread-existing';
    const actions = createActions();

    openThreadRunStreamMock.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      requestId: 'req-4c',
      body: createTextStream([
        {
          type: 'run.ready',
          runId: 'run-4c',
          run: createRun('run-4c', 'queued'),
          userMessage: {
            id: 'message-user-4c',
            threadId: 'thread-existing',
            runId: null,
            role: 'user',
            seq: 2,
            status: 'completed',
            metadata: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            parts: [
              {
                id: 'part-user-4c',
                messageId: 'message-user-4c',
                partIndex: 0,
                type: 'text',
                textValue: '跨段思考',
                jsonValue: null,
                createdAt: '2026-01-01T00:00:00.000Z'
              }
            ]
          }
        },
        {
          type: 'run.assistant',
          runId: 'run-4c',
          assistant: {
            messageId: 'assistant-4c-a',
            kind: 'thinking_delta',
            thinkingDelta: '第一段思考'
          }
        },
        {
          type: 'run.assistant',
          runId: 'run-4c',
          assistant: {
            messageId: 'assistant-4c-b',
            kind: 'thinking_delta',
            thinkingDelta: '第二段思考'
          }
        },
        {
          type: 'run.completed',
          runId: 'run-4c',
          run: createRun('run-4c', 'completed')
        }
      ])
    });

    await runSendMessageFlow({
      state: {
        activeThreadId: 'thread-existing',
        draft: '跨段思考',
        isChatResponding: false,
        messages: [createMessage('message-1', 1)],
        selectedWebSearchEnabled: false,
        selectedThinkingEnabled: true,
        selectedReasoningEffort: 'high',
        selectedModelOption: createSelectedModelOption()
      },
      refs,
      actions,
      operations: {
        createThreadRecord: vi.fn(),
        pendingNewThreadLoadingId: 'pending-new-thread',
        reconcileCompletedTurn: vi.fn().mockResolvedValue(undefined),
        replaceCurrentPath: vi.fn()
      }
    });

    const finalLiveAssistantDraft = replaySetterCalls(actions.setLiveAssistantDraft.mock.calls as Array<[Updater<LiveAssistantDraft | null>]>, null);
    expect(finalLiveAssistantDraft).toEqual({
      runId: 'run-4c',
      messageId: 'assistant-4c-b',
      source: 'live',
      committedText: '',
      partialText: '',
      segmentText: '',
      segmentTextMessageId: null,
      partialReasoning: '第二段思考',
      segmentReasoningMessageId: 'assistant-4c-b',
      activeTools: [],
      eventType: 'thinking',
      segments: [
        createLiveSegment('assistant-4c-a:0', 'assistant-4c-a', { reasoning: '第一段思考', eventType: 'thinking' }),
        createLiveSegment('assistant-4c-b:1', 'assistant-4c-b', { reasoning: '第二段思考', eventType: 'thinking' })
      ]
    });
  });

  it('recovers the transcript after any tool event, not just searchWeb', async () => {
    const refs = createRefs();
    refs.activeThreadIdRef.current = 'thread-existing';
    const actions = createActions();
    const reconcileCompletedTurn = vi.fn().mockResolvedValue(undefined);

    openThreadRunStreamMock.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      requestId: 'req-5',
      body: createTextStream([
        {
          type: 'run.ready',
          runId: 'run-5',
          run: createRun('run-5', 'queued'),
          userMessage: {
            id: 'message-user-5',
            threadId: 'thread-existing',
            runId: null,
            role: 'user',
            seq: 2,
            status: 'completed',
            metadata: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            parts: [
              {
                id: 'part-user-5',
                messageId: 'message-user-5',
                partIndex: 0,
                type: 'text',
                textValue: '运行一个工具',
                jsonValue: null,
                createdAt: '2026-01-01T00:00:00.000Z'
              }
            ]
          }
        },
        {
          type: 'run.assistant',
          runId: 'run-5',
          assistant: {
            messageId: 'assistant-5',
            kind: 'tool_event',
            toolCallId: 'call-echo',
            toolName: 'echoText',
            phase: 'start',
            input: { text: 'hello' }
          }
        },
        {
          type: 'run.completed',
          runId: 'run-5',
          run: createRun('run-5', 'completed')
        }
      ])
    });

    await runSendMessageFlow({
      state: {
        activeThreadId: 'thread-existing',
        draft: '运行一个工具',
        isChatResponding: false,
        messages: [createMessage('message-1', 1)],
        selectedWebSearchEnabled: false,
        selectedThinkingEnabled: false,
        selectedReasoningEffort: 'high',
        selectedModelOption: createSelectedModelOption()
      },
      refs,
      actions,
      operations: {
        createThreadRecord: vi.fn(),
        pendingNewThreadLoadingId: 'pending-new-thread',
        reconcileCompletedTurn,
        replaceCurrentPath: vi.fn()
      }
    });

    expect(reconcileCompletedTurn).toHaveBeenCalledWith('thread-existing', 'run-5', 1);
    expect(actions.setChatPhase).toHaveBeenCalledWith('streaming');
  });

  it('keeps interleaved dual-answer stream state keyed by run id', async () => {
    const refs = createRefs();
    refs.activeThreadIdRef.current = 'thread-existing';
    const actions = createActions();
    const reconcileCompletedTurn = vi.fn().mockResolvedValue(undefined);

    openThreadRunStreamMock.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      requestId: 'req-dual',
      body: createTextStream([
        {
          type: 'run.ready',
          runId: 'run-a',
          run: createRun('run-a', 'queued'),
          userMessage: createUserMessage('message-user-dual', 2)
        },
        {
          type: 'run.ready',
          runId: 'run-b',
          run: createRun('run-b', 'queued'),
          userMessage: createUserMessage('message-user-dual', 2)
        },
        {
          type: 'run.assistant',
          runId: 'run-a',
          assistant: {
            messageId: 'assistant-a',
            kind: 'assistant_delta',
            textDelta: 'A1'
          }
        },
        {
          type: 'run.assistant',
          runId: 'run-b',
          assistant: {
            messageId: 'assistant-b',
            kind: 'assistant_delta',
            textDelta: 'B1'
          }
        },
        {
          type: 'run.completed',
          runId: 'run-a',
          run: createRun('run-a', 'completed')
        },
        {
          type: 'run.assistant',
          runId: 'run-b',
          assistant: {
            messageId: 'assistant-b',
            kind: 'assistant_delta',
            textDelta: 'B2'
          }
        },
        {
          type: 'run.completed',
          runId: 'run-b',
          run: createRun('run-b', 'completed')
        }
      ])
    });

    await runSendMessageFlow({
      state: {
        activeThreadId: 'thread-existing',
        draft: '给我两个答案',
        isChatResponding: false,
        messages: [createMessage('message-1', 1)],
        selectedWebSearchEnabled: false,
        selectedThinkingEnabled: false,
        selectedReasoningEffort: 'high',
        selectedModelOption: createSelectedModelOption()
      },
      refs,
      actions,
      operations: {
        createThreadRecord: vi.fn(),
        pendingNewThreadLoadingId: 'pending-new-thread',
        reconcileCompletedTurn,
        replaceCurrentPath: vi.fn()
      }
    });

    const finalDraftsByRunId = replaySetterCalls(
      actions.setLiveAssistantDraftsByRunId.mock.calls as Array<[Updater<Record<string, LiveAssistantDraft>>]>,
      {}
    );
    expect(finalDraftsByRunId['run-a']?.partialText).toBe('A1');
    expect(finalDraftsByRunId['run-b']?.partialText).toBe('B1B2');

    let currentActiveRuns: RunDto[] = [];
    const activeRunStates = actions.setActiveResponseRuns.mock.calls.map(([next]) => {
      currentActiveRuns = resolveUpdater(next, currentActiveRuns);
      return currentActiveRuns.map((run) => run.id);
    });
    expect(activeRunStates).toContainEqual(['run-b']);
    expect(reconcileCompletedTurn).toHaveBeenCalledWith('thread-existing', 'run-b', 1);
  });

  it('preserves active multi-run state when the stream ends before terminal events', async () => {
    const refs = createRefs();
    refs.activeThreadIdRef.current = 'thread-existing';
    const actions = createActions();
    const reconcileCompletedTurn = vi.fn().mockResolvedValue(undefined);

    openThreadRunStreamMock.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      requestId: 'req-active',
      body: createTextStream([
        {
          type: 'run.ready',
          runId: 'run-a',
          run: createRun('run-a', 'running'),
          userMessage: createUserMessage('message-user-active', 2)
        },
        {
          type: 'run.ready',
          runId: 'run-b',
          run: createRun('run-b', 'queued'),
          userMessage: createUserMessage('message-user-active', 2)
        }
      ])
    });

    await runSendMessageFlow({
      state: {
        activeThreadId: 'thread-existing',
        draft: '继续生成',
        isChatResponding: false,
        messages: [createMessage('message-1', 1)],
        selectedWebSearchEnabled: false,
        selectedThinkingEnabled: false,
        selectedReasoningEffort: 'high',
        selectedModelOption: createSelectedModelOption()
      },
      refs,
      actions,
      operations: {
        createThreadRecord: vi.fn(),
        pendingNewThreadLoadingId: 'pending-new-thread',
        reconcileCompletedTurn,
        replaceCurrentPath: vi.fn()
      }
    });

    let currentActiveRuns: RunDto[] = [];
    for (const [next] of actions.setActiveResponseRuns.mock.calls as Array<[Updater<RunDto[]>]>) {
      currentActiveRuns = resolveUpdater(next, currentActiveRuns);
    }
    let currentLiveRunIds: string[] = [];
    for (const [next] of actions.setLiveStreamRunIds.mock.calls as Array<[Updater<string[]>]>) {
      currentLiveRunIds = resolveUpdater(next, currentLiveRunIds);
    }

    expect(currentActiveRuns.map((run) => run.id)).toEqual(['run-a', 'run-b']);
    expect(currentLiveRunIds).toEqual(['run-a', 'run-b']);
    expect(actions.setChatPhase).not.toHaveBeenLastCalledWith('idle');
    expect(reconcileCompletedTurn).toHaveBeenCalledWith('thread-existing', 'run-b', 1);
  });
});
