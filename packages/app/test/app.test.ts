import type {
  Message,
  MessagePart,
  Run,
  RunEvent,
  Thread,
  ToolInvocation
} from '@agent-infra/core';
import { describe, expect, it } from 'vitest';

import { createAgentInfraApp } from '../src/app';
import { InvalidTurnTextError, RunNotFoundError, ThreadNotFoundError } from '../src/errors';
import type { AgentInfraAppDependencies, AgentInfraAppRepositories, AgentInfraRuntimePort, RunTextRuntimeInput } from '../src/types';

type StoredMessage = Message & { parts: MessagePart[] };

type InMemoryState = {
  threads: Map<string, Thread>;
  runs: Map<string, Run>;
  messages: Map<string, StoredMessage>;
  tools: Map<string, ToolInvocation>;
  runEvents: Map<string, RunEvent>;
};

function cloneState(state: InMemoryState): InMemoryState {
  return {
    threads: new Map([...state.threads.entries()].map(([id, thread]) => [id, { ...thread }])),
    runs: new Map([...state.runs.entries()].map(([id, run]) => [id, { ...run }])),
    messages: new Map(
      [...state.messages.entries()].map(([id, message]) => [
        id,
        {
          ...message,
          parts: message.parts.map((part) => ({ ...part }))
        }
      ])
    ),
    tools: new Map([...state.tools.entries()].map(([id, tool]) => [id, { ...tool }])),
    runEvents: new Map([...state.runEvents.entries()].map(([id, event]) => [id, { ...event }]))
  };
}

function createRepositories(stateRef: { current: InMemoryState }, snapshot?: InMemoryState): AgentInfraAppRepositories {
  const getState = () => snapshot ?? stateRef.current;

  return {
    threadRepo: {
      async create(input) {
        const createdAt = new Date();
        const thread = { ...input, createdAt, updatedAt: createdAt };
        getState().threads.set(thread.id, thread);
        return thread;
      },
      async findById(id) {
        return getState().threads.get(id) ?? null;
      },
      async listByApp(appId) {
        return [...getState().threads.values()].filter((thread) => thread.appId === appId);
      }
    },
    runRepo: {
      async create(input) {
        const createdAt = new Date();
        const run = { ...input, createdAt };
        getState().runs.set(run.id, run);
        return run;
      },
      async findById(id) {
        return getState().runs.get(id) ?? null;
      },
      async updateStatus(id, status, patch = {}) {
        const current = getState().runs.get(id);
        if (!current) {
          throw new Error(`run ${id} not found`);
        }

        const next = { ...current, ...patch, status };
        getState().runs.set(id, next);
        return next;
      }
    },
    messageRepo: {
      async create(input) {
        const createdAt = new Date();
        const message: StoredMessage = { ...input, createdAt, parts: [] };
        getState().messages.set(message.id, message);
        return { ...message };
      },
      async updateStatus(id, status) {
        const current = getState().messages.get(id);
        if (!current) {
          throw new Error(`message ${id} not found`);
        }

        const next = { ...current, status };
        getState().messages.set(id, next);
        return { ...next };
      },
      async createPart(input) {
        const createdAt = new Date();
        const message = getState().messages.get(input.messageId);
        if (!message) {
          throw new Error(`message ${input.messageId} not found`);
        }

        const part = { ...input, createdAt };
        message.parts.push(part);
        return part;
      },
      async listByThread(threadId) {
        return [...getState().messages.values()]
          .filter((message) => message.threadId === threadId)
          .sort((left, right) => left.seq - right.seq)
          .map((message) => ({
            ...message,
            parts: [...message.parts].sort((left, right) => left.partIndex - right.partIndex)
          }));
      },
      async nextSeq(threadId) {
        return (
          [...getState().messages.values()]
            .filter((message) => message.threadId === threadId)
            .reduce((max, message) => Math.max(max, message.seq), 0) + 1
        );
      }
    },
    toolRepo: {
      async create(input) {
        const createdAt = new Date();
        const tool = { ...input, createdAt };
        getState().tools.set(tool.id, tool);
        return tool;
      },
      async updateStatus(id, status, patch = {}) {
        const current = getState().tools.get(id);
        if (!current) {
          throw new Error(`tool ${id} not found`);
        }

        const next = { ...current, ...patch, status };
        getState().tools.set(id, next);
        return next;
      },
      async listByRun(runId) {
        return [...getState().tools.values()].filter((tool) => tool.runId === runId);
      }
    },
    runEventRepo: {
      async append(input) {
        const createdAt = new Date();
        const event = { ...input, createdAt };
        getState().runEvents.set(event.id, event);
        return event;
      },
      async listByRun(runId) {
        return [...getState().runEvents.values()].filter((event) => event.runId === runId).sort((left, right) => left.seq - right.seq);
      },
      async nextSeq(runId) {
        return (
          [...getState().runEvents.values()]
            .filter((event) => event.runId === runId)
            .reduce((max, event) => Math.max(max, event.seq), 0) + 1
        );
      }
    }
  };
}

function createDependencies(runtime: AgentInfraRuntimePort) {
  const stateRef = {
    current: {
      threads: new Map<string, Thread>(),
      runs: new Map<string, Run>(),
      messages: new Map<string, StoredMessage>(),
      tools: new Map<string, ToolInvocation>(),
      runEvents: new Map<string, RunEvent>()
    }
  };

  const repositories = createRepositories(stateRef);

  const dependencies: AgentInfraAppDependencies = {
    repositories,
    runtime,
    transaction: async (operation) => {
      const draft = cloneState(stateRef.current);
      const transactionalRepos = createRepositories(stateRef, draft);

      const result = await operation(transactionalRepos);
      stateRef.current = draft;
      return result;
    },
    idGenerator: (() => {
      let seq = 1;
      return () => `id-${seq++}`;
    })(),
    now: () => new Date('2026-04-10T00:00:00.000Z')
  };

  return {
    app: createAgentInfraApp(dependencies),
    repositories,
    stateRef
  };
}

function createHappyRuntime(): AgentInfraRuntimePort {
  return {
    async prepare(input) {
      return {
        provider: input.provider ?? 'deepseek',
        model: input.model ?? 'deepseek-chat'
      };
    },
    async runTextTurn(repositories, input) {
      await repositories.runRepo.updateStatus(input.runId, 'running', {
        startedAt: new Date('2026-04-10T01:00:00.000Z')
      });

      const assistantMessage = await repositories.messageRepo.create({
        id: `assistant-${input.runId}`,
        threadId: input.threadId,
        runId: input.runId,
        role: 'assistant',
        seq: await repositories.messageRepo.nextSeq(input.threadId),
        status: 'created',
        metadata: null
      });

      await repositories.runEventRepo.append({
        id: `event-${input.runId}-1`,
        threadId: input.threadId,
        runId: input.runId,
        seq: await repositories.runEventRepo.nextSeq(input.runId),
        type: 'agent_start',
        payload: { provider: input.provider, model: input.model }
      });

      await repositories.messageRepo.createPart({
        id: `part-${input.runId}`,
        messageId: assistantMessage.id,
        partIndex: 0,
        type: 'text',
        textValue: 'Hello from runtime',
        jsonValue: null
      });

      await repositories.messageRepo.updateStatus(assistantMessage.id, 'completed');
      await repositories.runRepo.updateStatus(input.runId, 'completed', {
        finishedAt: new Date('2026-04-10T01:00:05.000Z')
      });
    }
  };
}

function createFailingRuntime(): AgentInfraRuntimePort {
  return {
    async prepare(input) {
      return {
        provider: input.provider ?? 'deepseek',
        model: input.model ?? 'deepseek-chat'
      };
    },
    async runTextTurn(repositories, input: RunTextRuntimeInput) {
      await repositories.runRepo.updateStatus(input.runId, 'running', {
        startedAt: new Date('2026-04-10T01:00:00.000Z')
      });
      await repositories.runEventRepo.append({
        id: `event-${input.runId}-1`,
        threadId: input.threadId,
        runId: input.runId,
        seq: await repositories.runEventRepo.nextSeq(input.runId),
        type: 'agent_start',
        payload: null
      });
      await repositories.runRepo.updateStatus(input.runId, 'failed', {
        error: 'tool explosion',
        finishedAt: new Date('2026-04-10T01:00:07.000Z')
      });
      throw new Error('tool explosion');
    }
  };
}

describe('createAgentInfraApp', () => {
  it('creates threads, lists them, and returns thread messages through the app boundary', async () => {
    const { app } = createDependencies(createHappyRuntime());

    const thread = await app.threads.create({
      appId: 'playground-runtime-pi',
      title: 'Main thread'
    });

    const threads = await app.threads.list({ appId: 'playground-runtime-pi' });
    const messages = await app.threads.getMessages({ threadId: thread.id });

    expect(threads).toHaveLength(1);
    expect(threads[0]?.title).toBe('Main thread');
    expect(messages).toEqual([]);
  });

  it('rejects blank turn text without leaving durable records', async () => {
    const { app, repositories } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Blank test' });

    await expect(
      app.turns.runText({
        threadId: thread.id,
        text: '   '
      })
    ).rejects.toBeInstanceOf(InvalidTurnTextError);

    expect(await repositories.messageRepo.listByThread(thread.id)).toEqual([]);
    expect(await repositories.runRepo.findById('id-3')).toBeNull();
  });

  it('persists a queued user turn, runs the runtime, and returns a projected result', async () => {
    const { app } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Happy path' });

    const result = await app.turns.runText({
      threadId: thread.id,
      text: 'Hello there',
      provider: 'deepseek',
      model: 'deepseek-chat'
    });

    expect(result.run.status).toBe('completed');
    expect(result.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(result.messages[0]?.parts[0]?.textValue).toBe('Hello there');
    expect(result.messages[1]?.parts[0]?.textValue).toBe('Hello from runtime');
    expect(result.debug).toEqual({
      runEventCount: 1,
      toolInvocationCount: 0
    });
    expect(result.executionError).toBeUndefined();
  });

  it('returns projected failed state when runtime execution throws after persistence', async () => {
    const { app } = createDependencies(createFailingRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Failure path' });

    const result = await app.turns.runText({
      threadId: thread.id,
      text: 'Trigger failure'
    });

    expect(result.run.status).toBe('failed');
    expect(result.executionError).toBe('tool explosion');
    expect(result.debug.runEventCount).toBe(1);
    expect(result.messages[0]?.role).toBe('user');
  });

  it('throws a typed not-found error for missing thread messages', async () => {
    const { app } = createDependencies(createHappyRuntime());

    await expect(app.threads.getMessages({ threadId: 'missing-thread' })).rejects.toBeInstanceOf(ThreadNotFoundError);
  });

  it('returns run timeline data from the app boundary', async () => {
    const { app } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Timeline path' });

    const turn = await app.turns.runText({
      threadId: thread.id,
      text: 'Timeline please'
    });
    const timeline = await app.runs.getTimeline({ runId: turn.run.id });

    expect(timeline.run.id).toBe(turn.run.id);
    expect(timeline.runEvents.map((event) => event.type)).toEqual(['agent_start']);
    expect(timeline.toolInvocations).toEqual([]);
  });

  it('throws a typed not-found error for a missing run timeline', async () => {
    const { app } = createDependencies(createHappyRuntime());

    await expect(app.runs.getTimeline({ runId: 'missing-run' })).rejects.toBeInstanceOf(RunNotFoundError);
  });
});
