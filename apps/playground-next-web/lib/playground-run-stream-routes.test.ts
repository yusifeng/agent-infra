import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Message,
  MessagePart,
  Run,
  Thread
} from '@agent-infra/core';
import type {
  RunAttachStreamEventDto,
  RunDto,
  RunStreamEventDto,
  RunStreamSnapshotEventDto
} from '@agent-infra/contracts';

import { getPlaygroundRunStreamHub } from './playground-run-stream-hub';

type SseEvent = {
  type: string;
  data: Record<string, unknown>;
};

const user = { id: 'user-1', email: 'user@example.com' };

function now() {
  return new Date('2026-01-01T00:00:00.000Z');
}

function createRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-1',
    threadId: 'thread-1',
    triggerMessageId: null,
    provider: 'openai',
    model: 'gpt-4o-mini',
    status: 'running',
    usage: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: now(),
    ...overrides
  };
}

function createThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 'thread-1',
    appId: 'playground',
    userId: null,
    title: 'New Thread',
    status: 'active',
    metadata: null,
    createdAt: now(),
    updatedAt: now(),
    ...overrides
  };
}

function createRunDto(overrides: Partial<RunDto> = {}): RunDto {
  return {
    id: 'run-1',
    threadId: 'thread-1',
    triggerMessageId: null,
    provider: 'openai',
    model: 'gpt-4o-mini',
    status: 'running',
    usage: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: now().toISOString(),
    ...overrides
  };
}

function createUserMessage(): Message & { parts: MessagePart[] } {
  return {
    id: 'message-1',
    threadId: 'thread-1',
    runId: 'run-1',
    role: 'user',
    seq: 1,
    status: 'completed',
    metadata: null,
    createdAt: now(),
    parts: [
      {
        id: 'part-1',
        messageId: 'message-1',
        partIndex: 0,
        type: 'text',
        textValue: 'hello',
        jsonValue: null,
        createdAt: now()
      }
    ]
  };
}

function createAssistantMessage(): Message & { parts: MessagePart[] } {
  return {
    id: 'message-2',
    threadId: 'thread-1',
    runId: 'run-1',
    role: 'assistant',
    seq: 2,
    status: 'completed',
    metadata: null,
    createdAt: now(),
    parts: [
      {
        id: 'part-2',
        messageId: 'message-2',
        partIndex: 0,
        type: 'text',
        textValue: 'Here is the answer.',
        jsonValue: null,
        createdAt: now()
      }
    ]
  };
}

function createCandidate(runId: string, ordinal: 0 | 1) {
  return {
    id: `candidate-${ordinal + 1}`,
    threadId: 'thread-1',
    triggerMessageId: 'message-1',
    runId,
    ordinal,
    kind: ordinal === 0 ? 'primary' : 'alternative',
    createdAt: now()
  };
}

function createSnapshot(runId = 'run-1', threadId = 'thread-1'): RunStreamSnapshotEventDto {
  return {
    type: 'run.snapshot',
    runId,
    run: createRunDto({ id: runId, threadId }),
    version: 0,
    assistant: null
  };
}

async function readResponseText(response: Response) {
  return response.text();
}

async function readSseEvents(response: Response): Promise<SseEvent[]> {
  const text = await readResponseText(response);
  return text
    .trim()
    .split('\n\n')
    .filter(Boolean)
    .map((chunk) => {
      const lines = chunk.split('\n');
      const type = lines.find((line) => line.startsWith('event: '))?.slice('event: '.length) ?? '';
      const data = lines.find((line) => line.startsWith('data: '))?.slice('data: '.length) ?? '{}';
      return {
        type,
        data: JSON.parse(data) as Record<string, unknown>
      };
    });
}

async function waitForRouteWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function importStreamRoute() {
  return import('../app/api/threads/[threadId]/runs/stream/route');
}

async function importRunsRoute() {
  return import('../app/api/threads/[threadId]/runs/route');
}

async function importAttachRoute() {
  return import('../app/api/threads/[threadId]/runs/[runId]/attach-stream/route');
}

function mockThreadAccess(overrides: {
  bindRuntimeIfUnset?: ReturnType<typeof vi.fn>;
  loadAccessibleThread?: ReturnType<typeof vi.fn>;
  requirePlaygroundUser?: ReturnType<typeof vi.fn>;
  resolveThreadRuntimeBinding?: ReturnType<typeof vi.fn>;
} = {}) {
  const loadAccessibleThread = overrides.loadAccessibleThread ?? vi.fn().mockResolvedValue({ catalogRow: null });
  const requirePlaygroundUser = overrides.requirePlaygroundUser ?? vi.fn().mockResolvedValue({ user, response: null });
  const bindRuntimeIfUnset = overrides.bindRuntimeIfUnset ?? vi.fn().mockResolvedValue(undefined);
  const resolveThreadRuntimeBinding = overrides.resolveThreadRuntimeBinding ?? vi.fn().mockResolvedValue(null);

  vi.doMock('@/lib/playground-thread-access', () => ({
    bindRuntimeIfUnset,
    loadAccessibleThread,
    requirePlaygroundUser,
    resolveThreadRuntimeBinding
  }));

  return {
    bindRuntimeIfUnset,
    loadAccessibleThread,
    requirePlaygroundUser,
    resolveThreadRuntimeBinding
  };
}

function mockRuntimeServices(overrides: {
  getPlaygroundRuntimeServices?: ReturnType<typeof vi.fn>;
  isPlaygroundWebSearchConfigured?: ReturnType<typeof vi.fn>;
} = {}) {
  const runTurn = vi.fn().mockResolvedValue(undefined);
  const prepare = vi.fn().mockResolvedValue({
    provider: 'openai',
    model: 'gpt-4o-mini'
  });
  const generateText = vi.fn().mockResolvedValue({
    provider: 'openai',
    model: 'gpt-4o-mini',
    text: 'Generated Thread Title'
  });
  const startText = vi.fn().mockResolvedValue({
    run: createRun({ triggerMessageId: 'message-1' }),
    userMessage: createUserMessage(),
    runtimeSelection: {
      provider: 'openai',
      model: 'gpt-4o-mini'
    }
  });
  const startTextCandidates = vi.fn().mockResolvedValue({
    triggerMessageId: 'message-1',
    userMessage: createUserMessage(),
    candidates: [
      {
        candidate: createCandidate('run-1', 0),
        run: createRun({ id: 'run-1', triggerMessageId: 'message-1' })
      },
      {
        candidate: createCandidate('run-2', 1),
        run: createRun({ id: 'run-2', triggerMessageId: 'message-1' })
      }
    ],
    answerSelection: {
      threadId: 'thread-1',
      triggerMessageId: 'message-1',
      selectedRunId: 'run-1',
      source: 'default',
      selectedByUserId: null,
      createdAt: now(),
      updatedAt: now()
    },
    runtimeSelection: {
      provider: 'openai',
      model: 'gpt-4o-mini'
    }
  });
  const runText = vi.fn().mockResolvedValue({
    run: createRun({ status: 'completed', finishedAt: now(), triggerMessageId: 'message-1' }),
    messages: [createUserMessage(), createAssistantMessage()],
    debug: {
      runEventCount: 2,
      toolInvocationCount: 0
    }
  });
  const rename = vi.fn().mockResolvedValue(createThread({
    title: 'Generated Thread Title',
    updatedAt: new Date('2026-01-01T00:00:10.000Z')
  }));
  const findThreadById = vi.fn().mockResolvedValue(createThread());
  const listMessagesByThread = vi.fn().mockResolvedValue([createUserMessage(), createAssistantMessage()]);
  const findRunById = vi.fn().mockResolvedValue(createRun({
    status: 'completed',
    triggerMessageId: 'message-1'
  }));
  const services = {
    app: {
      threads: {
        rename
      },
      turns: {
        runText,
        startText,
        startTextCandidates
      }
    },
    durableRuntime: {
      generateText,
      prepare,
      runTurn
    },
    repos: {
      runRepo: {
        findById: findRunById
      },
      messageRepo: {
        listByThread: listMessagesByThread
      },
      threadRepo: {
        findById: findThreadById
      },
      toolRepo: {},
      runEventRepo: {}
    }
  };
  const getPlaygroundRuntimeServices = overrides.getPlaygroundRuntimeServices ?? vi.fn().mockResolvedValue(services);
  const isPlaygroundWebSearchConfigured = overrides.isPlaygroundWebSearchConfigured ?? vi.fn().mockReturnValue(true);

  vi.doMock('@/lib/playground-services', () => ({
    getPlaygroundRuntimeServices,
    isPlaygroundWebSearchConfigured
  }));

  return {
    getPlaygroundRuntimeServices,
    findRunById,
    findThreadById,
    generateText,
    isPlaygroundWebSearchConfigured,
    listMessagesByThread,
    prepare,
    rename,
    runText,
    runTurn,
    services,
    startText,
    startTextCandidates
  };
}

function mockAppServices(overrides: {
  findById?: ReturnType<typeof vi.fn>;
  getPlaygroundAppServices?: ReturnType<typeof vi.fn>;
} = {}) {
  const findById = overrides.findById ?? vi.fn().mockResolvedValue(createRun());
  const services = {
    repos: {
      runRepo: {
        findById
      }
    }
  };
  const getPlaygroundAppServices = overrides.getPlaygroundAppServices ?? vi.fn().mockResolvedValue(services);

  vi.doMock('@/lib/playground-app-services', () => ({
    getPlaygroundAppServices
  }));

  return {
    findById,
    getPlaygroundAppServices,
    services
  };
}

describe('playground run stream route', () => {
  beforeEach(() => {
    vi.resetModules();
    getPlaygroundRunStreamHub().cleanup(Number.POSITIVE_INFINITY);
  });

  afterEach(() => {
    delete process.env.PLAYGROUND_DUAL_ANSWER_ENABLED;
    vi.doUnmock('@/lib/playground-app-services');
    vi.doUnmock('@/lib/playground-services');
    vi.doUnmock('@/lib/playground-thread-access');
    vi.resetModules();
  });

  it('short-circuits unauthenticated stream requests before loading runtime services', async () => {
    const unauthorized = Response.json({ error: 'unauthorized' }, { status: 401 });
    mockThreadAccess({
      requirePlaygroundUser: vi.fn().mockResolvedValue({ user: null, response: unauthorized })
    });
    const { getPlaygroundRuntimeServices } = mockRuntimeServices();
    const { POST } = await importStreamRoute();

    const response = await POST(new Request('http://localhost/api/threads/thread-1/runs/stream', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello' })
    }), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(getPlaygroundRuntimeServices).not.toHaveBeenCalled();
  });

  it('returns 503 when web search is requested but unavailable', async () => {
    mockThreadAccess();
    const { getPlaygroundRuntimeServices } = mockRuntimeServices({
      isPlaygroundWebSearchConfigured: vi.fn().mockReturnValue(false)
    });
    const { POST } = await importStreamRoute();

    const response = await POST(new Request('http://localhost/api/threads/thread-1/runs/stream', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello', webSearchEnabled: true })
    }), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Web search is unavailable because TAVILY_API_KEY is not configured.'
    });
    expect(getPlaygroundRuntimeServices).not.toHaveBeenCalled();
  });

  it('maps inaccessible thread errors through the route status helper', async () => {
    const { ThreadNotFoundError } = await import('@agent-infra/app');
    mockThreadAccess({
      loadAccessibleThread: vi.fn().mockRejectedValue(new ThreadNotFoundError('thread-1'))
    });
    mockRuntimeServices();
    const { POST } = await importStreamRoute();

    const response = await POST(new Request('http://localhost/api/threads/thread-1/runs/stream', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello' })
    }), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: 'thread thread-1 not found'
    });
  });

  it('streams run.ready before runtime execution finishes', async () => {
    mockThreadAccess();
    mockRuntimeServices();
    const { POST } = await importStreamRoute();

    const response = await POST(new Request('http://localhost/api/threads/thread-1/runs/stream', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello' })
    }), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });

    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    const events = await readSseEvents(response);
    expect(events[0]?.type).toBe('run.ready');
    expect(events[0]?.data).toMatchObject({
      type: 'run.ready',
      runId: 'run-1'
    });
  });

  it('rejects dual-answer stream requests when the feature flag is disabled', async () => {
    mockThreadAccess();
    const { getPlaygroundRuntimeServices } = mockRuntimeServices();
    const { POST } = await importStreamRoute();

    const response = await POST(new Request('http://localhost/api/threads/thread-1/runs/stream', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello', answerMode: 'dual', candidateCount: 2 })
    }), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Dual-answer streaming is disabled.'
    });
    expect(getPlaygroundRuntimeServices).not.toHaveBeenCalled();
  });

  it('starts two candidate runs and streams candidate metadata when dual-answer is enabled', async () => {
    process.env.PLAYGROUND_DUAL_ANSWER_ENABLED = 'true';
    mockThreadAccess();
    const completedRun1 = createRun({ id: 'run-1', status: 'completed', finishedAt: now(), triggerMessageId: 'message-1' });
    const completedRun2 = createRun({ id: 'run-2', status: 'completed', finishedAt: now(), triggerMessageId: 'message-1' });
    const { runTurn, startText, startTextCandidates } = mockRuntimeServices();
    runTurn.mockImplementation(async (
      _repos: unknown,
      input: { runId: string },
      callbacks: { onPersistedUpdate(update: { run: Run }): void }
    ) => {
      callbacks.onPersistedUpdate({ run: input.runId === 'run-1' ? completedRun1 : completedRun2 });
    });
    const { POST } = await importStreamRoute();

    const response = await POST(new Request('http://localhost/api/threads/thread-1/runs/stream', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello', answerMode: 'dual', candidateCount: 2 })
    }), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });

    const events = await readSseEvents(response);
    const readyEvents = events.filter((event) => event.type === 'run.ready');
    expect(startText).not.toHaveBeenCalled();
    expect(startTextCandidates).toHaveBeenCalledWith(expect.objectContaining({
      threadId: 'thread-1',
      text: 'hello',
      candidateCount: 2
    }));
    expect(runTurn).toHaveBeenCalledTimes(2);
    expect(runTurn.mock.calls.map((call) => (call[1] as { runId: string }).runId)).toEqual(['run-1', 'run-2']);
    expect(readyEvents).toHaveLength(2);
    expect(readyEvents[0]?.data).toMatchObject({
      type: 'run.ready',
      runId: 'run-1',
      triggerMessageId: 'message-1',
      candidateId: 'candidate-1',
      ordinal: 0,
      kind: 'primary'
    });
    expect(readyEvents[1]?.data).toMatchObject({
      type: 'run.ready',
      runId: 'run-2',
      triggerMessageId: 'message-1',
      candidateId: 'candidate-2',
      ordinal: 1,
      kind: 'alternative'
    });
  });

  it('keeps the dual stream open when one candidate fails before the sibling completes', async () => {
    process.env.PLAYGROUND_DUAL_ANSWER_ENABLED = 'true';
    mockThreadAccess();
    const failedRun1 = createRun({ id: 'run-1', status: 'failed', error: 'primary failed', finishedAt: now(), triggerMessageId: 'message-1' });
    const completedRun2 = createRun({ id: 'run-2', status: 'completed', finishedAt: now(), triggerMessageId: 'message-1' });
    const { runTurn } = mockRuntimeServices();
    runTurn.mockImplementation(async (
      _repos: unknown,
      input: { runId: string },
      callbacks: {
        onLiveAssistantUpdate(update: { messageId: string; kind: 'assistant_delta'; textDelta: string }): void;
        onPersistedUpdate(update: { run: Run }): void;
      }
    ) => {
      if (input.runId === 'run-1') {
        callbacks.onPersistedUpdate({ run: failedRun1 });
        return;
      }

      callbacks.onLiveAssistantUpdate({
        messageId: 'assistant-2',
        kind: 'assistant_delta',
        textDelta: 'alternative answer'
      });
      callbacks.onPersistedUpdate({ run: completedRun2 });
    });
    const { POST } = await importStreamRoute();

    const response = await POST(new Request('http://localhost/api/threads/thread-1/runs/stream', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello', candidateCount: 2 })
    }), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });

    const events = await readSseEvents(response);
    expect(events.map((event) => [event.type, event.data.runId])).toEqual([
      ['run.ready', 'run-1'],
      ['run.ready', 'run-2'],
      ['run.state', 'run-1'],
      ['run.failed', 'run-1'],
      ['run.assistant', 'run-2'],
      ['run.state', 'run-2'],
      ['run.completed', 'run-2'],
      ['thread.title_updated', undefined]
    ]);
  });

  it('auto-titles only once after a dual-answer turn finishes', async () => {
    process.env.PLAYGROUND_DUAL_ANSWER_ENABLED = 'true';
    mockThreadAccess();
    const completedRun1 = createRun({ id: 'run-1', status: 'completed', finishedAt: now(), triggerMessageId: 'message-1' });
    const completedRun2 = createRun({ id: 'run-2', status: 'completed', finishedAt: now(), triggerMessageId: 'message-1' });
    const { generateText, rename, runTurn } = mockRuntimeServices();
    runTurn.mockImplementation(async (
      _repos: unknown,
      input: { runId: string },
      callbacks: { onPersistedUpdate(update: { run: Run }): void }
    ) => {
      callbacks.onPersistedUpdate({ run: input.runId === 'run-1' ? completedRun1 : completedRun2 });
    });
    const { POST } = await importStreamRoute();

    const response = await POST(new Request('http://localhost/api/threads/thread-1/runs/stream', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello', candidateCount: 2 })
    }), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });

    const events = await readSseEvents(response);
    expect(events.filter((event) => event.type === 'thread.title_updated')).toHaveLength(1);
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(rename).toHaveBeenCalledTimes(1);
  });

  it('treats aborted dual stream clients as detach-only and leaves runtimes running', async () => {
    process.env.PLAYGROUND_DUAL_ANSWER_ENABLED = 'true';
    mockThreadAccess();
    let releaseRun1!: () => void;
    let releaseRun2!: () => void;
    const runTurn = vi.fn().mockImplementation(async (_repos: unknown, input: { runId: string }) => {
      await new Promise<void>((resolve) => {
        if (input.runId === 'run-1') {
          releaseRun1 = resolve;
        } else {
          releaseRun2 = resolve;
        }
      });
    });
    mockRuntimeServices({
      getPlaygroundRuntimeServices: vi.fn().mockResolvedValue({
        app: {
          turns: {
            startText: vi.fn(),
            startTextCandidates: vi.fn().mockResolvedValue({
              triggerMessageId: 'message-1',
              userMessage: createUserMessage(),
              candidates: [
                { candidate: createCandidate('run-1', 0), run: createRun({ id: 'run-1', triggerMessageId: 'message-1' }) },
                { candidate: createCandidate('run-2', 1), run: createRun({ id: 'run-2', triggerMessageId: 'message-1' }) }
              ],
              answerSelection: {
                threadId: 'thread-1',
                triggerMessageId: 'message-1',
                selectedRunId: 'run-1',
                source: 'default',
                selectedByUserId: null,
                createdAt: now(),
                updatedAt: now()
              },
              runtimeSelection: {
                provider: 'openai',
                model: 'gpt-4o-mini'
              }
            })
          }
        },
        durableRuntime: {
          generateText: vi.fn(),
          prepare: vi.fn(),
          runTurn
        },
        repos: {
          runRepo: {},
          messageRepo: {},
          toolRepo: {},
          runEventRepo: {}
        }
      })
    });
    const { POST } = await importStreamRoute();
    const controller = new AbortController();

    await POST(new Request('http://localhost/api/threads/thread-1/runs/stream', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello', candidateCount: 2 }),
      signal: controller.signal
    }), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });
    await waitForRouteWork();
    controller.abort();

    expect(runTurn).toHaveBeenCalledTimes(2);
    expect(getPlaygroundRunStreamHub().getSnapshot('run-1')).not.toBeNull();
    expect(getPlaygroundRunStreamHub().getSnapshot('run-2')).not.toBeNull();
    releaseRun1();
    releaseRun2();
  });

  it('does not fail the stream when runtime binding persistence fails after startText', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockThreadAccess({
      bindRuntimeIfUnset: vi.fn().mockRejectedValue(new Error('catalog write failed'))
    });
    mockRuntimeServices();
    const { POST } = await importStreamRoute();

    const response = await POST(new Request('http://localhost/api/threads/thread-1/runs/stream', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello' })
    }), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });

    const events = await readSseEvents(response);
    expect(events[0]?.type).toBe('run.ready');
    expect(warn).toHaveBeenCalledWith(
      'failed to persist thread runtime binding after successful startText',
      expect.objectContaining({
        threadId: 'thread-1',
        runId: 'run-1'
      })
    );
    warn.mockRestore();
  });

  it('serializes startText calls for the same thread without serializing runtime execution', async () => {
    mockThreadAccess();
    let releaseFirstStart!: (value: unknown) => void;
    const firstStart = new Promise((resolve) => {
      releaseFirstStart = resolve;
    });
    const startText = vi.fn()
      .mockReturnValueOnce(firstStart)
      .mockResolvedValue({
        run: createRun({ triggerMessageId: 'message-1' }),
        userMessage: createUserMessage(),
        runtimeSelection: {
          provider: 'openai',
          model: 'gpt-4o-mini'
        }
      });
    mockRuntimeServices({
      getPlaygroundRuntimeServices: vi.fn().mockResolvedValue({
        app: {
          threads: {
            rename: vi.fn()
          },
          turns: {
            startText
          }
        },
        durableRuntime: {
          generateText: vi.fn(),
          prepare: vi.fn(),
          runTurn: vi.fn().mockResolvedValue(undefined)
        },
        repos: {
          runRepo: {
            findById: vi.fn()
          },
          messageRepo: {
            listByThread: vi.fn()
          },
          threadRepo: {
            findById: vi.fn()
          },
          toolRepo: {},
          runEventRepo: {}
        }
      })
    });
    const { POST } = await importStreamRoute();

    const firstResponsePromise = POST(new Request('http://localhost/api/threads/thread-1/runs/stream', {
      method: 'POST',
      body: JSON.stringify({ text: 'first' })
    }), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });
    await waitForRouteWork();
    expect(startText).toHaveBeenCalledTimes(1);

    const secondResponsePromise = POST(new Request('http://localhost/api/threads/thread-1/runs/stream', {
      method: 'POST',
      body: JSON.stringify({ text: 'second' })
    }), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });
    await waitForRouteWork();
    expect(startText).toHaveBeenCalledTimes(1);

    releaseFirstStart({
      run: createRun({ triggerMessageId: 'message-1' }),
      userMessage: createUserMessage(),
      runtimeSelection: {
        provider: 'openai',
        model: 'gpt-4o-mini'
      }
    });

    await readSseEvents(await firstResponsePromise);
    await readSseEvents(await secondResponsePromise);
    expect(startText).toHaveBeenCalledTimes(2);
  });

  it('serializes dual-answer starts for the same thread while allowing one turn to create two runs', async () => {
    process.env.PLAYGROUND_DUAL_ANSWER_ENABLED = 'true';
    mockThreadAccess();
    let releaseFirstStart!: (value: unknown) => void;
    const firstStart = new Promise((resolve) => {
      releaseFirstStart = resolve;
    });
    const queued = {
      triggerMessageId: 'message-1',
      userMessage: createUserMessage(),
      candidates: [
        { candidate: createCandidate('run-1', 0), run: createRun({ id: 'run-1', triggerMessageId: 'message-1' }) },
        { candidate: createCandidate('run-2', 1), run: createRun({ id: 'run-2', triggerMessageId: 'message-1' }) }
      ],
      answerSelection: {
        threadId: 'thread-1',
        triggerMessageId: 'message-1',
        selectedRunId: 'run-1',
        source: 'default',
        selectedByUserId: null,
        createdAt: now(),
        updatedAt: now()
      },
      runtimeSelection: {
        provider: 'openai',
        model: 'gpt-4o-mini'
      }
    };
    const startTextCandidates = vi.fn()
      .mockReturnValueOnce(firstStart)
      .mockResolvedValue(queued);
    mockRuntimeServices({
      getPlaygroundRuntimeServices: vi.fn().mockResolvedValue({
        app: {
          turns: {
            startText: vi.fn(),
            startTextCandidates
          }
        },
        durableRuntime: {
          generateText: vi.fn(),
          prepare: vi.fn(),
          runTurn: vi.fn().mockResolvedValue(undefined)
        },
        repos: {
          runRepo: {},
          messageRepo: {},
          toolRepo: {},
          runEventRepo: {}
        }
      })
    });
    const { POST } = await importStreamRoute();

    const firstResponsePromise = POST(new Request('http://localhost/api/threads/thread-1/runs/stream', {
      method: 'POST',
      body: JSON.stringify({ text: 'first', candidateCount: 2 })
    }), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });
    await waitForRouteWork();
    expect(startTextCandidates).toHaveBeenCalledTimes(1);

    const secondResponsePromise = POST(new Request('http://localhost/api/threads/thread-1/runs/stream', {
      method: 'POST',
      body: JSON.stringify({ text: 'second', candidateCount: 2 })
    }), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });
    await waitForRouteWork();
    expect(startTextCandidates).toHaveBeenCalledTimes(1);

    releaseFirstStart(queued);

    await readSseEvents(await firstResponsePromise);
    await readSseEvents(await secondResponsePromise);
    expect(startTextCandidates).toHaveBeenCalledTimes(2);
    expect(startTextCandidates.mock.calls[0]?.[0]).toMatchObject({ candidateCount: 2 });
  });

  it('emits one terminal completed event when completion is observed more than once', async () => {
    mockThreadAccess();
    const completedRun = createRun({ status: 'completed', finishedAt: now() });
    mockRuntimeServices({
      getPlaygroundRuntimeServices: vi.fn().mockResolvedValue({
        app: {
          turns: {
            startText: vi.fn().mockResolvedValue({
              run: createRun(),
              userMessage: createUserMessage(),
              runtimeSelection: {
                provider: 'openai',
                model: 'gpt-4o-mini'
              }
            })
          }
        },
        durableRuntime: {
          runTurn: vi.fn().mockImplementation(async (
            _repos: unknown,
            _input: unknown,
            callbacks: { onPersistedUpdate(update: { run: Run }): void }
          ) => {
            callbacks.onPersistedUpdate({ run: completedRun });
            callbacks.onPersistedUpdate({ run: completedRun });
          })
        },
        repos: {
          runRepo: {},
          messageRepo: {},
          toolRepo: {},
          runEventRepo: {}
        }
      })
    });
    const { POST } = await importStreamRoute();

    const response = await POST(new Request('http://localhost/api/threads/thread-1/runs/stream', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello' })
    }), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });

    const events = await readSseEvents(response);
    const completedEvents = events.filter((event) => event.type === 'run.completed');
    expect(events.map((event) => event.type)).toEqual(['run.ready', 'run.state', 'run.completed', 'run.state']);
    expect(completedEvents).toHaveLength(1);
  });

  it('emits a private thread title update after a completed run auto-titles the thread', async () => {
    mockThreadAccess();
    const completedRun = createRun({ status: 'completed', finishedAt: now() });
    const { generateText, rename, runTurn } = mockRuntimeServices();
    runTurn.mockImplementation(async (
      _repos: unknown,
      _input: unknown,
      callbacks: { onPersistedUpdate(update: { run: Run }): void }
    ) => {
      callbacks.onPersistedUpdate({ run: completedRun });
    });
    const { POST } = await importStreamRoute();

    const response = await POST(new Request('http://localhost/api/threads/thread-1/runs/stream', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello' })
    }), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });

    const events = await readSseEvents(response);
    expect(events.map((event) => event.type)).toEqual(['run.ready', 'run.state', 'run.completed', 'thread.title_updated']);
    expect(events.at(-1)?.data).toEqual({
      type: 'thread.title_updated',
      threadId: 'thread-1',
      title: 'Generated Thread Title',
      updatedAt: '2026-01-01T00:00:10.000Z'
    });
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
      maxTokens: 24,
      reasoningEffort: 'off',
      temperature: 0.2,
      userPrompt: expect.stringContaining('User question:')
    }));
    expect(rename).toHaveBeenCalledWith({
      threadId: 'thread-1',
      title: 'Generated Thread Title'
    });
  });

  it('does not auto-title when the thread already has a non-default title', async () => {
    mockThreadAccess();
    const completedRun = createRun({ status: 'completed', finishedAt: now() });
    const { findThreadById, generateText, rename, runTurn } = mockRuntimeServices();
    findThreadById.mockResolvedValue(createThread({ title: 'Existing Title' }));
    runTurn.mockImplementation(async (
      _repos: unknown,
      _input: unknown,
      callbacks: { onPersistedUpdate(update: { run: Run }): void }
    ) => {
      callbacks.onPersistedUpdate({ run: completedRun });
    });
    const { POST } = await importStreamRoute();

    const response = await POST(new Request('http://localhost/api/threads/thread-1/runs/stream', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello' })
    }), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });

    const events = await readSseEvents(response);
    expect(events.map((event) => event.type)).toEqual(['run.ready', 'run.state', 'run.completed']);
    expect(generateText).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
  });

  it('keeps the completed stream intact when auto-title generation fails', async () => {
    mockThreadAccess();
    const completedRun = createRun({ status: 'completed', finishedAt: now() });
    const { generateText, rename, runTurn } = mockRuntimeServices();
    generateText.mockRejectedValue(new Error('title model unavailable'));
    runTurn.mockImplementation(async (
      _repos: unknown,
      _input: unknown,
      callbacks: { onPersistedUpdate(update: { run: Run }): void }
    ) => {
      callbacks.onPersistedUpdate({ run: completedRun });
    });
    const { POST } = await importStreamRoute();

    const response = await POST(new Request('http://localhost/api/threads/thread-1/runs/stream', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello' })
    }), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });

    const events = await readSseEvents(response);
    expect(events.map((event) => event.type)).toEqual(['run.ready', 'run.state', 'run.completed']);
    expect(rename).not.toHaveBeenCalled();
  });

  it('emits one terminal failed event when runtime execution fails', async () => {
    mockThreadAccess();
    mockRuntimeServices({
      getPlaygroundRuntimeServices: vi.fn().mockResolvedValue({
        app: {
          turns: {
            startText: vi.fn().mockResolvedValue({
              run: createRun(),
              userMessage: createUserMessage(),
              runtimeSelection: {
                provider: 'openai',
                model: 'gpt-4o-mini'
              }
            })
          }
        },
        durableRuntime: {
          runTurn: vi.fn().mockRejectedValue(new Error('provider exploded'))
        },
        repos: {
          runRepo: {},
          messageRepo: {},
          toolRepo: {},
          runEventRepo: {}
        }
      })
    });
    const { POST } = await importStreamRoute();

    const response = await POST(new Request('http://localhost/api/threads/thread-1/runs/stream', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello' })
    }), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });

    const events = await readSseEvents(response);
    const failedEvents = events.filter((event) => event.type === 'run.failed');
    expect(events.map((event) => event.type)).toEqual(['run.ready', 'run.failed']);
    expect(failedEvents).toHaveLength(1);
    expect(failedEvents[0]?.data).toMatchObject({
      type: 'run.failed',
      runId: 'run-1',
      error: 'provider exploded'
    });
    expect(
      getPlaygroundRunStreamHub().publish('run-1', {
        type: 'run.assistant',
        runId: 'run-1',
        version: 99,
        assistant: {
          messageId: 'assistant-1',
          kind: 'assistant_delta',
          textDelta: 'late'
        }
      })
    ).toBe(false);
  });
});

describe('playground run attach stream route', () => {
  beforeEach(() => {
    vi.resetModules();
    getPlaygroundRunStreamHub().cleanup(Number.POSITIVE_INFINITY);
  });

  afterEach(() => {
    vi.doUnmock('@/lib/playground-app-services');
    vi.doUnmock('@/lib/playground-services');
    vi.doUnmock('@/lib/playground-thread-access');
    vi.resetModules();
  });

  it('returns run_not_found when the run does not exist', async () => {
    mockThreadAccess();
    mockAppServices({
      findById: vi.fn().mockResolvedValue(null)
    });
    const { GET } = await importAttachRoute();

    const response = await GET(new Request('http://localhost/api/threads/thread-1/runs/run-404/attach-stream'), {
      params: Promise.resolve({ threadId: 'thread-1', runId: 'run-404' })
    });

    const events = await readSseEvents(response);
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toMatchObject({
      type: 'run.attach_unavailable',
      runId: 'run-404',
      reason: 'run_not_found'
    });
  });

  it('does not leak cross-thread run metadata when the owning thread is inaccessible', async () => {
    const loadAccessibleThread = vi.fn().mockImplementation(async (_services, threadId: string) => {
      if (threadId === 'other-thread') {
        throw new Error('not authorized');
      }
      return { catalogRow: null };
    });
    mockThreadAccess({ loadAccessibleThread });
    mockAppServices({
      findById: vi.fn().mockResolvedValue(createRun({ threadId: 'other-thread' }))
    });
    const { GET } = await importAttachRoute();

    const response = await GET(new Request('http://localhost/api/threads/thread-1/runs/run-1/attach-stream'), {
      params: Promise.resolve({ threadId: 'thread-1', runId: 'run-1' })
    });

    const events = await readSseEvents(response);
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toMatchObject({
      type: 'run.attach_unavailable',
      runId: 'run-1',
      reason: 'run_not_found'
    });
    expect(events[0]?.data.run).toBeUndefined();
  });

  it('returns thread_run_mismatch when both threads are accessible', async () => {
    mockThreadAccess();
    mockAppServices({
      findById: vi.fn().mockResolvedValue(createRun({ threadId: 'other-thread' }))
    });
    const { GET } = await importAttachRoute();

    const response = await GET(new Request('http://localhost/api/threads/thread-1/runs/run-1/attach-stream'), {
      params: Promise.resolve({ threadId: 'thread-1', runId: 'run-1' })
    });

    const events = await readSseEvents(response);
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toMatchObject({
      type: 'run.attach_unavailable',
      runId: 'run-1',
      reason: 'thread_run_mismatch',
      message: 'run does not belong to the requested thread',
      run: {
        id: 'run-1',
        threadId: 'other-thread'
      }
    });
  });

  it('returns stream_session_gone for an active run without a snapshot', async () => {
    mockThreadAccess();
    mockAppServices({
      findById: vi.fn().mockResolvedValue(createRun({ status: 'running' }))
    });
    const { GET } = await importAttachRoute();

    const response = await GET(new Request('http://localhost/api/threads/thread-1/runs/run-1/attach-stream'), {
      params: Promise.resolve({ threadId: 'thread-1', runId: 'run-1' })
    });

    const events = await readSseEvents(response);
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toMatchObject({
      type: 'run.attach_unavailable',
      runId: 'run-1',
      reason: 'stream_session_gone',
      run: {
        id: 'run-1',
        status: 'running'
      }
    });
  });

  it('returns run_not_active for a terminal run without a snapshot', async () => {
    mockThreadAccess();
    mockAppServices({
      findById: vi.fn().mockResolvedValue(createRun({ status: 'completed', finishedAt: now() }))
    });
    const { GET } = await importAttachRoute();

    const response = await GET(new Request('http://localhost/api/threads/thread-1/runs/run-1/attach-stream'), {
      params: Promise.resolve({ threadId: 'thread-1', runId: 'run-1' })
    });

    const events = await readSseEvents(response);
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toMatchObject({
      type: 'run.attach_unavailable',
      runId: 'run-1',
      reason: 'run_not_active',
      run: {
        id: 'run-1',
        status: 'completed'
      }
    });
  });

  it('streams the current snapshot first when attach succeeds', async () => {
    getPlaygroundRunStreamHub().openSession(createSnapshot());
    mockThreadAccess();
    mockAppServices({
      findById: vi.fn().mockResolvedValue(createRun())
    });
    const { GET } = await importAttachRoute();

    const response = await GET(new Request('http://localhost/api/threads/thread-1/runs/run-1/attach-stream'), {
      params: Promise.resolve({ threadId: 'thread-1', runId: 'run-1' })
    });
    getPlaygroundRunStreamHub().closeSession('run-1');

    const events = await readSseEvents(response);
    expect(events[0]?.data).toMatchObject({
      type: 'run.snapshot',
      runId: 'run-1',
      version: 0
    });
  });

  it('recovers each active candidate run through its own attach stream', async () => {
    getPlaygroundRunStreamHub().openSession(createSnapshot('run-1'));
    getPlaygroundRunStreamHub().openSession(createSnapshot('run-2'));
    mockThreadAccess();
    mockAppServices({
      findById: vi.fn().mockImplementation(async (runId: string) => createRun({ id: runId }))
    });
    const { GET } = await importAttachRoute();

    const firstResponse = await GET(new Request('http://localhost/api/threads/thread-1/runs/run-1/attach-stream'), {
      params: Promise.resolve({ threadId: 'thread-1', runId: 'run-1' })
    });
    const secondResponse = await GET(new Request('http://localhost/api/threads/thread-1/runs/run-2/attach-stream'), {
      params: Promise.resolve({ threadId: 'thread-1', runId: 'run-2' })
    });
    getPlaygroundRunStreamHub().closeSession('run-1');
    getPlaygroundRunStreamHub().closeSession('run-2');

    await expect(readSseEvents(firstResponse)).resolves.toMatchObject([
      { type: 'run.snapshot', data: { runId: 'run-1' } }
    ]);
    await expect(readSseEvents(secondResponse)).resolves.toMatchObject([
      { type: 'run.snapshot', data: { runId: 'run-2' } }
    ]);
  });
});

describe('playground run route', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@/lib/playground-app-services');
    vi.doUnmock('@/lib/playground-services');
    vi.doUnmock('@/lib/playground-thread-access');
    vi.resetModules();
  });

  it('does not fail a completed non-stream run when runtime binding persistence fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockThreadAccess({
      bindRuntimeIfUnset: vi.fn().mockRejectedValue(new Error('catalog write failed'))
    });
    const { runText } = mockRuntimeServices();
    const { POST } = await importRunsRoute();

    const response = await POST(new Request('http://localhost/api/threads/thread-1/runs', {
      method: 'POST',
      body: JSON.stringify({ text: 'hello' })
    }), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      run: {
        id: 'run-1',
        status: 'completed'
      }
    });
    expect(runText).toHaveBeenCalledWith(expect.objectContaining({
      threadId: 'thread-1',
      text: 'hello'
    }));
    expect(warn).toHaveBeenCalledWith(
      'failed to persist thread runtime binding after successful runText',
      expect.objectContaining({
        threadId: 'thread-1',
        runId: 'run-1'
      })
    );
    warn.mockRestore();
  });
});
