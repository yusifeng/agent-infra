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
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { fauxAssistantMessage, fauxToolCall, registerFauxProvider, Type } from '@mariozechner/pi-ai';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveRuntimePiConfigFromEnv, runAssistantTurnWithPiInternal } from '../src/runtime';

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
      model: 'deepseek-chat',
      apiKey: 'deepseek-key'
    });
  });

  it('resolves an explicitly selected DeepSeek model from env', () => {
    process.env.DEEPSEEK_API_KEY = 'deepseek-key';
    process.env.OPENAI_API_KEY = 'openai-key';

    expect(resolveRuntimePiConfigFromEnv({ provider: 'deepseek', model: 'deepseek-reasoner' })).toEqual({
      provider: 'deepseek',
      model: 'deepseek-reasoner',
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
    expect(messages).toHaveLength(2);
    expect(messages[1]?.role).toBe('assistant');
    expect(messages[1]?.parts.map((part) => part.type)).toEqual(['text']);
    expect(events.map((event) => event.type)).toContain('agent_start');
    expect(events.map((event) => event.type)).toContain('message_end');
    expect(events.at(-1)?.type).toBe('agent_end');
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
        getApiKey: async () => 'faux-key'
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
    expect(invocations[0]?.status).toBe('failed');
    expect(toolMessages[0]?.parts[0]?.jsonValue?.isError).toBe(true);
    expect(events.at(-1)?.type).toBe('agent_end');
  });
});
