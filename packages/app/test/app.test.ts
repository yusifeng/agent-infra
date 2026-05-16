import type {
  AnswerCandidate,
  AnswerSelection,
  ChatShare,
  ChatShareSnapshot,
  Message,
  MessagePart,
  Run,
  RunFeedback,
  RunEvent,
  Thread,
  ToolInvocation
} from '@agent-infra/core';
import { describe, expect, it, vi } from 'vitest';

import { createAgentInfraApp } from '../src/app';
import {
  ActiveChatShareExistsError,
  ChatShareRevokedError,
  InvalidAnswerCandidateSelectionError,
  InvalidRunFeedbackError,
  InvalidThreadTitleError,
  InvalidTurnTextError,
  RunNotFoundError,
  ThreadHasActiveRunError,
  ThreadNotFoundError
} from '../src/errors';
import type { AgentInfraAppDependencies, AgentInfraAppRepositories, AgentInfraRuntimePort, RunTextRuntimeInput } from '../src/types';

type StoredMessage = Message & { parts: MessagePart[] };

type InMemoryState = {
  threads: Map<string, Thread>;
  runs: Map<string, Run>;
  messages: Map<string, StoredMessage>;
  tools: Map<string, ToolInvocation>;
  runEvents: Map<string, RunEvent>;
  chatShares: Map<string, ChatShare>;
  chatShareSnapshots: Map<string, ChatShareSnapshot>;
  answerCandidates: Map<string, AnswerCandidate>;
  answerSelections: Map<string, AnswerSelection>;
  runFeedback: Map<string, RunFeedback>;
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
    runEvents: new Map([...state.runEvents.entries()].map(([id, event]) => [id, { ...event }])),
    chatShares: new Map([...state.chatShares.entries()].map(([id, share]) => [id, { ...share }])),
    chatShareSnapshots: new Map([...state.chatShareSnapshots.entries()].map(([id, snapshot]) => [id, structuredClone(snapshot)])),
    answerCandidates: new Map([...state.answerCandidates.entries()].map(([id, candidate]) => [id, { ...candidate }])),
    answerSelections: new Map([...state.answerSelections.entries()].map(([id, selection]) => [id, { ...selection }])),
    runFeedback: new Map([...state.runFeedback.entries()].map(([id, feedback]) => [id, { ...feedback }]))
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
        return [...getState().threads.values()].filter((thread) => thread.appId === appId && thread.status === 'active');
      },
      async rename(id, title, updatedAt) {
        const current = getState().threads.get(id);
        if (!current) {
          throw new Error(`thread ${id} not found`);
        }

        const next = { ...current, title, updatedAt };
        getState().threads.set(id, next);
        return next;
      },
      async archive(id, archivedAt) {
        const current = getState().threads.get(id);
        if (!current) {
          throw new Error(`thread ${id} not found`);
        }

        const next = { ...current, status: 'archived' as const, archivedAt, updatedAt: archivedAt };
        getState().threads.set(id, next);
        return next;
      },
      async touch(id, updatedAt) {
        const current = getState().threads.get(id);
        if (!current) {
          throw new Error(`thread ${id} not found`);
        }

        const next = { ...current, updatedAt };
        getState().threads.set(id, next);
        return next;
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
      async findLatestActiveByThread(threadId) {
        const activeRuns = [...getState().runs.values()]
          .filter((run) => run.threadId === threadId && (run.status === 'queued' || run.status === 'running'))
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

        return activeRuns[0] ?? null;
      },
      async listActiveByThread(threadId) {
        return [...getState().runs.values()]
          .filter((run) => run.threadId === threadId && (run.status === 'queued' || run.status === 'running'))
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
      },
      async listByThread(threadId, options) {
        const runs = [...getState().runs.values()]
          .filter((run) => run.threadId === threadId)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

        if (options?.limit && options.limit > 0) {
          return runs.slice(0, options.limit);
        }

        return runs;
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
      async createWithNextSeq(input) {
        return this.create({
          ...input,
          seq: await this.nextSeq(input.threadId)
        });
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
      async listPageByThread(threadId, options = {}) {
        const allMessages = await this.listByThread(threadId);
        const filtered = allMessages.filter((message) => {
          if (typeof options.beforeSeq === 'number' && message.seq >= options.beforeSeq) {
            return false;
          }

          if (typeof options.afterSeq === 'number' && message.seq <= options.afterSeq) {
            return false;
          }

          return true;
        });

        let pageMessages = filtered;
        if (options.limit && options.limit > 0) {
          if (typeof options.afterSeq === 'number') {
            pageMessages = filtered.slice(0, options.limit);
          } else {
            pageMessages = filtered.slice(-options.limit);
          }
        }

        const startSeq = pageMessages[0]?.seq ?? null;
        const endSeq = pageMessages.at(-1)?.seq ?? null;

        return {
          messages: pageMessages,
          pageInfo: {
            hasOlder: startSeq !== null ? allMessages.some((message) => message.seq < startSeq) : false,
            hasNewer: endSeq !== null ? allMessages.some((message) => message.seq > endSeq) : false,
            startSeq,
            endSeq
          }
        };
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
    },
    chatShareRepo: {
      async create(input) {
        const createdAt = new Date();
        const share = { ...input, createdAt };
        getState().chatShares.set(share.id, share);
        return share;
      },
      async findById(id) {
        return getState().chatShares.get(id) ?? null;
      },
      async findByPublicId(publicId) {
        return [...getState().chatShares.values()].find((share) => share.publicId === publicId) ?? null;
      },
      async findActiveByThread(threadId) {
        return (
          [...getState().chatShares.values()]
            .filter((share) => share.sourceThreadId === threadId && share.status === 'active')
            .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null
        );
      },
      async updateStatus(id, status, patch = {}) {
        const current = getState().chatShares.get(id);
        if (!current) {
          throw new Error(`chat share ${id} not found`);
        }

        const next = { ...current, ...patch, status };
        getState().chatShares.set(id, next);
        return next;
      }
    },
    chatShareSnapshotRepo: {
      async create(input) {
        const createdAt = new Date();
        const snapshot = { ...input, createdAt };
        getState().chatShareSnapshots.set(snapshot.id, snapshot);
        return snapshot;
      },
      async findById(id) {
        return getState().chatShareSnapshots.get(id) ?? null;
      }
    },
    answerCandidateRepo: {
      async create(input) {
        const createdAt = new Date();
        const candidate = { ...input, createdAt };
        getState().answerCandidates.set(candidate.id, candidate);
        return candidate;
      },
      async findByRunId(runId) {
        return [...getState().answerCandidates.values()].find((candidate) => candidate.runId === runId) ?? null;
      },
      async listByRunIds(runIds) {
        const runIdSet = new Set(runIds);
        return [...getState().answerCandidates.values()].filter((candidate) => runIdSet.has(candidate.runId));
      },
      async listByThread(threadId) {
        return [...getState().answerCandidates.values()]
          .filter((candidate) => candidate.threadId === threadId)
          .sort((left, right) => left.ordinal - right.ordinal);
      },
      async listByTriggerMessage(threadId, triggerMessageId) {
        return [...getState().answerCandidates.values()]
          .filter((candidate) => candidate.threadId === threadId && candidate.triggerMessageId === triggerMessageId)
          .sort((left, right) => left.ordinal - right.ordinal);
      }
    },
    answerSelectionRepo: {
      async getByThreadAndTrigger(threadId, triggerMessageId) {
        return getState().answerSelections.get(`${threadId}:${triggerMessageId}`) ?? null;
      },
      async listByThread(threadId) {
        return [...getState().answerSelections.values()].filter((selection) => selection.threadId === threadId);
      },
      async upsert(input) {
        const existing = await this.getByThreadAndTrigger(input.threadId, input.triggerMessageId);
        const now = new Date();
        const selection = {
          ...input,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now
        };
        getState().answerSelections.set(`${input.threadId}:${input.triggerMessageId}`, selection);
        return selection;
      }
    },
    runFeedbackRepo: {
      async clear(input) {
        getState().runFeedback.delete(`${input.runId}:${input.feedbackActorId}`);
      },
      async listByRunIds(runIds, feedbackActorId) {
        const runIdSet = new Set(runIds);
        return [...getState().runFeedback.values()].filter(
          (feedback) => runIdSet.has(feedback.runId) && (!feedbackActorId || feedback.feedbackActorId === feedbackActorId)
        );
      },
      async set(input) {
        const existing = getState().runFeedback.get(`${input.runId}:${input.feedbackActorId}`);
        const now = new Date();
        const feedback = {
          ...input,
          id: existing?.id ?? input.id,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now
        };
        getState().runFeedback.set(`${input.runId}:${input.feedbackActorId}`, feedback);
        return feedback;
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
      runEvents: new Map<string, RunEvent>(),
      chatShares: new Map<string, ChatShare>(),
      chatShareSnapshots: new Map<string, ChatShareSnapshot>(),
      answerCandidates: new Map<string, AnswerCandidate>(),
      answerSelections: new Map<string, AnswerSelection>(),
      runFeedback: new Map<string, RunFeedback>()
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
        model: input.model ?? 'deepseek-v4-flash'
      };
    },
    async runTextTurn(repositories, input) {
      await repositories.runRepo.updateStatus(input.runId, 'running', {
        startedAt: new Date('2026-04-10T01:00:00.000Z')
      });

      const assistantMessage = await repositories.messageRepo.createWithNextSeq({
        id: `assistant-${input.runId}`,
        threadId: input.threadId,
        runId: input.runId,
        role: 'assistant',
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
    },
    async generateText(input) {
      return {
        provider: input.provider ?? 'deepseek',
        model: input.model ?? 'deepseek-v4-flash',
        text: input.userPrompt
      };
    }
  };
}

function createFailingRuntime(): AgentInfraRuntimePort {
  return {
    async prepare(input) {
      return {
        provider: input.provider ?? 'deepseek',
        model: input.model ?? 'deepseek-v4-flash'
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
    },
    async generateText() {
      throw new Error('tool explosion');
    }
  };
}

async function persistAssistantAnswer(repositories: AgentInfraAppRepositories, input: { threadId: string; runId: string; text: string }) {
  const message = await repositories.messageRepo.createWithNextSeq({
    id: `assistant-${input.runId}`,
    threadId: input.threadId,
    runId: input.runId,
    role: 'assistant',
    status: 'completed',
    metadata: null
  });

  await repositories.messageRepo.createPart({
    id: `part-${input.runId}`,
    messageId: message.id,
    partIndex: 0,
    type: 'text',
    textValue: input.text,
    jsonValue: null
  });

  await repositories.runRepo.updateStatus(input.runId, 'completed', {
    finishedAt: new Date('2026-04-10T01:00:05.000Z')
  });

  return message;
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

  it('renames a thread title through the app boundary', async () => {
    const { app, repositories } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({
      appId: 'playground-runtime-pi',
      title: 'Original title'
    });

    const renamed = await app.threads.rename({
      threadId: thread.id,
      title: '  Renamed thread  '
    });

    expect(renamed.title).toBe('Renamed thread');
    expect((await repositories.threadRepo.findById(thread.id))?.title).toBe('Renamed thread');
  });

  it('rejects blank thread titles during rename', async () => {
    const { app } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({
      appId: 'playground-runtime-pi',
      title: 'Original title'
    });

    await expect(
      app.threads.rename({
        threadId: thread.id,
        title: '   '
      })
    ).rejects.toBeInstanceOf(InvalidThreadTitleError);
  });

  it('archives a thread and excludes it from active thread lists', async () => {
    const { app, repositories } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({
      appId: 'playground-runtime-pi',
      title: 'Archive me'
    });

    const archived = await app.threads.archive({ threadId: thread.id });

    expect(archived.status).toBe('archived');
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(await repositories.threadRepo.findById(thread.id)).toMatchObject({
      id: thread.id,
      status: 'archived'
    });
    expect(await app.threads.list({ appId: 'playground-runtime-pi' })).toEqual([]);
  });

  it('keeps active shares accessible after a thread is archived', async () => {
    const { app } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({
      appId: 'playground-runtime-pi',
      title: 'Archive shared thread'
    });

    const created = await app.shares.createThreadSnapshot({ threadId: thread.id });
    await app.threads.archive({ threadId: thread.id });

    const publicRead = await app.shares.getPublic({ publicId: created.share.publicId });
    expect(publicRead.share.publicId).toBe(created.share.publicId);
    expect(publicRead.snapshot.payloadFormat).toBe('messages_v1');
  });

  it('rejects archive when the thread has an active run', async () => {
    const { app } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({
      appId: 'playground-runtime-pi',
      title: 'Busy archive thread'
    });

    await app.turns.startText({
      threadId: thread.id,
      text: 'Still running'
    });

    await expect(app.threads.archive({ threadId: thread.id })).rejects.toBeInstanceOf(ThreadHasActiveRunError);
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
      model: 'deepseek-v4-flash'
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

  it('passes reasoning effort through to the runtime input', async () => {
    const runtime = createHappyRuntime();
    const runTextTurn = vi.spyOn(runtime, 'runTextTurn');
    const { app } = createDependencies(runtime);
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Reasoning path' });

    await app.turns.runText({
      threadId: thread.id,
      text: 'Think harder',
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      thinkingEnabled: true,
      reasoningEffort: 'max'
    });

    expect(runTextTurn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: 'deepseek',
        model: 'deepseek-v4-pro',
        thinkingEnabled: true,
        reasoningEffort: 'max'
      })
    );
  });

  it('queues a text turn and returns the run plus user message before runtime execution', async () => {
    const { app, repositories } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Queued path' });

    const started = await app.turns.startText({
      threadId: thread.id,
      text: 'Queue me',
      provider: 'deepseek',
      model: 'deepseek-v4-flash'
    });

    expect(started.run.status).toBe('queued');
    expect(started.runtimeSelection).toEqual({
      provider: 'deepseek',
      model: 'deepseek-v4-flash'
    });
    expect(started.userMessage.role).toBe('user');
    expect(started.userMessage.parts[0]?.textValue).toBe('Queue me');
    expect(await repositories.messageRepo.listByThread(thread.id)).toHaveLength(1);
    expect(await repositories.runRepo.findById(started.run.id)).not.toBeNull();
  });

  it('queues one user message with two answer candidate runs and default primary selection', async () => {
    const { app, repositories } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Candidate path' });

    const started = await app.turns.startTextCandidates({
      threadId: thread.id,
      text: 'Compare two answers',
      candidateCount: 2,
      provider: 'deepseek',
      model: 'deepseek-v4-flash'
    });

    expect(started.userMessage.parts[0]?.textValue).toBe('Compare two answers');
    expect(started.candidates.map((item) => item.candidate.ordinal)).toEqual([0, 1]);
    expect(started.candidates.map((item) => item.candidate.kind)).toEqual(['primary', 'alternative']);
    expect(new Set(started.candidates.map((item) => item.run.triggerMessageId))).toEqual(new Set([started.triggerMessageId]));
    expect(started.answerSelection).toMatchObject({
      threadId: thread.id,
      triggerMessageId: started.triggerMessageId,
      selectedRunId: started.candidates[0]?.run.id,
      source: 'default'
    });
    expect(await repositories.messageRepo.listByThread(thread.id)).toHaveLength(1);
    expect(await app.runs.listActiveByThread({ threadId: thread.id })).toHaveLength(2);
  });

  it('keeps legacy single-answer canonical projection unchanged', async () => {
    const { app } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Legacy projection' });

    await app.turns.runText({
      threadId: thread.id,
      text: 'Legacy question'
    });

    const projection = await app.threads.getCanonicalMessages({ threadId: thread.id });

    expect(projection.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(projection.messages[0]?.parts[0]?.textValue).toBe('Legacy question');
    expect(projection.messages[1]?.parts[0]?.textValue).toBe('Hello from runtime');
    expect(projection.diagnostics).toEqual([]);
  });

  it('projects the selected alternative candidate as canonical', async () => {
    const { app, repositories } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Selected alternative' });
    const started = await app.turns.startTextCandidates({
      threadId: thread.id,
      text: 'Which answer is better?',
      candidateCount: 2
    });
    const primary = started.candidates[0]!;
    const alternative = started.candidates[1]!;

    await persistAssistantAnswer(repositories, { threadId: thread.id, runId: primary.run.id, text: 'Primary answer' });
    await persistAssistantAnswer(repositories, { threadId: thread.id, runId: alternative.run.id, text: 'Alternative answer' });
    const selection = await app.turns.selectAnswerCandidate({
      threadId: thread.id,
      triggerMessageId: started.triggerMessageId,
      runId: alternative.run.id,
      selectedByUserId: 'user-1'
    });

    const projection = await app.threads.getCanonicalMessages({ threadId: thread.id });

    expect(selection.source).toBe('user');
    expect(projection.canonicalRunIds).toEqual([alternative.run.id]);
    expect(projection.messages.map((message) => message.parts[0]?.textValue)).toEqual(['Which answer is better?', 'Alternative answer']);
  });

  it('projects paged messages canonically while preserving durable page info', async () => {
    const { app, repositories } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Paged selected alternative' });
    const started = await app.turns.startTextCandidates({
      threadId: thread.id,
      text: 'Which paged answer is better?',
      candidateCount: 2
    });
    const primary = started.candidates[0]!;
    const alternative = started.candidates[1]!;

    await persistAssistantAnswer(repositories, { threadId: thread.id, runId: primary.run.id, text: 'Primary paged answer' });
    await persistAssistantAnswer(repositories, { threadId: thread.id, runId: alternative.run.id, text: 'Alternative paged answer' });
    await app.turns.selectAnswerCandidate({
      threadId: thread.id,
      triggerMessageId: started.triggerMessageId,
      runId: alternative.run.id,
      selectedByUserId: 'user-1'
    });

    const page = await app.threads.getCanonicalMessagesPage({ threadId: thread.id, limit: 3 });

    expect(page.canonicalRunIds).toEqual([alternative.run.id]);
    expect(page.messages.map((message) => message.parts[0]?.textValue)).toEqual(['Which paged answer is better?', 'Alternative paged answer']);
    expect(page.pageInfo).toEqual({
      hasOlder: false,
      hasNewer: false,
      startSeq: 1,
      endSeq: 3
    });
  });

  it('rejects candidate selection across different trigger messages', async () => {
    const { app } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Invalid selection' });
    const first = await app.turns.startTextCandidates({
      threadId: thread.id,
      text: 'First',
      candidateCount: 2
    });
    const second = await app.turns.startTextCandidates({
      threadId: thread.id,
      text: 'Second',
      candidateCount: 2
    });

    await expect(
      app.turns.selectAnswerCandidate({
        threadId: thread.id,
        triggerMessageId: second.triggerMessageId,
        runId: first.candidates[0]!.run.id
      })
    ).rejects.toBeInstanceOf(InvalidAnswerCandidateSelectionError);
  });

  it('rejects old answer selection changes after a later user message exists', async () => {
    const { app } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Immutable selection' });
    const first = await app.turns.startTextCandidates({
      threadId: thread.id,
      text: 'First',
      candidateCount: 2
    });
    await app.turns.startText({
      threadId: thread.id,
      text: 'Later user turn'
    });

    await expect(
      app.turns.selectAnswerCandidate({
        threadId: thread.id,
        triggerMessageId: first.triggerMessageId,
        runId: first.candidates[1]!.run.id
      })
    ).rejects.toBeInstanceOf(InvalidAnswerCandidateSelectionError);
  });

  it('falls back to a completed alternative when the default primary candidate failed', async () => {
    const { app, repositories } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Fallback projection' });
    const started = await app.turns.startTextCandidates({
      threadId: thread.id,
      text: 'Fallback question',
      candidateCount: 2
    });
    const primary = started.candidates[0]!;
    const alternative = started.candidates[1]!;

    await repositories.runRepo.updateStatus(primary.run.id, 'failed', {
      error: 'primary failed',
      finishedAt: new Date('2026-04-10T01:00:05.000Z')
    });
    await persistAssistantAnswer(repositories, { threadId: thread.id, runId: alternative.run.id, text: 'Recovered answer' });

    const projection = await app.threads.getCanonicalMessages({ threadId: thread.id });

    expect(projection.canonicalRunIds).toEqual([alternative.run.id]);
    expect(projection.messages.map((message) => message.parts[0]?.textValue)).toEqual(['Fallback question', 'Recovered answer']);
    expect(projection.diagnostics.map((diagnostic) => diagnostic.code)).toContain('failed_selected_candidate_fallback');
  });

  it('sets, replaces, clears, and validates run feedback for answer candidates', async () => {
    const { app } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Feedback path' });
    const started = await app.turns.startTextCandidates({
      threadId: thread.id,
      text: 'Feedback target',
      candidateCount: 2
    });
    const candidateRunId = started.candidates[0]!.run.id;

    const positive = await app.turns.setRunFeedback({
      threadId: thread.id,
      triggerMessageId: started.triggerMessageId,
      runId: candidateRunId,
      feedbackActorId: 'actor-1',
      value: 'thumbs_up'
    });
    const negative = await app.turns.setRunFeedback({
      threadId: thread.id,
      triggerMessageId: started.triggerMessageId,
      runId: candidateRunId,
      feedbackActorId: 'actor-1',
      value: 'thumbs_down'
    });
    const hydrated = await app.threads.getMessagesWithAnswerCandidates({ threadId: thread.id });

    expect(positive.id).toBe(negative.id);
    expect(hydrated.runFeedback).toMatchObject([{ runId: candidateRunId, value: 'thumbs_down' }]);

    await app.turns.clearRunFeedback({
      runId: candidateRunId,
      feedbackActorId: 'actor-1'
    });
    expect((await app.threads.getMessagesWithAnswerCandidates({ threadId: thread.id })).runFeedback).toEqual([]);

    await expect(
      app.turns.setRunFeedback({
        threadId: thread.id,
        triggerMessageId: started.triggerMessageId,
        runId: 'missing-run',
        feedbackActorId: 'actor-1',
        value: 'thumbs_up'
      })
    ).rejects.toBeInstanceOf(InvalidRunFeedbackError);
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

  it('returns paged thread messages with durable page info', async () => {
    const { app, repositories } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Paged messages path' });

    for (const seq of [1, 2, 3, 4, 5]) {
      const message = await repositories.messageRepo.create({
        id: `message-${seq}`,
        threadId: thread.id,
        runId: null,
        role: 'assistant',
        seq,
        status: 'completed',
        metadata: null
      });

      await repositories.messageRepo.createPart({
        id: `part-${seq}`,
        messageId: message.id,
        partIndex: 0,
        type: 'text',
        textValue: `message ${seq}`,
        jsonValue: null
      });
    }

    const latestPage = await app.threads.getMessagesPage({
      threadId: thread.id,
      limit: 2
    });

    expect(latestPage.messages.map((message) => message.seq)).toEqual([4, 5]);
    expect(latestPage.pageInfo).toEqual({
      hasOlder: true,
      hasNewer: false,
      startSeq: 4,
      endSeq: 5
    });

    const olderPage = await app.threads.getMessagesPage({
      threadId: thread.id,
      beforeSeq: latestPage.pageInfo.startSeq ?? undefined,
      limit: 2
    });

    expect(olderPage.messages.map((message) => message.seq)).toEqual([2, 3]);
    expect(olderPage.pageInfo).toEqual({
      hasOlder: true,
      hasNewer: true,
      startSeq: 2,
      endSeq: 3
    });
  });

  it('returns run timeline data from the app boundary', async () => {
    const { app, repositories } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Timeline path' });

    const turn = await app.turns.runText({
      threadId: thread.id,
      text: 'Timeline please'
    });

    await repositories.runEventRepo.append({
      id: 'event-message-start',
      threadId: thread.id,
      runId: turn.run.id,
      seq: await repositories.runEventRepo.nextSeq(turn.run.id),
      type: 'message_start',
      payload: { role: 'assistant' }
    });
    await repositories.toolRepo.create({
      id: 'tool-1',
      threadId: thread.id,
      runId: turn.run.id,
      messageId: `assistant-${turn.run.id}`,
      toolName: 'searchWeb',
      toolCallId: 'call-search',
      status: 'completed',
      input: { query: 'agent infra' },
      output: { text: 'result' },
      error: null,
      startedAt: new Date('2026-04-10T01:00:01.000Z'),
      finishedAt: new Date('2026-04-10T01:00:02.000Z')
    });
    await repositories.runEventRepo.append({
      id: 'event-tool-start',
      threadId: thread.id,
      runId: turn.run.id,
      seq: await repositories.runEventRepo.nextSeq(turn.run.id),
      type: 'tool_execution_start',
      payload: { toolName: 'searchWeb', toolCallId: 'call-search' }
    });
    await repositories.runEventRepo.append({
      id: 'event-tool-end',
      threadId: thread.id,
      runId: turn.run.id,
      seq: await repositories.runEventRepo.nextSeq(turn.run.id),
      type: 'tool_execution_end',
      payload: { toolName: 'searchWeb', toolCallId: 'call-search', isError: false }
    });
    await repositories.toolRepo.create({
      id: 'tool-2',
      threadId: thread.id,
      runId: turn.run.id,
      messageId: `assistant-${turn.run.id}`,
      toolName: 'fetchPage',
      toolCallId: 'call-fetch',
      status: 'failed',
      input: { url: 'https://example.test' },
      output: null,
      error: 'fetch failed',
      startedAt: new Date('2026-04-10T01:00:03.000Z'),
      finishedAt: new Date('2026-04-10T01:00:04.000Z')
    });
    await repositories.runEventRepo.append({
      id: 'event-tool-failed-start',
      threadId: thread.id,
      runId: turn.run.id,
      seq: await repositories.runEventRepo.nextSeq(turn.run.id),
      type: 'tool_execution_start',
      payload: { toolName: 'fetchPage', toolCallId: 'call-fetch' }
    });
    await repositories.runEventRepo.append({
      id: 'event-tool-failed-end',
      threadId: thread.id,
      runId: turn.run.id,
      seq: await repositories.runEventRepo.nextSeq(turn.run.id),
      type: 'tool_execution_end',
      payload: { toolName: 'fetchPage', toolCallId: 'call-fetch' }
    });
    await repositories.runEventRepo.append({
      id: 'event-message-end',
      threadId: thread.id,
      runId: turn.run.id,
      seq: await repositories.runEventRepo.nextSeq(turn.run.id),
      type: 'message_end',
      payload: { role: 'assistant', stopReason: 'stop' }
    });
    await repositories.runEventRepo.append({
      id: 'event-unknown',
      threadId: thread.id,
      runId: turn.run.id,
      seq: await repositories.runEventRepo.nextSeq(turn.run.id),
      type: 'custom_runtime_note',
      payload: { note: 'preserved as unknown' }
    });

    const timeline = await app.runs.getTimeline({ runId: turn.run.id });

    expect(timeline.run.id).toBe(turn.run.id);
    expect(timeline.runEvents.map((event) => event.type)).toEqual([
      'agent_start',
      'message_start',
      'tool_execution_start',
      'tool_execution_end',
      'tool_execution_start',
      'tool_execution_end',
      'message_end',
      'custom_runtime_note'
    ]);
    expect(timeline.toolInvocations).toHaveLength(2);
    expect(timeline.projection).toEqual({
      schemaVersion: 1,
      items: [
        {
          kind: 'run_lifecycle',
          phase: 'started',
          runEventId: `event-${turn.run.id}-1`,
          seq: 1
        },
        {
          kind: 'assistant_message',
          phase: 'started',
          runEventId: 'event-message-start',
          seq: 2
        },
        {
          kind: 'tool_invocation',
          phase: 'started',
          toolCallId: 'call-search',
          toolName: 'searchWeb',
          toolInvocationId: 'tool-1',
          runEventId: 'event-tool-start',
          seq: 3
        },
        {
          kind: 'tool_invocation',
          phase: 'completed',
          toolCallId: 'call-search',
          toolName: 'searchWeb',
          toolInvocationId: 'tool-1',
          runEventId: 'event-tool-end',
          seq: 4
        },
        {
          kind: 'tool_invocation',
          phase: 'started',
          toolCallId: 'call-fetch',
          toolName: 'fetchPage',
          toolInvocationId: 'tool-2',
          runEventId: 'event-tool-failed-start',
          seq: 5
        },
        {
          kind: 'tool_invocation',
          phase: 'failed',
          toolCallId: 'call-fetch',
          toolName: 'fetchPage',
          toolInvocationId: 'tool-2',
          runEventId: 'event-tool-failed-end',
          seq: 6
        },
        {
          kind: 'assistant_message',
          phase: 'completed',
          runEventId: 'event-message-end',
          seq: 7
        },
        {
          kind: 'unknown_event',
          type: 'custom_runtime_note',
          runEventId: 'event-unknown',
          seq: 8
        }
      ]
    });
  });

  it('projects cancelled run lifecycle without reporting completion', async () => {
    const { app, repositories } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Cancelled timeline' });
    const run = await repositories.runRepo.create({
      id: 'run-cancelled',
      threadId: thread.id,
      triggerMessageId: null,
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      status: 'cancelled',
      usage: null,
      error: null,
      startedAt: new Date('2026-04-10T01:00:00.000Z'),
      finishedAt: new Date('2026-04-10T01:00:05.000Z')
    });
    await repositories.runEventRepo.append({
      id: 'event-cancelled-start',
      threadId: thread.id,
      runId: run.id,
      seq: 1,
      type: 'agent_start',
      payload: null
    });
    await repositories.runEventRepo.append({
      id: 'event-cancelled-end',
      threadId: thread.id,
      runId: run.id,
      seq: 2,
      type: 'agent_end',
      payload: null
    });

    const timeline = await app.runs.getTimeline({ runId: run.id });

    expect(timeline.projection.items).toEqual([
      {
        kind: 'run_lifecycle',
        phase: 'started',
        runEventId: 'event-cancelled-start',
        seq: 1
      },
      {
        kind: 'run_lifecycle',
        phase: 'cancelled',
        runEventId: 'event-cancelled-end',
        seq: 2
      }
    ]);
  });

  it('returns run trace spans from durable app records', async () => {
    const { app, repositories } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Trace path' });

    const turn = await app.turns.runText({
      threadId: thread.id,
      text: 'Trace please'
    });

    await repositories.runEventRepo.append({
      id: 'trace-message-start',
      threadId: thread.id,
      runId: turn.run.id,
      seq: await repositories.runEventRepo.nextSeq(turn.run.id),
      type: 'message_start',
      payload: { role: 'assistant' }
    });
    await repositories.toolRepo.create({
      id: 'trace-tool-1',
      threadId: thread.id,
      runId: turn.run.id,
      messageId: `assistant-${turn.run.id}`,
      toolName: 'searchWeb',
      toolCallId: 'trace-call-search',
      status: 'completed',
      input: { query: 'agent infra' },
      output: { text: 'result' },
      error: null,
      startedAt: new Date('2026-04-10T01:00:01.000Z'),
      finishedAt: new Date('2026-04-10T01:00:02.000Z')
    });
    await repositories.runEventRepo.append({
      id: 'trace-tool-start',
      threadId: thread.id,
      runId: turn.run.id,
      seq: await repositories.runEventRepo.nextSeq(turn.run.id),
      type: 'tool_execution_start',
      payload: { toolName: 'searchWeb', toolCallId: 'trace-call-search' }
    });
    await repositories.runEventRepo.append({
      id: 'trace-tool-end',
      threadId: thread.id,
      runId: turn.run.id,
      seq: await repositories.runEventRepo.nextSeq(turn.run.id),
      type: 'tool_execution_end',
      payload: { toolName: 'searchWeb', toolCallId: 'trace-call-search', isError: false }
    });
    await repositories.toolRepo.create({
      id: 'trace-tool-2',
      threadId: thread.id,
      runId: turn.run.id,
      messageId: `assistant-${turn.run.id}`,
      toolName: 'fetchPage',
      toolCallId: 'trace-call-fetch',
      status: 'failed',
      input: { url: 'https://example.test' },
      output: null,
      error: 'fetch failed',
      startedAt: new Date('2026-04-10T01:00:03.000Z'),
      finishedAt: new Date('2026-04-10T01:00:04.000Z')
    });
    await repositories.runEventRepo.append({
      id: 'trace-tool-failed-end',
      threadId: thread.id,
      runId: turn.run.id,
      seq: await repositories.runEventRepo.nextSeq(turn.run.id),
      type: 'tool_execution_end',
      payload: { toolName: 'fetchPage', toolCallId: 'trace-call-fetch' }
    });
    await repositories.runEventRepo.append({
      id: 'trace-message-end',
      threadId: thread.id,
      runId: turn.run.id,
      seq: await repositories.runEventRepo.nextSeq(turn.run.id),
      type: 'message_end',
      payload: { role: 'assistant', stopReason: 'stop' }
    });
    await repositories.runEventRepo.append({
      id: 'trace-unknown',
      threadId: thread.id,
      runId: turn.run.id,
      seq: await repositories.runEventRepo.nextSeq(turn.run.id),
      type: 'custom_runtime_note',
      payload: { note: 'preserved as unknown' }
    });

    const trace = await app.runs.getTrace({ runId: turn.run.id });
    const rootSpan = trace.projection.spans.find((span) => span.kind === 'agent');
    const assistantSpan = trace.projection.spans.find((span) => span.kind === 'assistant_message');
    const completedToolSpan = trace.projection.spans.find((span) => span.id === 'span:tool:trace-tool-1');
    const failedToolSpan = trace.projection.spans.find((span) => span.id === 'span:tool:trace-tool-2');
    const unknownSpan = trace.projection.spans.find((span) => span.kind === 'unknown_event');

    expect(trace.run.id).toBe(turn.run.id);
    expect(trace.projection).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        traceId: turn.run.id,
        rootSpanId: `span:run:${turn.run.id}`,
        appId: 'playground-runtime-pi',
        threadId: thread.id,
        runId: turn.run.id,
        status: 'completed',
        durationMs: 5000
      })
    );
    expect(rootSpan).toEqual(
      expect.objectContaining({
        id: `span:run:${turn.run.id}`,
        parentSpanId: null,
        status: 'completed',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        sourceRefs: expect.arrayContaining([
          { type: 'run', id: turn.run.id },
          { type: 'run_event', id: `event-${turn.run.id}-1`, seq: 1, eventType: 'agent_start' }
        ])
      })
    );
    expect(assistantSpan).toEqual(
      expect.objectContaining({
        id: 'span:assistant_message:trace-message-start',
        parentSpanId: `span:run:${turn.run.id}`,
        status: 'completed',
        sourceRefs: [
          { type: 'run_event', id: 'trace-message-start', seq: 2, eventType: 'message_start' },
          { type: 'run_event', id: 'trace-message-end', seq: 6, eventType: 'message_end' }
        ]
      })
    );
    expect(completedToolSpan).toEqual(
      expect.objectContaining({
        parentSpanId: `span:run:${turn.run.id}`,
        status: 'completed',
        tool: {
          toolInvocationId: 'trace-tool-1',
          toolCallId: 'trace-call-search',
          toolName: 'searchWeb'
        }
      })
    );
    expect(failedToolSpan).toEqual(
      expect.objectContaining({
        parentSpanId: `span:run:${turn.run.id}`,
        status: 'failed',
        error: { message: 'fetch failed' },
        sourceRefs: expect.arrayContaining([
          { type: 'tool_invocation', id: 'trace-tool-2', toolCallId: 'trace-call-fetch' },
          { type: 'run_event', id: 'trace-tool-failed-end', seq: 5, eventType: 'tool_execution_end' }
        ])
      })
    );
    expect(unknownSpan).toEqual(
      expect.objectContaining({
        id: 'span:event:trace-unknown',
        parentSpanId: `span:run:${turn.run.id}`,
        name: 'custom_runtime_note',
        status: 'unknown'
      })
    );
    expect(trace.projection.diagnostics.unknownEventCount).toBe(1);
    expect(trace.projection.diagnostics.warnings).toContainEqual({
      code: 'unknown_event',
      message: 'unknown run event type: custom_runtime_note',
      sourceRefs: [{ type: 'run_event', id: 'trace-unknown', seq: 7, eventType: 'custom_runtime_note' }]
    });
  });

  it('projects cancelled run trace without reporting completion', async () => {
    const { app, repositories } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Cancelled trace' });
    const run = await repositories.runRepo.create({
      id: 'trace-run-cancelled',
      threadId: thread.id,
      triggerMessageId: null,
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      status: 'cancelled',
      usage: null,
      error: null,
      startedAt: new Date('2026-04-10T01:00:00.000Z'),
      finishedAt: new Date('2026-04-10T01:00:05.000Z')
    });
    await repositories.runEventRepo.append({
      id: 'trace-cancelled-start',
      threadId: thread.id,
      runId: run.id,
      seq: 1,
      type: 'agent_start',
      payload: null
    });
    await repositories.runEventRepo.append({
      id: 'trace-cancelled-end',
      threadId: thread.id,
      runId: run.id,
      seq: 2,
      type: 'agent_end',
      payload: null
    });

    const trace = await app.runs.getTrace({ runId: run.id });

    expect(trace.projection.status).toBe('cancelled');
    expect(trace.projection.spans).toContainEqual(
      expect.objectContaining({
        id: 'span:run:trace-run-cancelled',
        kind: 'agent',
        status: 'cancelled',
        durationMs: 5000
      })
    );
  });

  it('projects assistant message_end error payloads as failed spans', async () => {
    const { app, repositories } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Assistant trace error' });
    const run = await repositories.runRepo.create({
      id: 'trace-run-message-error',
      threadId: thread.id,
      triggerMessageId: null,
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      status: 'failed',
      usage: null,
      error: 'assistant failed',
      startedAt: new Date('2026-04-10T01:00:00.000Z'),
      finishedAt: new Date('2026-04-10T01:00:05.000Z')
    });
    await repositories.runEventRepo.append({
      id: 'trace-message-error-start',
      threadId: thread.id,
      runId: run.id,
      seq: 1,
      type: 'message_start',
      payload: { role: 'assistant' }
    });
    await repositories.runEventRepo.append({
      id: 'trace-message-error-end',
      threadId: thread.id,
      runId: run.id,
      seq: 2,
      type: 'message_end',
      payload: { role: 'assistant', stopReason: 'stop', error: { message: 'provider failed' } }
    });

    const trace = await app.runs.getTrace({ runId: run.id });

    expect(trace.projection.spans).toContainEqual(
      expect.objectContaining({
        id: 'span:assistant_message:trace-message-error-start',
        kind: 'assistant_message',
        status: 'failed',
        sourceRefs: [
          { type: 'run_event', id: 'trace-message-error-start', seq: 1, eventType: 'message_start' },
          { type: 'run_event', id: 'trace-message-error-end', seq: 2, eventType: 'message_end' }
        ]
      })
    );
  });

  it('projects runtime errors and orphan trace events as diagnostics', async () => {
    const { app, repositories } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Failed trace' });
    const run = await repositories.runRepo.create({
      id: 'trace-run-failed',
      threadId: thread.id,
      triggerMessageId: null,
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      status: 'failed',
      usage: null,
      error: 'tool explosion',
      startedAt: new Date('2026-04-10T01:00:00.000Z'),
      finishedAt: new Date('2026-04-10T01:00:05.000Z')
    });
    await repositories.runEventRepo.append({
      id: 'trace-failed-start',
      threadId: thread.id,
      runId: run.id,
      seq: 1,
      type: 'agent_start',
      payload: null
    });
    await repositories.runEventRepo.append({
      id: 'trace-unpaired-message-start',
      threadId: thread.id,
      runId: run.id,
      seq: 2,
      type: 'message_start',
      payload: { role: 'assistant' }
    });
    await repositories.runEventRepo.append({
      id: 'trace-orphan-tool-end',
      threadId: thread.id,
      runId: run.id,
      seq: 3,
      type: 'tool_execution_end',
      payload: { toolName: 'searchWeb', toolCallId: 'missing-call', isError: true }
    });
    await repositories.runEventRepo.append({
      id: 'trace-runtime-error',
      threadId: thread.id,
      runId: run.id,
      seq: 4,
      type: 'runtime_error',
      payload: { message: 'tool explosion' }
    });

    const trace = await app.runs.getTrace({ runId: run.id });

    expect(trace.projection.status).toBe('failed');
    expect(trace.projection.spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'span:assistant_message:trace-unpaired-message-start',
          kind: 'assistant_message',
          status: 'failed'
        }),
        expect.objectContaining({
          id: 'span:event:trace-orphan-tool-end',
          kind: 'tool_invocation',
          status: 'failed',
          tool: {
            toolInvocationId: null,
            toolCallId: 'missing-call',
            toolName: 'searchWeb'
          }
        }),
        expect.objectContaining({
          id: 'span:event:trace-runtime-error',
          kind: 'runtime_error',
          status: 'failed',
          error: { message: 'tool explosion' }
        })
      ])
    );
    expect(trace.projection.diagnostics.orphanEventCount).toBe(1);
    expect(trace.projection.diagnostics.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(['unpaired_message_start', 'orphan_event', 'missing_tool_invocation', 'unpaired_tool_end'])
    );
  });

  it('lists recent runs for a thread in reverse chronological order', async () => {
    const { app } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Recent runs path' });

    const first = await app.turns.startText({
      threadId: thread.id,
      text: 'First'
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = await app.turns.startText({
      threadId: thread.id,
      text: 'Second'
    });

    const runs = await app.runs.listByThread({ threadId: thread.id, limit: 1 });

    expect(runs).toHaveLength(1);
    expect(runs[0]?.id).toBe(second.run.id);

    const allRuns = await app.runs.listByThread({ threadId: thread.id });
    expect(allRuns.map((run) => run.id)).toEqual([second.run.id, first.run.id]);
  });

  it('returns the latest active run for a thread', async () => {
    const { app, repositories } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Active run path' });

    const first = await app.turns.startText({
      threadId: thread.id,
      text: 'First'
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = await app.turns.startText({
      threadId: thread.id,
      text: 'Second'
    });

    expect((await app.runs.getActiveByThread({ threadId: thread.id }))?.id).toBe(second.run.id);

    await repositories.runRepo.updateStatus(second.run.id, 'completed');
    expect((await app.runs.getActiveByThread({ threadId: thread.id }))?.id).toBe(first.run.id);

    await repositories.runRepo.updateStatus(first.run.id, 'failed');
    expect(await app.runs.getActiveByThread({ threadId: thread.id })).toBeNull();
  });

  it('throws a typed not-found error for a missing run timeline', async () => {
    const { app } = createDependencies(createHappyRuntime());

    await expect(app.runs.getTimeline({ runId: 'missing-run' })).rejects.toBeInstanceOf(RunNotFoundError);
  });

  it('creates a thread snapshot share with share-safe ids and search bundles', async () => {
    const { app, repositories } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Shared thread' });

    const userMessage = await repositories.messageRepo.create({
      id: 'message-user-1',
      threadId: thread.id,
      runId: null,
      role: 'user',
      seq: 1,
      status: 'completed',
      metadata: null
    });
    await repositories.messageRepo.createPart({
      id: 'message-user-1-part-1',
      messageId: userMessage.id,
      partIndex: 0,
      type: 'text',
      textValue: 'Help me search Claude news',
      jsonValue: null
    });

    const run = await repositories.runRepo.create({
      id: 'run-1',
      threadId: thread.id,
      triggerMessageId: userMessage.id,
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      status: 'completed',
      usage: null,
      error: null,
      startedAt: new Date('2026-04-10T01:00:00.000Z'),
      finishedAt: new Date('2026-04-10T01:00:05.000Z')
    });

    const assistantMessage = await repositories.messageRepo.create({
      id: 'message-assistant-1',
      threadId: thread.id,
      runId: run.id,
      role: 'assistant',
      seq: 2,
      status: 'completed',
      metadata: null
    });
    await repositories.messageRepo.createPart({
      id: 'message-assistant-1-part-1',
      messageId: assistantMessage.id,
      partIndex: 0,
      type: 'text',
      textValue: 'I will search for Claude news.',
      jsonValue: null
    });
    await repositories.messageRepo.createPart({
      id: 'message-assistant-1-part-2',
      messageId: assistantMessage.id,
      partIndex: 1,
      type: 'tool-call',
      textValue: null,
      jsonValue: {
        toolName: 'searchWeb',
        toolCallId: 'tool-call-1',
        input: { query: 'Claude news 2026' }
      }
    });

    const toolMessage = await repositories.messageRepo.create({
      id: 'message-tool-1',
      threadId: thread.id,
      runId: run.id,
      role: 'tool',
      seq: 3,
      status: 'completed',
      metadata: null
    });
    await repositories.messageRepo.createPart({
      id: 'message-tool-1-part-1',
      messageId: toolMessage.id,
      partIndex: 0,
      type: 'tool-result',
      textValue: 'Found relevant results.',
      jsonValue: {
        toolName: 'searchWeb',
        toolCallId: 'tool-call-1',
        content: [{ type: 'text', text: 'Found relevant results.' }],
        details: {
          query: 'Claude news 2026',
          resultCount: 8,
          sources: [{ sourceName: 'Anthropic', hostname: 'www.anthropic.com' }]
        },
        isError: false
      }
    });

    await repositories.toolRepo.create({
      id: 'invocation-1',
      threadId: thread.id,
      runId: run.id,
      messageId: assistantMessage.id,
      toolName: 'searchWeb',
      toolCallId: 'tool-call-1',
      status: 'completed',
      input: { query: 'Claude news 2026' },
      output: {
        artifact: { provider: 'tavily' },
        details: {
          query: 'Claude news 2026',
          resultCount: 8,
          sources: [{ sourceName: 'Anthropic', hostname: 'www.anthropic.com' }]
        }
      },
      error: null,
      startedAt: new Date('2026-04-10T01:00:01.000Z'),
      finishedAt: new Date('2026-04-10T01:00:02.000Z')
    });

    const result = await app.shares.createThreadSnapshot({ threadId: thread.id });

    expect(result.share.publicId).toBeTruthy();
    expect(result.share.sourceThreadId).toBe(thread.id);
    expect(result.snapshot.payloadFormat).toBe('messages_v1');

    const payload = result.snapshot.payloadJson as {
      title: string | null;
      messages: Array<{ id: string; runId?: string | null; parts: Array<{ type: string; jsonValue?: Record<string, unknown> | null }> }>;
      searchBundles: Record<string, { toolCallId: string; input?: Record<string, unknown> | null }>;
    };

    expect(payload.title).toBe('Shared thread');
    expect(payload.messages.map((message) => message.id)).toEqual(['shared-message-1', 'shared-message-2', 'shared-message-3']);
    expect(payload.messages[1]?.runId).toBe('shared-run-1');
    expect(payload.messages[1]?.parts[1]?.jsonValue).toEqual({
      toolName: 'searchWeb',
      toolCallId: 'shared-tool-call-1',
      input: { query: 'Claude news 2026' }
    });
    expect(payload.messages[2]?.parts[0]?.jsonValue).toEqual({
      toolName: 'searchWeb',
      toolCallId: 'shared-tool-call-1',
      content: [{ type: 'text', text: 'Found relevant results.' }],
      details: {
        query: 'Claude news 2026',
        resultCount: 8,
        sources: [{ sourceName: 'Anthropic', hostname: 'www.anthropic.com' }]
      },
      isError: false
    });
    expect(payload.searchBundles['shared-tool-call-1']).toMatchObject({
      runId: 'shared-run-1',
      toolCallId: 'shared-tool-call-1',
      input: { query: 'Claude news 2026' }
    });
  });

  it('creates canonical snapshot shares for dual-answer threads without unselected candidates', async () => {
    const { app, repositories } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Dual share path' });
    const started = await app.turns.startTextCandidates({
      threadId: thread.id,
      text: 'Share the selected answer',
      candidateCount: 2
    });
    const primary = started.candidates[0]!;
    const alternative = started.candidates[1]!;

    await persistAssistantAnswer(repositories, { threadId: thread.id, runId: primary.run.id, text: 'Primary shared answer' });
    await persistAssistantAnswer(repositories, { threadId: thread.id, runId: alternative.run.id, text: 'Alternative shared answer' });
    await app.turns.selectAnswerCandidate({
      threadId: thread.id,
      triggerMessageId: started.triggerMessageId,
      runId: alternative.run.id
    });

    const result = await app.shares.createThreadSnapshot({ threadId: thread.id });
    const payload = result.snapshot.payloadJson as {
      messages: Array<{ parts: Array<{ textValue?: string | null }> }>;
    };

    expect(payload.messages.map((message) => message.parts[0]?.textValue)).toEqual([
      'Share the selected answer',
      'Alternative shared answer'
    ]);
  });

  it('rejects snapshot share creation when the thread has an active run', async () => {
    const { app } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Active share path' });

    await app.turns.startText({
      threadId: thread.id,
      text: 'Still running'
    });

    await expect(app.shares.createThreadSnapshot({ threadId: thread.id })).rejects.toBeInstanceOf(ThreadHasActiveRunError);
  });

  it('returns the current active share for a thread and blocks duplicate active shares', async () => {
    const { app } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Single share path' });

    const first = await app.shares.createThreadSnapshot({ threadId: thread.id });

    expect((await app.shares.getCurrentByThread({ threadId: thread.id }))?.id).toBe(first.share.id);
    await expect(app.shares.createThreadSnapshot({ threadId: thread.id })).rejects.toBeInstanceOf(ActiveChatShareExistsError);
  });

  it('loads a public share and rejects reads after revoke', async () => {
    const { app } = createDependencies(createHappyRuntime());
    const thread = await app.threads.create({ appId: 'playground-runtime-pi', title: 'Revoked share path' });

    const created = await app.shares.createThreadSnapshot({ threadId: thread.id });
    const publicRead = await app.shares.getPublic({ publicId: created.share.publicId });
    expect(publicRead.share.id).toBe(created.share.id);
    expect(publicRead.snapshot.payloadFormat).toBe('messages_v1');

    const revoked = await app.shares.revoke({ publicId: created.share.publicId });
    expect(revoked.status).toBe('revoked');

    await expect(app.shares.getPublic({ publicId: created.share.publicId })).rejects.toBeInstanceOf(ChatShareRevokedError);
  });
});
