import crypto from 'node:crypto';

import type {
  Message,
  MessagePart,
  MessageRepository,
  Run,
  RunEvent,
  RunEventRepository,
  RunRepository,
  Thread,
  ToolInvocation,
  ToolInvocationRepository
} from '@agent-infra/core';
import type { AgentMessage, AgentTool } from '@mariozechner/pi-agent-core';
import {
  createAssistantMessageEventStream,
  fauxAssistantMessage,
  fauxToolCall,
  registerApiProvider,
  registerFauxProvider,
  Type,
  unregisterApiProviders,
  type AssistantMessage,
  type Context,
  type Model
} from '@mariozechner/pi-ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveRuntimePiConfigFromEnv } from '../src/config';
import {
  applyGenerateTextPayloadOverrides,
  computeStreamTextChange,
  createPiRuntime,
  runAssistantTurnWithPiInternal
} from '../src/runtime';
import { projectAgentMessagesForEnabledTools } from '../src/messages';

type StoredMessage = Message & { parts: MessagePart[] };

class InMemoryRunRepository implements RunRepository {
  readonly runs = new Map<string, Run>();

  async create(input: Omit<Run, 'createdAt'>): Promise<Run> {
    const createdAt = new Date();
    const run = { ...input, createdAt };
    this.runs.set(run.id, run);
    return run;
  }

  async findById(id: string): Promise<Run | null> {
    return this.runs.get(id) ?? null;
  }

  async updateStatus(id: string, status: Run['status'], patch: Partial<Run> = {}): Promise<Run> {
    const current = this.runs.get(id);
    if (!current) {
      throw new Error(`run ${id} not found`);
    }

    const next = { ...current, ...patch, status };
    this.runs.set(id, next);
    return next;
  }
}

class InMemoryMessageRepository implements MessageRepository {
  readonly messages = new Map<string, StoredMessage>();

  async create(input: Omit<Message, 'createdAt'>): Promise<Message> {
    const createdAt = new Date();
    const message: StoredMessage = { ...input, createdAt, parts: [] };
    this.messages.set(message.id, message);
    return { ...message };
  }

  async createWithNextSeq(input: Omit<Message, 'createdAt' | 'seq'>): Promise<Message> {
    return this.create({
      ...input,
      seq: await this.nextSeq(input.threadId)
    });
  }

  async updateStatus(id: string, status: Message['status']): Promise<Message> {
    const current = this.messages.get(id);
    if (!current) {
      throw new Error(`message ${id} not found`);
    }

    const next = { ...current, status };
    this.messages.set(id, next);
    return { ...next };
  }

  async createPart(input: Omit<MessagePart, 'createdAt'>): Promise<MessagePart> {
    const createdAt = new Date();
    const message = this.messages.get(input.messageId);
    if (!message) {
      throw new Error(`message ${input.messageId} not found`);
    }

    const part = { ...input, createdAt };
    message.parts.push(part);
    return part;
  }

  async listByThread(threadId: string): Promise<Array<Message & { parts: MessagePart[] }>> {
    return [...this.messages.values()]
      .filter((message) => message.threadId === threadId)
      .sort((left, right) => left.seq - right.seq)
      .map((message) => ({ ...message, parts: [...message.parts].sort((left, right) => left.partIndex - right.partIndex) }));
  }

  async nextSeq(threadId: string): Promise<number> {
    const maxSeq = [...this.messages.values()].filter((message) => message.threadId === threadId).reduce((max, message) => Math.max(max, message.seq), 0);
    return maxSeq + 1;
  }
}

class InMemoryToolInvocationRepository implements ToolInvocationRepository {
  readonly invocations = new Map<string, ToolInvocation>();

  async create(input: Omit<ToolInvocation, 'createdAt'>): Promise<ToolInvocation> {
    const createdAt = new Date();
    const invocation = { ...input, createdAt };
    this.invocations.set(invocation.id, invocation);
    return invocation;
  }

  async updateStatus(id: string, status: ToolInvocation['status'], patch: Partial<ToolInvocation> = {}): Promise<ToolInvocation> {
    const current = this.invocations.get(id);
    if (!current) {
      throw new Error(`tool invocation ${id} not found`);
    }

    const next = { ...current, ...patch, status };
    this.invocations.set(id, next);
    return next;
  }

  async listByRun(runId: string): Promise<ToolInvocation[]> {
    return [...this.invocations.values()].filter((invocation) => invocation.runId === runId);
  }
}

class FailOnceAssistantMessageRepository extends InMemoryMessageRepository {
  private failed = false;
  override async createPart(input: Omit<MessagePart, 'createdAt'>): Promise<MessagePart> {
    const message = this.messages.get(input.messageId);
    if (!this.failed && input.type === 'text' && message?.role === 'assistant') {
      this.failed = true;
      throw new Error('assistant persistence exploded');
    }

    return super.createPart(input);
  }
}

class SlowAssistantPersistenceMessageRepository extends InMemoryMessageRepository {
  override async createPart(input: Omit<MessagePart, 'createdAt'>): Promise<MessagePart> {
    const message = this.messages.get(input.messageId);
    if (message?.role === 'assistant' && (input.type === 'text' || input.type === 'reasoning')) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    return super.createPart(input);
  }
}

class FailOnceToolInvocationRepository extends InMemoryToolInvocationRepository {
  private failed = false;
  override async updateStatus(id: string, status: ToolInvocation['status'], patch: Partial<ToolInvocation> = {}): Promise<ToolInvocation> {
    if (!this.failed && status !== 'running') {
      this.failed = true;
      throw new Error('tool invocation persistence exploded');
    }

    return super.updateStatus(id, status, patch);
  }
}

class InMemoryRunEventRepository implements RunEventRepository {
  readonly events = new Map<string, RunEvent>();

  async append(input: Omit<RunEvent, 'createdAt'>): Promise<RunEvent> {
    const createdAt = new Date();
    const event = { ...input, createdAt };
    this.events.set(event.id, event);
    return event;
  }

  async listByRun(runId: string): Promise<RunEvent[]> {
    return [...this.events.values()].filter((event) => event.runId === runId).sort((left, right) => left.seq - right.seq);
  }

  async nextSeq(runId: string): Promise<number> {
    const maxSeq = [...this.events.values()].filter((event) => event.runId === runId).reduce((max, event) => Math.max(max, event.seq), 0);
    return maxSeq + 1;
  }
}

async function createSeedThread(messageRepo: InMemoryMessageRepository, threadId: string, text: string) {
  const message = await messageRepo.create({
    id: crypto.randomUUID(),
    threadId,
    runId: null,
    role: 'user',
    seq: 1,
    status: 'completed',
    metadata: null
  });

  await messageRepo.createPart({
    id: crypto.randomUUID(),
    messageId: message.id,
    partIndex: 0,
    type: 'text',
    textValue: text,
    jsonValue: null
  });
}

async function createPersistedTextMessage(
  messageRepo: InMemoryMessageRepository,
  input: { threadId: string; role: Message['role']; text: string; runId?: string | null }
) {
  const message = await messageRepo.createWithNextSeq({
    id: crypto.randomUUID(),
    threadId: input.threadId,
    runId: input.runId ?? null,
    role: input.role,
    status: 'completed',
    metadata: null
  });

  await messageRepo.createPart({
    id: crypto.randomUUID(),
    messageId: message.id,
    partIndex: 0,
    type: 'text',
    textValue: input.text,
    jsonValue: null
  });

  return messageRepo.listByThread(input.threadId).then((messages) => messages.find((item) => item.id === message.id)!);
}

async function createContext() {
  const thread: Thread = {
    id: 'thread-1',
    appId: 'test',
    userId: null,
    title: 'Thread',
    status: 'active',
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null
  };

  const runRepo = new InMemoryRunRepository();
  const messageRepo = new InMemoryMessageRepository();
  const toolRepo = new InMemoryToolInvocationRepository();
  const runEventRepo = new InMemoryRunEventRepository();

  const run = await runRepo.create({
    id: 'run-1',
    threadId: thread.id,
    triggerMessageId: null,
    provider: 'openai',
    model: 'gpt-4o-mini',
    status: 'queued',
    usage: null,
    error: null,
    startedAt: null,
    finishedAt: null
  });

  return {
    ctx: {
      runRepo,
      messageRepo,
      toolRepo,
      runEventRepo
    },
    thread,
    run
  };
}

async function createContextWithOverrides(overrides: Partial<typeof createContext extends () => Promise<infer T> ? T['ctx'] : never>) {
  const base = await createContext();
  return {
    ctx: {
      ...base.ctx,
      ...overrides
    },
    thread: base.thread,
    run: base.run
  };
}

function createAssistantMessage(input: {
  content: AssistantMessage['content'];
  stopReason?: AssistantMessage['stopReason'];
  omitUsage?: boolean;
  usage?: unknown;
}): AssistantMessage {
  const message: AssistantMessage = {
    role: 'assistant',
    content: input.content,
    api: 'scripted-test-api',
    provider: 'scripted-test-provider',
    model: 'scripted-test-model',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0
      }
    },
    stopReason: input.stopReason ?? 'stop',
    timestamp: Date.now()
  };

  if (input.omitUsage) {
    delete (message as { usage?: unknown }).usage;
  } else if (input.usage !== undefined) {
    (message as { usage?: unknown }).usage = input.usage;
  }

  return message;
}

function registerScriptedToolUseProvider(steps: Array<(context: Context) => ReturnType<typeof createAssistantMessageEventStream>>) {
  const api = `scripted-test-api-${crypto.randomUUID()}`;
  const sourceId = `scripted-provider-${crypto.randomUUID()}`;
  let index = 0;

  registerApiProvider(
    {
      api,
      stream(_model, context) {
        const step = steps[index++];
        if (!step) {
          throw new Error('No scripted provider step left');
        }

        return step(context);
      },
      streamSimple(_model, context) {
        const step = steps[index++];
        if (!step) {
          throw new Error('No scripted provider step left');
        }

        return step(context);
      }
    },
    sourceId
  );

  const model: Model<any> = {
    id: 'scripted-test-model',
    name: 'Scripted Test Model',
    api,
    provider: 'scripted-test-provider',
    baseUrl: 'http://localhost:0',
    reasoning: false,
    input: ['text'],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0
    },
    contextWindow: 128000,
    maxTokens: 16384
  };

  return {
    model,
    unregister() {
      unregisterApiProviders(sourceId);
    }
  };
}

function createToolUseTextThenToolOnlyStep(text: string, toolCallId: string, query: string) {
  return (_context: Context) => {
    const stream = createAssistantMessageEventStream();

    queueMicrotask(() => {
      stream.push({
        type: 'start',
        partial: createAssistantMessage({ content: [] })
      });
      stream.push({
        type: 'text_start',
        contentIndex: 0,
        partial: createAssistantMessage({
          content: [{ type: 'text', text: '' }]
        })
      });
      stream.push({
        type: 'text_delta',
        contentIndex: 0,
        delta: text,
        partial: createAssistantMessage({
          content: [{ type: 'text', text }]
        })
      });
      stream.push({
        type: 'text_end',
        contentIndex: 0,
        content: text,
        partial: createAssistantMessage({
          content: [{ type: 'text', text }]
        })
      });
      stream.push({
        type: 'toolcall_start',
        contentIndex: 1,
        partial: createAssistantMessage({
          content: [{ type: 'toolCall', id: toolCallId, name: 'searchWeb', arguments: {} }]
        })
      });
      stream.push({
        type: 'toolcall_end',
        contentIndex: 1,
        toolCall: { type: 'toolCall', id: toolCallId, name: 'searchWeb', arguments: { query } },
        partial: createAssistantMessage({
          content: [{ type: 'toolCall', id: toolCallId, name: 'searchWeb', arguments: { query } }]
        })
      });

      const finalMessage = createAssistantMessage({
        content: [{ type: 'toolCall', id: toolCallId, name: 'searchWeb', arguments: { query } }],
        stopReason: 'toolUse'
      });

      stream.push({
        type: 'done',
        reason: 'toolUse',
        message: finalMessage
      });
      stream.end(finalMessage);
    });

    return stream;
  };
}

function createFinalTextStep(text: string, options: { omitUsage?: boolean; usage?: unknown } = {}) {
  return (_context: Context) => {
    const stream = createAssistantMessageEventStream();

    queueMicrotask(() => {
      stream.push({
        type: 'start',
        partial: createAssistantMessage({ content: [] })
      });
      stream.push({
        type: 'text_start',
        contentIndex: 0,
        partial: createAssistantMessage({
          content: [{ type: 'text', text: '' }]
        })
      });
      stream.push({
        type: 'text_delta',
        contentIndex: 0,
        delta: text,
        partial: createAssistantMessage({
          content: [{ type: 'text', text }]
        })
      });
      stream.push({
        type: 'text_end',
        contentIndex: 0,
        content: text,
        partial: createAssistantMessage({
          content: [{ type: 'text', text }]
        })
      });

      const finalMessage = createAssistantMessage({
        content: [{ type: 'text', text }],
        omitUsage: options.omitUsage,
        usage: options.usage
      });

      stream.push({
        type: 'done',
        reason: 'stop',
        message: finalMessage
      });
      stream.end(finalMessage);
    });

    return stream;
  };
}

function createToolResultMessage(input: {
  toolCallId: string;
  toolName: string;
  text?: string;
  details?: unknown;
}): AgentMessage {
  return {
    role: 'toolResult',
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    content: [{ type: 'text', text: input.text ?? `${input.toolName} result` }],
    details: input.details,
    isError: false,
    timestamp: Date.now()
  };
}

describe('computeStreamTextChange', () => {
  it('returns deltas for prefix growth and replace for rewrites', () => {
    expect(computeStreamTextChange('', '好的')).toEqual({ kind: 'delta', value: '好的' });
    expect(computeStreamTextChange('好的', '好的，我来')).toEqual({ kind: 'delta', value: '，我来' });
    expect(computeStreamTextChange('好的，我来搜索', '我来搜索最新新闻')).toEqual({
      kind: 'replace',
      value: '我来搜索最新新闻'
    });
    expect(computeStreamTextChange('旧的思考', '')).toEqual({ kind: 'replace', value: '' });
  });
});

describe('applyGenerateTextPayloadOverrides', () => {
  it('disables thinking for DeepSeek generateText calls when reasoning is off', () => {
    expect(
      applyGenerateTextPayloadOverrides(
        { model: 'deepseek-v4-flash' },
        { provider: 'deepseek', model: 'deepseek-v4-flash' },
        { reasoningEffort: 'off' }
      )
    ).toEqual({
      model: 'deepseek-v4-flash',
      thinking: {
        type: 'disabled'
      }
    });
  });

  it('leaves non-DeepSeek or non-off payloads unchanged', () => {
    expect(
      applyGenerateTextPayloadOverrides(
        { model: 'gpt-4o-mini' },
        { provider: 'openai', model: 'gpt-4o-mini' },
        { reasoningEffort: 'off' }
      )
    ).toBeUndefined();

    expect(
      applyGenerateTextPayloadOverrides(
        { model: 'deepseek-v4-flash' },
        { provider: 'deepseek', model: 'deepseek-v4-flash' },
        { reasoningEffort: 'high' }
      )
    ).toBeUndefined();
  });
});

describe('projectAgentMessagesForEnabledTools', () => {
  it('keeps structured tool history for enabled tools', () => {
    const assistant = fauxAssistantMessage(
      [
        { type: 'text', text: 'I will search.' },
        fauxToolCall('searchWeb', { query: 'ICP filing time' }, { id: 'call-search' })
      ],
      { stopReason: 'toolUse' }
    );
    const toolResult = createToolResultMessage({
      toolCallId: 'call-search',
      toolName: 'searchWeb',
      text: 'Search result summary.'
    });

    expect(
      projectAgentMessagesForEnabledTools([assistant, toolResult], {
        enabledToolNames: new Set(['searchWeb'])
      })
    ).toEqual([assistant, toolResult]);
  });

  it('removes unavailable tool calls and paired tool results from initial history', () => {
    const assistant = fauxAssistantMessage(
      [
        { type: 'text', text: 'I will search.' },
        fauxToolCall('searchWeb', { query: 'ICP filing time' }, { id: 'call-search' })
      ],
      { stopReason: 'toolUse' }
    );
    const toolResult = createToolResultMessage({
      toolCallId: 'call-search',
      toolName: 'searchWeb',
      text: 'Search result summary.'
    });

    const projected = projectAgentMessagesForEnabledTools([assistant, toolResult], {
      enabledToolNames: new Set()
    });

    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({
      role: 'assistant',
      stopReason: 'stop',
      content: [{ type: 'text', text: 'I will search.' }]
    });
  });

  it('projects unavailable web search results as plain evidence text', () => {
    const assistant = fauxAssistantMessage([fauxToolCall('searchWeb', { query: 'ICP filing time' }, { id: 'call-search' })], {
      stopReason: 'toolUse'
    });
    const toolResult = createToolResultMessage({
      toolCallId: 'call-search',
      toolName: 'searchWeb',
      text: 'Search result summary.',
      details: {
        kind: 'web-search-summary',
        query: 'ICP filing time',
        summaryText: 'ICP filing commonly takes several business days and depends on province review.',
        sourceNames: ['Tencent Cloud', 'MIIT']
      }
    });

    expect(
      projectAgentMessagesForEnabledTools([assistant, toolResult], {
        enabledToolNames: new Set()
      })
    ).toEqual([
      expect.objectContaining({
        role: 'assistant',
        stopReason: 'stop',
        content: [
          {
            type: 'text',
            text: [
              'Historical web search evidence from a previous run.',
              'Query: ICP filing time',
              'Summary: ICP filing commonly takes several business days and depends on province review.',
              'Sources: Tencent Cloud, MIIT'
            ].join('\n')
          }
        ]
      })
    ]);
  });

  it('projects unavailable opened page results as plain evidence text', () => {
    const assistant = fauxAssistantMessage([fauxToolCall('openUrl', { url: 'https://example.com' }, { id: 'call-open' })], {
      stopReason: 'toolUse'
    });
    const toolResult = createToolResultMessage({
      toolCallId: 'call-open',
      toolName: 'openUrl',
      text: 'Opened page: Example\nURL: https://example.com\n\nPage evidence content.',
      details: {
        kind: 'open-url-summary',
        title: 'Example',
        finalUrl: 'https://example.com'
      }
    });

    expect(
      projectAgentMessagesForEnabledTools([assistant, toolResult], {
        enabledToolNames: new Set()
      })
    ).toEqual([
      expect.objectContaining({
        role: 'assistant',
        stopReason: 'stop',
        content: [
          {
            type: 'text',
            text: [
              'Historical web page evidence from a previous run.',
              'Title: Example',
              'URL: https://example.com',
              'Content excerpt: Opened page: Example URL: https://example.com Page evidence content.'
            ].join('\n')
          }
        ]
      })
    ]);
  });

  it('drops tool-only assistant messages when every tool call is unavailable', () => {
    const assistant = fauxAssistantMessage([fauxToolCall('openUrl', { url: 'https://example.com' }, { id: 'call-open' })], {
      stopReason: 'toolUse'
    });
    const toolResult = createToolResultMessage({
      toolCallId: 'call-open',
      toolName: 'openUrl',
      text: 'Opened page summary.'
    });

    expect(
      projectAgentMessagesForEnabledTools([assistant, toolResult], {
        enabledToolNames: new Set()
      })
    ).toEqual([]);
  });

  it('removes only unavailable tool blocks from mixed assistant messages', () => {
    const assistant = fauxAssistantMessage(
      [
        { type: 'text', text: 'Checking available and unavailable tools.' },
        fauxToolCall('getCurrentTime', { timezone: 'UTC' }, { id: 'call-time' }),
        fauxToolCall('searchWeb', { query: 'latest ICP rules' }, { id: 'call-search' })
      ],
      { stopReason: 'toolUse' }
    );
    const timeResult = createToolResultMessage({
      toolCallId: 'call-time',
      toolName: 'getCurrentTime',
      text: 'UTC now.'
    });
    const searchResult = createToolResultMessage({
      toolCallId: 'call-search',
      toolName: 'searchWeb',
      text: 'Search result summary.'
    });

    const projected = projectAgentMessagesForEnabledTools([assistant, timeResult, searchResult], {
      enabledToolNames: new Set(['getCurrentTime'])
    });

    expect(projected).toHaveLength(2);
    expect(projected[0]).toMatchObject({
      role: 'assistant',
      stopReason: 'toolUse'
    });
    expect(projected[0]?.role === 'assistant' && projected[0].content).toEqual([
      { type: 'text', text: 'Checking available and unavailable tools.' },
      fauxToolCall('getCurrentTime', { timezone: 'UTC' }, { id: 'call-time' })
    ]);
    expect(projected[1]).toEqual(timeResult);
  });

  it('drops orphan tool results instead of leaving invalid LLM context', () => {
    const orphan = createToolResultMessage({
      toolCallId: 'missing-call',
      toolName: 'searchWeb',
      text: 'Unpaired result.'
    });

    expect(
      projectAgentMessagesForEnabledTools([orphan], {
        enabledToolNames: new Set(['searchWeb'])
      })
    ).toEqual([]);
  });
});

describe('runAssistantTurnWithPiInternal', () => {
  const unregisterCallbacks: Array<() => void> = [];
  const originalDeepseekKey = process.env.DEEPSEEK_API_KEY;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalOpenAiModel = process.env.OPENAI_MODEL;

  afterEach(() => {
    while (unregisterCallbacks.length > 0) {
      unregisterCallbacks.pop()?.();
    }

    if (originalDeepseekKey === undefined) {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = originalDeepseekKey;
    }

    if (originalOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    }

    if (originalOpenAiModel === undefined) {
      delete process.env.OPENAI_MODEL;
    } else {
      process.env.OPENAI_MODEL = originalOpenAiModel;
    }
  });

  it('prefers DeepSeek from env when available', () => {
    process.env.DEEPSEEK_API_KEY = 'deepseek-key';
    delete process.env.OPENAI_API_KEY;

    expect(resolveRuntimePiConfigFromEnv()).toEqual({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      apiKey: 'deepseek-key'
    });
  });

  it('resolves an explicitly selected DeepSeek model from env', () => {
    process.env.DEEPSEEK_API_KEY = 'deepseek-key';
    process.env.OPENAI_API_KEY = 'openai-key';

    expect(resolveRuntimePiConfigFromEnv({ provider: 'deepseek', model: 'deepseek-v4-pro' })).toEqual({
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      apiKey: 'deepseek-key'
    });
  });

  it('persists a text-only assistant turn and full event log', async () => {
    const { ctx, thread, run } = await createContext();
    await createSeedThread(ctx.messageRepo, thread.id, 'hello');

    const faux = registerFauxProvider();
    unregisterCallbacks.push(faux.unregister);
    faux.setResponses([fauxAssistantMessage('Text only response.')]);

    await runAssistantTurnWithPiInternal(
      ctx,
      { threadId: thread.id, runId: run.id },
      {
        model: faux.getModel(),
        getApiKey: async () => 'faux-key'
      }
    );

    const storedRun = await ctx.runRepo.findById(run.id);
    const messages = await ctx.messageRepo.listByThread(thread.id);
    const events = await ctx.runEventRepo.listByRun(run.id);

    expect(storedRun?.status).toBe('completed');
    expect(storedRun?.usage).toMatchObject({
      schemaVersion: 1,
      normalizationStatus: 'complete',
      tokens: {
        input: expect.any(Number),
        output: expect.any(Number),
        cacheRead: expect.any(Number),
        cacheWrite: expect.any(Number),
        total: expect.any(Number)
      },
      estimatedCost: expect.objectContaining({
        currency: 'USD',
        amountMicros: expect.any(Number),
        source: 'pi-ai-message-usage'
      }),
      rawProviderUsage: {
        assistantMessages: [expect.any(Object)]
      }
    });
    expect(messages).toHaveLength(2);
    expect(messages[1]?.role).toBe('assistant');
    expect(messages[1]?.parts.map((part) => part.type)).toEqual(['text']);
    expect(events.map((event) => event.type)).toContain('agent_start');
    expect(events.map((event) => event.type)).toContain('message_end');
    expect(events.at(-1)?.type).toBe('agent_end');
  });

  it('marks run usage as missing instead of fabricating zero-token usage', async () => {
    const { ctx, thread, run } = await createContext();
    await createSeedThread(ctx.messageRepo, thread.id, 'hello without usage');

    const scripted = registerScriptedToolUseProvider([createFinalTextStep('No usage available.', { omitUsage: true })]);
    unregisterCallbacks.push(scripted.unregister);

    await runAssistantTurnWithPiInternal(
      ctx,
      { threadId: thread.id, runId: run.id },
      {
        model: scripted.model,
        getApiKey: async () => 'scripted-key'
      }
    );

    const storedRun = await ctx.runRepo.findById(run.id);
    expect(storedRun?.status).toBe('completed');
    expect(storedRun?.usage).toEqual({
      schemaVersion: 1,
      provider: 'scripted-test-provider',
      model: 'scripted-test-model',
      normalizationStatus: 'missing',
      tokens: {},
      estimatedCost: null,
      rawProviderUsage: null
    });
  });

  it('runs through the public runtime object with explicit tool injection', async () => {
    const { ctx, thread, run } = await createContext();
    await createSeedThread(ctx.messageRepo, thread.id, 'run public runtime');

    const faux = registerFauxProvider({
      models: [{ id: 'faux-public-model' }]
    });
    unregisterCallbacks.push(faux.unregister);
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall('echoText', { text: 'from-public-runtime' }, { id: 'call-echo' })], { stopReason: 'toolUse' }),
      fauxAssistantMessage('Public runtime complete.')
    ]);

    const runtime = createPiRuntime({
      model: faux.getModel('faux-public-model'),
      getApiKey: async () => 'faux-key',
      tools: [
        {
          name: 'echoText',
          label: 'Echo Text',
          description: 'Echo test tool.',
          parameters: Type.Object({
            text: Type.String({ description: 'Echo value.' })
          }),
          async execute(_toolCallId, params) {
            const input = params as { text: string };
            return {
              content: [{ type: 'text', text: input.text }],
              details: { echoedText: input.text }
            };
          }
        }
      ]
    });

    await runtime.runTurn(ctx, { threadId: thread.id, runId: run.id });

    const messages = await ctx.messageRepo.listByThread(thread.id);
    const invocations = await ctx.toolRepo.listByRun(run.id);

    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.toolName).toBe('echoText');
  });

  it('emits persisted updates while a run is executing', async () => {
    const { ctx, thread, run } = await createContext();
    await createSeedThread(ctx.messageRepo, thread.id, 'stream public runtime');

    const faux = registerFauxProvider({
      models: [{ id: 'faux-stream-model' }]
    });
    unregisterCallbacks.push(faux.unregister);
    faux.setResponses([fauxAssistantMessage('Stream me.')]);

    const runtime = createPiRuntime({
      model: faux.getModel('faux-stream-model'),
      getApiKey: async () => 'faux-key'
    });

    const updates: Array<{ type: string; hasRun: boolean }> = [];
    const liveAssistantTexts: string[] = [];

    await runtime.runTurn(
      ctx,
      { threadId: thread.id, runId: run.id },
      {
        onPersistedUpdate(update) {
          if (!update.runEvent) {
            return;
          }

          updates.push({
            type: update.runEvent.type,
            hasRun: Boolean(update.run)
          });
        },
        onLiveAssistantUpdate(update) {
          if (update.kind === 'assistant_delta') {
            liveAssistantTexts.push(update.textDelta);
          }
        }
      }
    );

    expect(updates.map((update) => update.type)).toContain('agent_start');
    expect(updates.map((update) => update.type)).not.toContain('message_update');
    expect(liveAssistantTexts).toContain('Stream me.');
    expect(updates.map((update) => update.type)).toContain('message_end');
    expect(updates.at(-1)).toEqual({
      type: 'agent_end',
      hasRun: true
    });
  });

  it('does not back-write assistant text across tool lifecycle updates', async () => {
    const { ctx, thread, run } = await createContext();
    await createSeedThread(ctx.messageRepo, thread.id, 'search GPT-5.5 news');

    const faux = registerFauxProvider({
      models: [{ id: 'faux-tool-stream-model' }]
    });
    unregisterCallbacks.push(faux.unregister);
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall('searchWeb', { query: 'GPT-5.5 news' }, { id: 'call-search' })], {
        text: '好的，我来搜索一下。',
        stopReason: 'toolUse'
      }),
      fauxAssistantMessage('根据搜索结果，这是最新摘要。')
    ]);

    const runtime = createPiRuntime({
      model: faux.getModel('faux-tool-stream-model'),
      getApiKey: async () => 'faux-key',
      tools: [
        {
          name: 'searchWeb',
          description: 'Search the web',
          parameters: Type.Object({
            query: Type.String()
          }),
          execute: async () => ({
            content: [{ type: 'text', text: 'result' }]
          })
        }
      ]
    });

    const liveUpdates: Array<{ kind: string; value: string }> = [];

    await runtime.runTurn(
      ctx,
      { threadId: thread.id, runId: run.id },
      {
        onLiveAssistantUpdate(update) {
          if (update.kind === 'assistant_delta') {
            liveUpdates.push({ kind: update.kind, value: update.textDelta });
            return;
          }

          if (update.kind === 'tool_event') {
            liveUpdates.push({ kind: update.kind, value: `${update.toolName}:${update.phase}` });
          }
        }
      }
    );

    expect(liveUpdates).toContainEqual({ kind: 'tool_event', value: 'searchWeb:start' });
    expect(liveUpdates).toContainEqual({ kind: 'tool_event', value: 'searchWeb:completed' });
    expect(
      liveUpdates.filter((update) => update.kind === 'assistant_delta').map((update) => update.value)
    ).toEqual(['根据搜索结果，这是最新摘要。']);
  });

  it('starts a fresh live assistant segment for each tool cycle in the same run', async () => {
    const { ctx, thread, run } = await createContext();
    await createSeedThread(ctx.messageRepo, thread.id, 'search GPT-5.5 news twice');

    const faux = registerFauxProvider({
      models: [{ id: 'faux-multi-search-model' }]
    });
    unregisterCallbacks.push(faux.unregister);
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall('searchWeb', { query: 'GPT-5.5 latest news' }, { id: 'call-search-1' })], {
        text: '好的，我来搜索一下关于GPT-5.5的最新新闻。',
        stopReason: 'toolUse'
      }),
      fauxAssistantMessage([fauxToolCall('searchWeb', { query: 'GPT-5.5 more details' }, { id: 'call-search-2' })], {
        text: '我来进一步搜索一下更多细节。',
        stopReason: 'toolUse'
      }),
      fauxAssistantMessage('以下是关于 GPT-5.5 的最新消息汇总：')
    ]);

    const runtime = createPiRuntime({
      model: faux.getModel('faux-multi-search-model'),
      getApiKey: async () => 'faux-key',
      tools: [
        {
          name: 'searchWeb',
          description: 'Search the web',
          parameters: Type.Object({
            query: Type.String()
          }),
          execute: async () => ({
            content: [{ type: 'text', text: 'result' }]
          })
        }
      ]
    });

    const assistantTextUpdates: Array<{ messageId: string; value: string }> = [];
    const toolEvents: Array<{ messageId: string; value: string }> = [];

    await runtime.runTurn(
      ctx,
      { threadId: thread.id, runId: run.id },
      {
        onLiveAssistantUpdate(update) {
          if (update.kind === 'assistant_delta') {
            assistantTextUpdates.push({ messageId: update.messageId, value: update.textDelta });
            return;
          }

          if (update.kind === 'tool_event') {
            toolEvents.push({ messageId: update.messageId, value: `${update.toolName}:${update.phase}` });
          }
        }
      }
    );

    expect(assistantTextUpdates.map((update) => update.value)).toEqual(['以下是关于 GPT-5.5 的最新消息汇总：']);
    expect(new Set(toolEvents.map((update) => update.messageId)).size).toBe(2);
    expect(toolEvents).toEqual([
      { messageId: toolEvents[0]!.messageId, value: 'searchWeb:start' },
      { messageId: toolEvents[0]!.messageId, value: 'searchWeb:completed' },
      { messageId: toolEvents[2]!.messageId, value: 'searchWeb:start' },
      { messageId: toolEvents[2]!.messageId, value: 'searchWeb:completed' }
    ]);
    expect(toolEvents[0]!.messageId).not.toBe(toolEvents[2]!.messageId);
    expect(assistantTextUpdates[0]!.messageId).not.toBe(toolEvents[1]!.messageId);
  });

  it('does not reuse live assistant message ids when durable persistence lags behind streaming', async () => {
    const slowMessageRepo = new SlowAssistantPersistenceMessageRepository();
    const { ctx, thread, run } = await createContextWithOverrides({
      messageRepo: slowMessageRepo
    });
    await createSeedThread(slowMessageRepo, thread.id, 'search Claude news twice');

    const scripted = registerScriptedToolUseProvider([
      createToolUseTextThenToolOnlyStep('好的，我来帮你搜索一下关于 Claude 的最新新闻！', 'call-search-1', 'Claude latest news'),
      createToolUseTextThenToolOnlyStep('我来进一步搜索一下更多细节。', 'call-search-2', 'Claude more details'),
      createFinalTextStep('以下是关于 Claude 的最新新闻摘要：')
    ]);
    unregisterCallbacks.push(scripted.unregister);

    const runtime = createPiRuntime({
      model: scripted.model,
      getApiKey: async () => 'scripted-key',
      tools: [
        {
          name: 'searchWeb',
          description: 'Search the web',
          parameters: Type.Object({
            query: Type.String()
          }),
          execute: async () => ({
            content: [{ type: 'text', text: 'result' }]
          })
        }
      ]
    });

    const assistantTextUpdates: Array<{ messageId: string; value: string }> = [];
    const toolEvents: Array<{ messageId: string; value: string }> = [];

    await runtime.runTurn(
      ctx,
      { threadId: thread.id, runId: run.id },
      {
        onLiveAssistantUpdate(update) {
          if (update.kind === 'assistant_delta') {
            assistantTextUpdates.push({ messageId: update.messageId, value: update.textDelta });
            return;
          }

          if (update.kind === 'tool_event') {
            toolEvents.push({ messageId: update.messageId, value: `${update.toolName}:${update.phase}` });
          }
        }
      }
    );

    expect(assistantTextUpdates).toEqual([
      { messageId: assistantTextUpdates[0]!.messageId, value: '好的，我来帮你搜索一下关于 Claude 的最新新闻！' },
      { messageId: assistantTextUpdates[1]!.messageId, value: '我来进一步搜索一下更多细节。' },
      { messageId: assistantTextUpdates[2]!.messageId, value: '以下是关于 Claude 的最新新闻摘要：' }
    ]);
    expect(new Set(assistantTextUpdates.map((update) => update.messageId)).size).toBe(3);
    expect(toolEvents).toEqual([
      { messageId: assistantTextUpdates[0]!.messageId, value: 'searchWeb:start' },
      { messageId: assistantTextUpdates[0]!.messageId, value: 'searchWeb:completed' },
      { messageId: assistantTextUpdates[1]!.messageId, value: 'searchWeb:start' },
      { messageId: assistantTextUpdates[1]!.messageId, value: 'searchWeb:completed' }
    ]);
  });

  it('preserves live tool input on completion even when tool start persistence lags behind', async () => {
    const slowMessageRepo = new SlowAssistantPersistenceMessageRepository();
    const { ctx, thread, run } = await createContextWithOverrides({
      messageRepo: slowMessageRepo
    });
    await createSeedThread(slowMessageRepo, thread.id, 'search Claude news');

    const scripted = registerScriptedToolUseProvider([
      createToolUseTextThenToolOnlyStep('好的，我来帮你搜索一下关于 Claude 的最新新闻！', 'call-search-lag', 'Claude latest news'),
      createFinalTextStep('以下是关于 Claude 的最新新闻摘要：')
    ]);
    unregisterCallbacks.push(scripted.unregister);

    const runtime = createPiRuntime({
      model: scripted.model,
      getApiKey: async () => 'scripted-key',
      tools: [
        {
          name: 'searchWeb',
          description: 'Search the web',
          parameters: Type.Object({
            query: Type.String()
          }),
          execute: async () => ({
            content: [{ type: 'text', text: 'result' }]
          })
        }
      ]
    });

    const toolEvents: Array<{ phase: string; query: string | null }> = [];

    await runtime.runTurn(
      ctx,
      { threadId: thread.id, runId: run.id },
      {
        onLiveAssistantUpdate(update) {
          if (update.kind !== 'tool_event') {
            return;
          }

          toolEvents.push({
            phase: update.phase,
            query: typeof update.input?.query === 'string' ? update.input.query : null
          });
        }
      }
    );

    expect(toolEvents).toEqual([
      { phase: 'start', query: 'Claude latest news' },
      { phase: 'completed', query: 'Claude latest news' }
    ]);
  });

  it('persists assistant pre-tool text when a tool-use message finishes without text blocks', async () => {
    const { ctx, thread, run } = await createContext();
    await createSeedThread(ctx.messageRepo, thread.id, 'search GPT-5.5 news');

    const scripted = registerScriptedToolUseProvider([
      createToolUseTextThenToolOnlyStep('让我搜索一下关于 GPT-5.5 的最新新闻。', 'call-search-1', 'GPT-5.5 latest news'),
      createFinalTextStep('以下是整理后的结果。')
    ]);
    unregisterCallbacks.push(scripted.unregister);

    const runtime = createPiRuntime({
      model: scripted.model,
      getApiKey: async () => 'faux-key',
      tools: [
        {
          name: 'searchWeb',
          description: 'Search the web',
          parameters: Type.Object({
            query: Type.String()
          }),
          execute: async () => ({
            content: [{ type: 'text', text: 'result' }]
          })
        }
      ]
    });

    await runtime.runTurn(ctx, { threadId: thread.id, runId: run.id });

    const messages = await ctx.messageRepo.listByThread(thread.id);
    const firstAssistant = messages.find((message) => message.role === 'assistant' && message.seq === 2);
    expect(firstAssistant?.parts.map((part) => ({ type: part.type, textValue: part.textValue }))).toEqual([
      {
        type: 'text',
        textValue: '让我搜索一下关于 GPT-5.5 的最新新闻。'
      },
      {
        type: 'tool-call',
        textValue: null
      }
    ]);
  });

  it('does not emit empty assistant/thinking replace updates when toolcall partials omit prior text', async () => {
    const { ctx, thread, run } = await createContext();
    await createSeedThread(ctx.messageRepo, thread.id, 'search GPT-5.5 news');

    const scripted = registerScriptedToolUseProvider([
      createToolUseTextThenToolOnlyStep('好的，我来搜索一下关于 GPT-5.5 的最新新闻。', 'call-search-1', 'GPT-5.5 latest news'),
      createFinalTextStep('以下是整理后的结果。')
    ]);
    unregisterCallbacks.push(scripted.unregister);

    const runtime = createPiRuntime({
      model: scripted.model,
      getApiKey: async () => 'faux-key',
      tools: [
        {
          name: 'searchWeb',
          description: 'Search the web',
          parameters: Type.Object({
            query: Type.String()
          }),
          execute: async () => ({
            content: [{ type: 'text', text: 'result' }]
          })
        }
      ]
    });

    const liveUpdates: Array<{ kind: string; value: string }> = [];

    await runtime.runTurn(
      ctx,
      { threadId: thread.id, runId: run.id },
      {
        onLiveAssistantUpdate(update) {
          if (update.kind === 'assistant_delta') {
            liveUpdates.push({ kind: update.kind, value: update.textDelta });
            return;
          }

          if (update.kind === 'assistant_replace') {
            liveUpdates.push({ kind: update.kind, value: update.textSnapshot });
            return;
          }

          if (update.kind === 'thinking_replace') {
            liveUpdates.push({ kind: update.kind, value: update.thinkingSnapshot });
            return;
          }

          if (update.kind === 'tool_event') {
            liveUpdates.push({ kind: update.kind, value: `${update.toolName}:${update.phase}` });
          }
        }
      }
    );

    expect(liveUpdates).toEqual([
      { kind: 'assistant_delta', value: '好的，我来搜索一下关于 GPT-5.5 的最新新闻。' },
      { kind: 'tool_event', value: 'searchWeb:start' },
      { kind: 'tool_event', value: 'searchWeb:completed' },
      { kind: 'assistant_delta', value: '以下是整理后的结果。' }
    ]);
  });

  it('persists pre-tool assistant text for each tool-use message in a multi-search run', async () => {
    const { ctx, thread, run } = await createContext();
    await createSeedThread(ctx.messageRepo, thread.id, 'search GPT-5.5 news twice');

    const scripted = registerScriptedToolUseProvider([
      createToolUseTextThenToolOnlyStep('先搜索一下 GPT-5.5 的最新新闻。', 'call-search-1', 'GPT-5.5 latest news'),
      createToolUseTextThenToolOnlyStep('我再补充搜索一些更详细的信息。', 'call-search-2', 'GPT-5.5 more details'),
      createFinalTextStep('以下是整理后的结果。')
    ]);
    unregisterCallbacks.push(scripted.unregister);

    const runtime = createPiRuntime({
      model: scripted.model,
      getApiKey: async () => 'faux-key',
      tools: [
        {
          name: 'searchWeb',
          description: 'Search the web',
          parameters: Type.Object({
            query: Type.String()
          }),
          execute: async () => ({
            content: [{ type: 'text', text: 'result' }]
          })
        }
      ]
    });

    await runtime.runTurn(ctx, { threadId: thread.id, runId: run.id });

    const messages = await ctx.messageRepo.listByThread(thread.id);
    const assistantMessages = messages.filter((message) => message.role === 'assistant');

    expect(assistantMessages).toHaveLength(3);
    expect(assistantMessages[0]?.parts.map((part) => ({ type: part.type, textValue: part.textValue }))).toEqual([
      {
        type: 'text',
        textValue: '先搜索一下 GPT-5.5 的最新新闻。'
      },
      {
        type: 'tool-call',
        textValue: null
      }
    ]);
    expect(assistantMessages[1]?.parts.map((part) => ({ type: part.type, textValue: part.textValue }))).toEqual([
      {
        type: 'text',
        textValue: '我再补充搜索一些更详细的信息。'
      },
      {
        type: 'tool-call',
        textValue: null
      }
    ]);
  });

  it('does not fail a run when the persisted-update observer throws', async () => {
    const { ctx, thread, run } = await createContext();
    await createSeedThread(ctx.messageRepo, thread.id, 'observer failure should not fail run');

    const faux = registerFauxProvider({
      models: [{ id: 'faux-observer-model' }]
    });
    unregisterCallbacks.push(faux.unregister);
    faux.setResponses([fauxAssistantMessage('Observer-safe response.')]);

    const runtime = createPiRuntime({
      model: faux.getModel('faux-observer-model'),
      getApiKey: async () => 'faux-key'
    });

    await expect(
      runtime.runTurn(
        ctx,
        { threadId: thread.id, runId: run.id },
        {
          onPersistedUpdate() {
            throw new Error('transport disconnected');
          }
        }
      )
    ).resolves.toBeUndefined();

    const storedRun = await ctx.runRepo.findById(run.id);
    expect(storedRun?.status).toBe('completed');
  });

  it('keeps model precedence consistent between prepare and runTurn when resolveConfig is also provided', async () => {
    const { ctx, thread, run } = await createContext();
    await createSeedThread(ctx.messageRepo, thread.id, 'run consistent public runtime');

    const faux = registerFauxProvider({
      models: [{ id: 'faux-preferred-model' }]
    });
    unregisterCallbacks.push(faux.unregister);
    faux.setResponses([fauxAssistantMessage('Consistent runtime complete.')]);
    const toolContexts: Array<{ provider: string; model: string }> = [];

    const runtime = createPiRuntime({
      model: faux.getModel('faux-preferred-model'),
      getApiKey: async () => 'faux-key',
      resolveConfig: async () => ({
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        apiKey: 'unused-key'
      }),
      tools: (context) => {
        toolContexts.push({
          provider: context.provider,
          model: context.model
        });
        return [];
      }
    });

    await expect(runtime.prepare()).resolves.toEqual({
      provider: 'faux',
      model: 'faux-preferred-model'
    });

    await runtime.runTurn(ctx, { threadId: thread.id, runId: run.id });

    expect(toolContexts).toEqual([
      {
        provider: 'faux',
        model: 'faux-preferred-model'
      }
    ]);
  });

  it('uses canonical historyMessages instead of raw stored candidate messages for model context', async () => {
    const { ctx, thread, run } = await createContext();
    await createPersistedTextMessage(ctx.messageRepo, { threadId: thread.id, role: 'user', text: 'Compare both answers' });
    await createPersistedTextMessage(ctx.messageRepo, {
      threadId: thread.id,
      role: 'assistant',
      runId: 'unselected-run',
      text: 'Unselected candidate answer'
    });
    const selectedAssistant = await createPersistedTextMessage(ctx.messageRepo, {
      threadId: thread.id,
      role: 'assistant',
      runId: 'selected-run',
      text: 'Selected candidate answer'
    });
    await createPersistedTextMessage(ctx.messageRepo, { threadId: thread.id, role: 'user', text: 'Continue from the selected answer' });
    const rawHistory = await ctx.messageRepo.listByThread(thread.id);
    const canonicalHistory = rawHistory.filter((message) => message.role === 'user' || message.id === selectedAssistant.id);

    let capturedContext: Context | null = null;
    const provider = registerScriptedToolUseProvider([
      (context) => {
        capturedContext = context;
        return createFinalTextStep('Continuing from the selected answer.')(context);
      }
    ]);
    unregisterCallbacks.push(provider.unregister);

    await runAssistantTurnWithPiInternal(
      ctx,
      { threadId: thread.id, runId: run.id, historyMessages: canonicalHistory },
      {
        model: provider.model,
        getApiKey: async () => 'scripted-key',
        tools: []
      }
    );

    expect(capturedContext?.messages.map((message) => (typeof message.content === 'string' ? message.content : null)).filter(Boolean)).toEqual([
      'Compare both answers',
      'Continue from the selected answer'
    ]);
    expect(
      capturedContext?.messages.some(
        (message) =>
          message.role === 'assistant' &&
          Array.isArray(message.content) &&
          message.content.some((block) => block.type === 'text' && block.text === 'Unselected candidate answer')
      )
    ).toBe(false);
    expect(
      capturedContext?.messages.some(
        (message) =>
          message.role === 'assistant' &&
          Array.isArray(message.content) &&
          message.content.some((block) => block.type === 'text' && block.text === 'Selected candidate answer')
      )
    ).toBe(true);
  });

  it('keeps sibling candidate runs on the same immutable pre-answer history snapshot', async () => {
    const { ctx, thread, run } = await createContext();
    const secondRun = await ctx.runRepo.create({
      id: 'run-2',
      threadId: thread.id,
      triggerMessageId: null,
      provider: 'openai',
      model: 'gpt-4o-mini',
      status: 'queued',
      usage: null,
      error: null,
      startedAt: null,
      finishedAt: null
    });
    await createPersistedTextMessage(ctx.messageRepo, { threadId: thread.id, role: 'user', text: 'Answer this once' });
    const sharedHistorySnapshot = await ctx.messageRepo.listByThread(thread.id);
    const capturedContexts: Context[] = [];
    const provider = registerScriptedToolUseProvider([
      (context) => {
        capturedContexts.push(context);
        return createFinalTextStep('Candidate A answer.')(context);
      },
      (context) => {
        capturedContexts.push(context);
        return createFinalTextStep('Candidate B answer.')(context);
      }
    ]);
    unregisterCallbacks.push(provider.unregister);

    await runAssistantTurnWithPiInternal(
      ctx,
      { threadId: thread.id, runId: run.id, historyMessages: sharedHistorySnapshot },
      {
        model: provider.model,
        getApiKey: async () => 'scripted-key',
        tools: []
      }
    );
    await runAssistantTurnWithPiInternal(
      ctx,
      { threadId: thread.id, runId: secondRun.id, historyMessages: sharedHistorySnapshot },
      {
        model: provider.model,
        getApiKey: async () => 'scripted-key',
        tools: []
      }
    );

    expect(capturedContexts).toHaveLength(2);
    expect(capturedContexts[0]?.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Answer this once'
      })
    ]);
    expect(capturedContexts[1]?.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Answer this once'
      })
    ]);
    expect((await ctx.messageRepo.listByThread(thread.id)).map((message) => message.role)).toEqual(['user', 'assistant', 'assistant']);
  });

  it('projects unavailable persisted tool history before sending context to the model', async () => {
    const { ctx, thread, run } = await createContext();
    const previousAssistant = await ctx.messageRepo.create({
      id: 'previous-assistant',
      threadId: thread.id,
      runId: 'previous-run',
      role: 'assistant',
      seq: 1,
      status: 'completed',
      metadata: null
    });
    await ctx.messageRepo.createPart({
      id: 'previous-assistant-text',
      messageId: previousAssistant.id,
      partIndex: 0,
      type: 'text',
      textValue: 'I will look up the latest filing time.',
      jsonValue: null
    });
    await ctx.messageRepo.createPart({
      id: 'previous-assistant-tool',
      messageId: previousAssistant.id,
      partIndex: 1,
      type: 'tool-call',
      textValue: null,
      jsonValue: {
        toolName: 'searchWeb',
        toolCallId: 'call-search-history',
        input: {
          query: 'ICP filing time'
        }
      }
    });

    const previousTool = await ctx.messageRepo.create({
      id: 'previous-tool',
      threadId: thread.id,
      runId: 'previous-run',
      role: 'tool',
      seq: 2,
      status: 'completed',
      metadata: {
        toolName: 'searchWeb',
        toolCallId: 'call-search-history'
      }
    });
    await ctx.messageRepo.createPart({
      id: 'previous-tool-result',
      messageId: previousTool.id,
      partIndex: 0,
      type: 'tool-result',
      textValue: 'Search result summary.',
      jsonValue: {
        toolName: 'searchWeb',
        toolCallId: 'call-search-history',
        content: [{ type: 'text', text: 'Search result summary.' }],
        details: {
          kind: 'web-search-summary',
          query: 'ICP filing time',
          summaryText: 'ICP filing normally takes several business days after provider and regulator review.',
          sourceNames: ['Tencent Cloud']
        },
        isError: false
      }
    });
    const currentUser = await ctx.messageRepo.create({
      id: 'current-user',
      threadId: thread.id,
      runId: null,
      role: 'user',
      seq: 3,
      status: 'completed',
      metadata: null
    });
    await ctx.messageRepo.createPart({
      id: 'current-user-text',
      messageId: currentUser.id,
      partIndex: 0,
      type: 'text',
      textValue: 'How long does filing take?',
      jsonValue: null
    });

    let capturedContext: Context | null = null;
    const provider = registerScriptedToolUseProvider([
      (context) => {
        capturedContext = context;
        return createFinalTextStep('It usually takes several business days.')(context);
      }
    ]);
    unregisterCallbacks.push(provider.unregister);

    await runAssistantTurnWithPiInternal(
      ctx,
      { threadId: thread.id, runId: run.id },
      {
        model: provider.model,
        getApiKey: async () => 'scripted-key',
        tools: []
      }
    );

    expect(capturedContext).not.toBeNull();
    expect(capturedContext?.messages.some((message) => message.role === 'toolResult')).toBe(false);
    expect(
      capturedContext?.messages.some(
        (message) =>
          message.role === 'assistant' &&
          message.content.some((block) => block.type === 'toolCall' && block.name === 'searchWeb')
      )
    ).toBe(false);
    expect(capturedContext?.messages).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: [{ type: 'text', text: 'I will look up the latest filing time.' }]
      }),
      expect.objectContaining({
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: [
              'Historical web search evidence from a previous run.',
              'Query: ICP filing time',
              'Summary: ICP filing normally takes several business days after provider and regulator review.',
              'Sources: Tencent Cloud'
            ].join('\n')
          }
        ]
      }),
      expect.objectContaining({
        role: 'user',
        content: 'How long does filing take?'
      })
    ]);
  });

  it('generates lightweight text without creating a durable run', async () => {
    const faux = registerFauxProvider({
      models: [{ id: 'faux-generate-text-model' }]
    });
    unregisterCallbacks.push(faux.unregister);
    faux.setResponses([fauxAssistantMessage('Generated lightweight title')]);

    const runtime = createPiRuntime({
      model: faux.getModel('faux-generate-text-model'),
      getApiKey: async () => 'faux-key'
    });

    await expect(
      runtime.generateText({
        systemPrompt: 'Generate a title.',
        userPrompt: 'User question: MQ 和 Kafka 的区别',
        temperature: 0.2,
        maxTokens: 48,
        reasoningEffort: 'off'
      })
    ).resolves.toEqual({
      provider: 'faux',
      model: 'faux-generate-text-model',
      text: 'Generated lightweight title'
    });
  });

  it('uses a non-streaming completion request for openai-compatible generateText calls', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'Generated over HTTP'
              }
            }
          ]
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        }
      )
    );
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    try {
      const runtime = createPiRuntime({
        resolveConfig: async () => ({
          provider: 'deepseek',
          model: 'deepseek-v4-flash',
          apiKey: 'deepseek-key'
        })
      });

      await expect(
        runtime.generateText({
          systemPrompt: 'Generate a title.',
          userPrompt: 'User question: MQ 和 Kafka 的区别',
          temperature: 0.2,
          maxTokens: 48,
          reasoningEffort: 'off'
        })
      ).resolves.toEqual({
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        text: 'Generated over HTTP'
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.deepseek.com/v1/chat/completions');
      expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
        model: 'deepseek-v4-flash',
        max_tokens: 48,
        temperature: 0.2,
        thinking: {
          type: 'disabled'
        }
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('persists multiple tool calls, tool results, and final assistant text', async () => {
    const { ctx, thread, run } = await createContext();
    await createSeedThread(ctx.messageRepo, thread.id, 'run tools');

    const faux = registerFauxProvider({
      models: [{ id: 'faux-tool-model' }]
    });
    unregisterCallbacks.push(faux.unregister);
    faux.setResponses([
      fauxAssistantMessage(
        [
          fauxToolCall('getCurrentTime', { timezone: 'UTC' }, { id: 'call-time' }),
          fauxToolCall('getRuntimeInfo', {}, { id: 'call-runtime' })
        ],
        { stopReason: 'toolUse' }
      ),
      fauxAssistantMessage('Both tools finished.')
    ]);

    await runAssistantTurnWithPiInternal(
      ctx,
      { threadId: thread.id, runId: run.id },
      {
        model: faux.getModel('faux-tool-model'),
        getApiKey: async () => 'faux-key',
        tools: [
          {
            name: 'getCurrentTime',
            label: 'Get Current Time',
            description: 'Return the current time.',
            parameters: Type.Object({
              timezone: Type.Optional(Type.String({ description: 'Timezone.' }))
            }),
            async execute() {
              return {
                content: [{ type: 'text', text: 'UTC now' }],
                details: { timezone: 'UTC' }
              };
            }
          },
          {
            name: 'getRuntimeInfo',
            label: 'Get Runtime Info',
            description: 'Return runtime info.',
            parameters: Type.Object({}),
            async execute() {
              return {
                content: [{ type: 'text', text: 'runtime-info' }],
                details: { runtime: 'pi' }
              };
            }
          }
        ]
      }
    );

    const messages = await ctx.messageRepo.listByThread(thread.id);
    const invocations = [...ctx.toolRepo.invocations.values()].sort((left, right) => left.toolName.localeCompare(right.toolName));
    const events = await ctx.runEventRepo.listByRun(run.id);

    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'tool', 'tool', 'assistant']);
    expect(messages[1]?.parts.map((part) => part.type)).toEqual(['tool-call', 'tool-call']);
    expect(messages[2]?.parts[0]?.type).toBe('tool-result');
    expect(messages[3]?.parts[0]?.type).toBe('tool-result');
    expect(messages[4]?.parts.map((part) => part.type)).toEqual(['text']);
    expect(invocations).toHaveLength(2);
    expect(invocations.map((invocation) => invocation.status)).toEqual(['completed', 'completed']);
    expect(events.filter((event) => event.type === 'tool_execution_start')).toHaveLength(2);
    expect(events.filter((event) => event.type === 'tool_execution_end')).toHaveLength(2);
  });

  it('marks the run as failed when a tool execution fails', async () => {
    const { ctx, thread, run } = await createContext();
    await createSeedThread(ctx.messageRepo, thread.id, 'cause failure');

    const faux = registerFauxProvider({
      models: [{ id: 'faux-error-model' }]
    });
    unregisterCallbacks.push(faux.unregister);
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall('explode', {}, { id: 'call-explode' })], { stopReason: 'toolUse' }),
      fauxAssistantMessage([], { stopReason: 'error', errorMessage: 'tool handling failed' })
    ]);

    const failingTools: AgentTool[] = [
      {
        name: 'explode',
        label: 'Explode',
        description: 'Fail intentionally.',
        parameters: Type.Object({}),
        async execute() {
          throw new Error('intentional tool failure');
        }
      }
    ];

    await expect(
      runAssistantTurnWithPiInternal(
        ctx,
        { threadId: thread.id, runId: run.id },
        {
          model: faux.getModel('faux-error-model'),
          getApiKey: async () => 'faux-key',
          tools: failingTools
        }
      )
    ).resolves.toBeUndefined();

    const storedRun = await ctx.runRepo.findById(run.id);
    const invocations = [...ctx.toolRepo.invocations.values()];
    const toolMessages = (await ctx.messageRepo.listByThread(thread.id)).filter((message) => message.role === 'tool');
    const events = await ctx.runEventRepo.listByRun(run.id);

    expect(storedRun?.status).toBe('failed');
    expect(storedRun?.error).toBe('tool handling failed');
    expect(invocations[0]?.status).toBe('failed');
    expect(toolMessages[0]?.parts[0]?.jsonValue?.isError).toBe(true);
    expect(events.at(-1)?.type).toBe('agent_end');
  });

  it('persists a fallback run error when the provider ends with stopReason error and no message', async () => {
    const { ctx, thread, run } = await createContext();
    await createSeedThread(ctx.messageRepo, thread.id, 'trigger provider-side stream error');

    const faux = registerFauxProvider({
      models: [{ id: 'faux-provider-error-model' }]
    });
    unregisterCallbacks.push(faux.unregister);
    faux.setResponses([
      fauxAssistantMessage(
        [{ type: 'thinking', thinking: 'Partial reasoning before the provider aborts.' }],
        { stopReason: 'error' }
      )
    ]);

    await expect(
      runAssistantTurnWithPiInternal(
        ctx,
        { threadId: thread.id, runId: run.id },
        {
          model: faux.getModel('faux-provider-error-model'),
          getApiKey: async () => 'faux-key'
        }
      )
    ).resolves.toBeUndefined();

    const storedRun = await ctx.runRepo.findById(run.id);
    const messages = await ctx.messageRepo.listByThread(thread.id);
    const assistant = messages.find((message) => message.role === 'assistant');

    expect(storedRun?.status).toBe('failed');
    expect(storedRun?.error).toBe('provider stream ended with stopReason=error');
    expect(assistant?.status).toBe('failed');
    expect(assistant?.parts[0]?.type).toBe('reasoning');
  });

  it('marks an open assistant message as failed when runtime crashes mid-message', async () => {
    const messageRepo = new FailOnceAssistantMessageRepository();
    const { ctx, thread, run } = await createContextWithOverrides({
      messageRepo
    });
    await createSeedThread(messageRepo, thread.id, 'break assistant persistence');

    const faux = registerFauxProvider();
    unregisterCallbacks.push(faux.unregister);
    faux.setResponses([fauxAssistantMessage('Will fail while persisting.')]);

    await expect(
      runAssistantTurnWithPiInternal(
        ctx,
        { threadId: thread.id, runId: run.id },
        {
          model: faux.getModel(),
          getApiKey: async () => 'faux-key'
        }
      )
    ).rejects.toThrow('assistant persistence exploded');

    const messages = await ctx.messageRepo.listByThread(thread.id);
    const runEvents = await ctx.runEventRepo.listByRun(run.id);
    const assistant = messages.find((message) => message.role === 'assistant');
    const storedRun = await ctx.runRepo.findById(run.id);

    expect(assistant?.status).toBe('failed');
    expect(assistant?.parts[0]?.textValue).toBe('assistant persistence exploded');
    expect(storedRun?.status).toBe('failed');
    expect(runEvents.at(-1)?.type).toBe('runtime_error');
  });

  it('marks running tool invocations as failed when runtime crashes after tool start', async () => {
    const toolRepo = new FailOnceToolInvocationRepository();
    const { ctx, thread, run } = await createContextWithOverrides({
      toolRepo
    });
    await createSeedThread(ctx.messageRepo as InMemoryMessageRepository, thread.id, 'break tool persistence');

    const faux = registerFauxProvider({
      models: [{ id: 'faux-tool-hardening-model' }]
    });
    unregisterCallbacks.push(faux.unregister);
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall('echoText', { text: 'tool path' }, { id: 'call-tool-hardening' })], { stopReason: 'toolUse' }),
      fauxAssistantMessage('Should not reach final text')
    ]);

    await expect(
      runAssistantTurnWithPiInternal(
        ctx,
        { threadId: thread.id, runId: run.id },
        {
          model: faux.getModel('faux-tool-hardening-model'),
          getApiKey: async () => 'faux-key',
          tools: [
            {
              name: 'echoText',
              label: 'Echo Text',
              description: 'Echo test tool.',
              parameters: Type.Object({
                text: Type.String({ description: 'Echo value.' })
              }),
              async execute(_toolCallId, params) {
                const input = params as { text: string };
                return {
                  content: [{ type: 'text', text: input.text }],
                  details: { echoedText: input.text }
                };
              }
            }
          ]
        }
      )
    ).rejects.toThrow('tool invocation persistence exploded');

    const invocations = await ctx.toolRepo.listByRun(run.id);
    const storedRun = await ctx.runRepo.findById(run.id);
    const runEvents = await ctx.runEventRepo.listByRun(run.id);

    expect(invocations[0]?.status).toBe('failed');
    expect(invocations[0]?.error).toBe('tool invocation persistence exploded');
    expect(storedRun?.status).toBe('failed');
    expect(runEvents.at(-1)?.type).toBe('runtime_error');
  });
});
