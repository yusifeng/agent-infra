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

import { resolveRuntimePiConfigFromEnv } from '../src/config';
import { createPiRuntime, runAssistantTurnWithPiInternal } from '../src/runtime';

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

    const updates: Array<{ type: string; hasRun: boolean; assistantText: string | null }> = [];

    await runtime.runTurn(
      ctx,
      { threadId: thread.id, runId: run.id },
      {
        onPersistedUpdate(update) {
          updates.push({
            type: update.runEvent.type,
            hasRun: Boolean(update.run),
            assistantText: update.assistantStream?.partialText ?? null
          });
        }
      }
    );

    expect(updates.map((update) => update.type)).toContain('agent_start');
    expect(updates.map((update) => update.type)).toContain('message_update');
    expect(updates.some((update) => update.type === 'message_update' && update.assistantText === 'Stream me.')).toBe(true);
    expect(updates.map((update) => update.type)).toContain('message_end');
    expect(updates.at(-1)).toEqual({
      type: 'agent_end',
      hasRun: true,
      assistantText: null
    });
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
        model: 'deepseek-chat',
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
    expect(invocations[0]?.status).toBe('failed');
    expect(toolMessages[0]?.parts[0]?.jsonValue?.isError).toBe(true);
    expect(events.at(-1)?.type).toBe('agent_end');
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
