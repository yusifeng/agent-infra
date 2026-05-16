import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnswerCandidate, AnswerSelection, Message, MessagePart, Run, RunFeedback } from '@agent-infra/core';

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

function createMessage(
  overrides: Partial<Message> & {
    parts?: MessagePart[];
  } = {}
): Message & { parts: MessagePart[] } {
  const id = overrides.id ?? 'message-1';

  return {
    id,
    threadId: 'thread-1',
    runId: null,
    role: 'assistant',
    seq: 1,
    status: 'completed',
    metadata: null,
    createdAt: now(),
    ...overrides,
    parts: overrides.parts ?? [
      {
        id: `${id}-part-1`,
        messageId: id,
        partIndex: 0,
        type: 'text',
        textValue: 'hello',
        jsonValue: null,
        createdAt: now()
      }
    ]
  };
}

function createPart(
  messageId: string,
  partIndex: number,
  type: MessagePart['type'],
  jsonValue: Record<string, unknown> | null,
  textValue: string | null = null
): MessagePart {
  return {
    id: `${messageId}-part-${partIndex}`,
    messageId,
    partIndex,
    type,
    textValue,
    jsonValue,
    createdAt: now()
  };
}

function createMessagesWithPolicyOnlyToolTrace() {
  const assistant = createMessage({
    id: 'assistant-1',
    seq: 1,
    parts: [
      createPart('assistant-1', 0, 'text', null, 'before'),
      createPart('assistant-1', 1, 'tool-call', {
        toolCallId: 'call-policy',
        toolName: 'searchWeb',
        input: { query: 'blocked' }
      }),
      createPart('assistant-1', 2, 'text', null, 'after')
    ]
  });
  const policyResult = createMessage({
    id: 'tool-1',
    role: 'tool',
    seq: 2,
    parts: [
      createPart('tool-1', 0, 'tool-result', {
        toolCallId: 'call-policy',
        toolName: 'searchWeb',
        details: {
          status: 'blocked_by_policy'
        }
      })
    ]
  });
  const visible = createMessage({
    id: 'assistant-2',
    seq: 3,
    parts: [
      createPart('assistant-2', 0, 'text', null, 'visible')
    ]
  });

  return [assistant, policyResult, visible];
}

function createAnswerCandidate(overrides: Partial<AnswerCandidate> = {}): AnswerCandidate {
  return {
    id: 'candidate-1',
    threadId: 'thread-1',
    triggerMessageId: 'user-message',
    runId: 'run-1',
    ordinal: 0,
    kind: 'primary',
    createdAt: now(),
    ...overrides
  };
}

function createAnswerSelection(overrides: Partial<AnswerSelection> = {}): AnswerSelection {
  return {
    threadId: 'thread-1',
    triggerMessageId: 'user-message',
    selectedRunId: 'run-1',
    source: 'default',
    selectedByUserId: null,
    createdAt: now(),
    updatedAt: now(),
    ...overrides
  };
}

function createRunFeedback(overrides: Partial<RunFeedback> = {}): RunFeedback {
  return {
    id: 'feedback-1',
    threadId: 'thread-1',
    triggerMessageId: 'user-message',
    runId: 'run-1',
    feedbackActorId: 'user-1',
    value: 'thumbs_up',
    createdAt: now(),
    updatedAt: now(),
    ...overrides
  };
}

async function importMessagesRoute() {
  return import('../app/api/threads/[threadId]/messages/route');
}

function mockThreadAccess() {
  const loadAccessibleThread = vi.fn().mockResolvedValue({ catalogRow: null });
  const requirePlaygroundUser = vi.fn().mockResolvedValue({ user, response: null });

  vi.doMock('@/lib/playground-thread-access', () => ({
    loadAccessibleThread,
    requirePlaygroundUser
  }));

  return {
    loadAccessibleThread,
    requirePlaygroundUser
  };
}

function mockAppServices(overrides: {
  getMessages?: ReturnType<typeof vi.fn>;
  getCanonicalMessages?: ReturnType<typeof vi.fn>;
  getCanonicalMessagesPage?: ReturnType<typeof vi.fn>;
  getMessagesWithAnswerCandidates?: ReturnType<typeof vi.fn>;
  getMessagesPage?: ReturnType<typeof vi.fn>;
  getActiveByThread?: ReturnType<typeof vi.fn>;
  listActiveByThread?: ReturnType<typeof vi.fn>;
} = {}) {
  const getMessages = overrides.getMessages ?? vi.fn().mockResolvedValue(createMessagesWithPolicyOnlyToolTrace());
  const getCanonicalMessages = overrides.getCanonicalMessages ?? vi.fn().mockResolvedValue({
    messages: createMessagesWithPolicyOnlyToolTrace(),
    canonicalRunIds: [],
    diagnostics: []
  });
  const getMessagesPage = overrides.getMessagesPage ?? vi.fn().mockResolvedValue({
    messages: createMessagesWithPolicyOnlyToolTrace(),
    pageInfo: {
      hasOlder: false,
      hasNewer: true,
      startSeq: 1,
      endSeq: 3
    }
  });
  const getCanonicalMessagesPage = overrides.getCanonicalMessagesPage ?? vi.fn().mockResolvedValue({
    messages: createMessagesWithPolicyOnlyToolTrace(),
    pageInfo: {
      hasOlder: false,
      hasNewer: true,
      startSeq: 1,
      endSeq: 3
    },
    canonicalRunIds: [],
    diagnostics: []
  });
  const getMessagesWithAnswerCandidates = overrides.getMessagesWithAnswerCandidates ?? vi.fn().mockResolvedValue({
    messages: createMessagesWithPolicyOnlyToolTrace(),
    pageInfo: {
      hasOlder: false,
      hasNewer: true,
      startSeq: 1,
      endSeq: 3
    },
    activeRun: createRun(),
    activeRuns: [createRun()],
    answerCandidates: [],
    answerSelections: [],
    runFeedback: []
  });
  const getActiveByThread = overrides.getActiveByThread ?? vi.fn().mockResolvedValue(createRun());
  const listActiveByThread = overrides.listActiveByThread ?? vi.fn().mockResolvedValue([createRun()]);
  const services = {
    app: {
      runs: {
        getActiveByThread,
        listActiveByThread
      },
      threads: {
        getMessages,
        getCanonicalMessages,
        getCanonicalMessagesPage,
        getMessagesPage,
        getMessagesWithAnswerCandidates
      }
    }
  };
  const getPlaygroundAppServices = vi.fn().mockResolvedValue(services);

  vi.doMock('@/lib/playground-app-services', () => ({
    getPlaygroundAppServices
  }));

  return {
    getActiveByThread,
    getCanonicalMessages,
    getCanonicalMessagesPage,
    getMessages,
    getMessagesWithAnswerCandidates,
    getMessagesPage,
    listActiveByThread,
    getPlaygroundAppServices
  };
}

describe('playground thread messages route', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@/lib/playground-app-services');
    vi.doUnmock('@/lib/playground-thread-access');
    vi.resetModules();
  });

  it('filters policy-only tool traces from full thread messages', async () => {
    mockThreadAccess();
    const { getMessagesWithAnswerCandidates } = mockAppServices();
    const { GET } = await importMessagesRoute();

    const response = await GET(new Request('http://localhost/api/threads/thread-1/messages'), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      messages: [
        {
          id: 'assistant-1',
          parts: [
            { type: 'text', textValue: 'before' },
            { type: 'text', textValue: 'after' }
          ]
        },
        {
          id: 'assistant-2',
          parts: [
            { type: 'text', textValue: 'visible' }
          ]
        }
      ],
      activeRun: {
        id: 'run-1'
      },
      activeRuns: [{ id: 'run-1' }]
    });
    expect(getMessagesWithAnswerCandidates).toHaveBeenCalledWith({
      threadId: 'thread-1',
      limit: undefined,
      beforeSeq: undefined,
      afterSeq: undefined,
      feedbackActorId: 'user-1'
    });
  });

  it('serves replay-compatible canonical messages without unselected candidates when requested', async () => {
    mockThreadAccess();
    const { getCanonicalMessages, getMessagesWithAnswerCandidates } = mockAppServices({
      getCanonicalMessages: vi.fn().mockResolvedValue({
        messages: [
          createMessage({
            id: 'user-message',
            role: 'user',
            seq: 1,
            parts: [createPart('user-message', 0, 'text', null, 'question')]
          }),
          createMessage({
            id: 'selected-answer',
            runId: 'selected-run',
            role: 'assistant',
            seq: 3,
            parts: [createPart('selected-answer', 0, 'text', null, 'selected answer')]
          })
        ],
        canonicalRunIds: ['selected-run'],
        diagnostics: []
      })
    });
    const { GET } = await importMessagesRoute();

    const response = await GET(new Request('http://localhost/api/threads/thread-1/messages?projection=canonical'), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      messages: [
        {
          id: 'user-message',
          parts: [{ textValue: 'question' }]
        },
        {
          id: 'selected-answer',
          runId: 'selected-run',
          parts: [{ textValue: 'selected answer' }]
        }
      ]
    });
    expect(getCanonicalMessages).toHaveBeenCalledWith({ threadId: 'thread-1' });
    expect(getMessagesWithAnswerCandidates).not.toHaveBeenCalled();
  });

  it('returns answer candidate hydration data for chat messages', async () => {
    mockThreadAccess();
    mockAppServices({
      getMessagesWithAnswerCandidates: vi.fn().mockResolvedValue({
        messages: [
          createMessage({
            id: 'user-message',
            role: 'user',
            seq: 1,
            parts: [createPart('user-message', 0, 'text', null, 'question')]
          })
        ],
        pageInfo: undefined,
        activeRun: createRun({ id: 'run-2' }),
        activeRuns: [createRun({ id: 'run-2' }), createRun({ id: 'run-1' })],
        answerCandidates: [createAnswerCandidate({ runId: 'run-1' }), createAnswerCandidate({ id: 'candidate-2', runId: 'run-2', ordinal: 1, kind: 'alternative' })],
        answerSelections: [createAnswerSelection({ selectedRunId: 'run-1' })],
        runFeedback: [createRunFeedback({ runId: 'run-1' })]
      })
    });
    const { GET } = await importMessagesRoute();

    const response = await GET(new Request('http://localhost/api/threads/thread-1/messages'), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      activeRun: { id: 'run-2' },
      activeRuns: [{ id: 'run-2' }, { id: 'run-1' }],
      answerCandidates: [
        { runId: 'run-1', ordinal: 0, kind: 'primary' },
        { runId: 'run-2', ordinal: 1, kind: 'alternative' }
      ],
      answerSelections: [{ selectedRunId: 'run-1', source: 'default' }],
      runFeedback: [{ runId: 'run-1', value: 'thumbs_up' }]
    });
  });

  it('filters policy-only tool traces from paginated thread messages', async () => {
    mockThreadAccess();
    const { getCanonicalMessages, getCanonicalMessagesPage, getMessages, getMessagesWithAnswerCandidates, getMessagesPage } = mockAppServices({
      getMessagesWithAnswerCandidates: vi.fn().mockResolvedValue({
        messages: createMessagesWithPolicyOnlyToolTrace(),
        pageInfo: {
          hasOlder: false,
          hasNewer: true,
          startSeq: 1,
          endSeq: 3
        },
        activeRun: createRun(),
        activeRuns: [createRun()],
        answerCandidates: [createAnswerCandidate()],
        answerSelections: [createAnswerSelection()],
        runFeedback: [createRunFeedback()]
      })
    });
    const { GET } = await importMessagesRoute();

    const response = await GET(new Request('http://localhost/api/threads/thread-1/messages?limit=3'), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      messages: [
        {
          id: 'assistant-1',
          parts: [
            { type: 'text', textValue: 'before' },
            { type: 'text', textValue: 'after' }
          ]
        },
        {
          id: 'assistant-2',
          parts: [
            { type: 'text', textValue: 'visible' }
          ]
        }
      ],
      pageInfo: {
        hasOlder: false,
        hasNewer: true
      },
      answerCandidates: [{ runId: 'run-1' }],
      answerSelections: [{ selectedRunId: 'run-1' }],
      runFeedback: [{ value: 'thumbs_up' }]
    });
    expect(getMessages).not.toHaveBeenCalled();
    expect(getMessagesPage).not.toHaveBeenCalled();
    expect(getCanonicalMessages).not.toHaveBeenCalled();
    expect(getCanonicalMessagesPage).not.toHaveBeenCalled();
    expect(getMessagesWithAnswerCandidates).toHaveBeenCalledWith({
      threadId: 'thread-1',
      limit: 3,
      beforeSeq: undefined,
      afterSeq: undefined,
      feedbackActorId: 'user-1'
    });
  });

  it('keeps pagination cursors when every returned message is filtered out', async () => {
    mockThreadAccess();
    mockAppServices({
      getMessagesWithAnswerCandidates: vi.fn().mockResolvedValue({
        messages: [
          createMessage({
            id: 'tool-1',
            role: 'tool',
            seq: 2,
            parts: [
              createPart('tool-1', 0, 'tool-result', {
                toolCallId: 'call-policy',
                toolName: 'searchWeb',
                details: {
                  status: 'blocked_by_policy'
                }
              })
            ]
          })
        ],
        pageInfo: {
          hasOlder: true,
          hasNewer: true,
          startSeq: 2,
          endSeq: 2
        },
        canonicalRunIds: [],
        diagnostics: []
      })
    });
    const { GET } = await importMessagesRoute();
    const beforeCursor = Buffer.from(JSON.stringify({ threadId: 'thread-1', seq: 3 }), 'utf8').toString('base64url');

    const response = await GET(new Request(`http://localhost/api/threads/thread-1/messages?limit=1&before=${beforeCursor}`), {
      params: Promise.resolve({ threadId: 'thread-1' })
    });

    expect(response.status).toBe(200);
    const body = await response.json() as {
      messages: unknown[];
      pageInfo: {
        hasOlder: boolean;
        hasNewer: boolean;
        startCursor: string | null;
        endCursor: string | null;
      };
    };

    expect(body.messages).toEqual([]);
    expect(body.pageInfo).toMatchObject({
      hasOlder: true,
      hasNewer: true
    });
    expect(body.pageInfo.startCursor).toEqual(expect.any(String));
    expect(body.pageInfo.endCursor).toEqual(expect.any(String));
  });
});
