import crypto from 'node:crypto';

import type { Message, MessagePart, Run } from '@agent-infra/core';

import {
  AgentInfraAppError,
  InvalidTurnTextError,
  RunNotFoundError,
  RuntimeUnavailableError,
  ThreadNotActiveError,
  ThreadNotFoundError,
  TurnPersistenceError,
  TurnProjectionError
} from './errors';
import type { AgentInfraApp, AgentInfraAppDependencies, AgentInfraAppRepositories, CreateThreadInput, RunTextTurnInput, RuntimeSelection } from './types';

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

async function resolveRuntimeSelection(dependencies: AgentInfraAppDependencies, input: Pick<RunTextTurnInput, 'provider' | 'model'>): Promise<RuntimeSelection> {
  try {
    return await dependencies.runtime.prepare(input);
  } catch (error) {
    if (error instanceof AgentInfraAppError) {
      throw error;
    }

    throw new RuntimeUnavailableError(toErrorMessage(error, 'runtime is unavailable'), error);
  }
}

async function loadThreadOrThrow(repositories: AgentInfraAppRepositories, threadId: string) {
  const thread = await repositories.threadRepo.findById(threadId);
  if (!thread) {
    throw new ThreadNotFoundError(threadId);
  }

  return thread;
}

function trimTurnText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new InvalidTurnTextError();
  }

  return trimmed;
}

async function loadRunOrThrow(repositories: AgentInfraAppRepositories, runId: string) {
  const run = await repositories.runRepo.findById(runId);
  if (!run) {
    throw new RunNotFoundError(runId);
  }

  return run;
}

async function readProjectedTurnOutcome(repositories: AgentInfraAppRepositories, threadId: string, runId: string) {
  try {
    const [run, messages, runEvents, toolInvocations] = await Promise.all([
      repositories.runRepo.findById(runId),
      repositories.messageRepo.listByThread(threadId),
      repositories.runEventRepo.listByRun(runId),
      repositories.toolRepo.listByRun(runId)
    ]);

    if (!run) {
      throw new TurnProjectionError('run projection is missing', { threadId, runId });
    }

    return {
      run,
      messages,
      debug: {
        runEventCount: runEvents.length,
        toolInvocationCount: toolInvocations.length
      }
    };
  } catch (error) {
    if (error instanceof TurnProjectionError) {
      throw error;
    }

    throw new TurnProjectionError('failed to read turn projection', { threadId, runId }, error);
  }
}

async function queueTextTurn(
  dependencies: AgentInfraAppDependencies,
  input: RunTextTurnInput,
  generateId: () => string
): Promise<{
  thread: Awaited<ReturnType<typeof loadThreadOrThrow>>;
  text: string;
  run: Run;
  userMessage: Message & { parts: MessagePart[] };
  runtimeSelection: RuntimeSelection;
}> {
  const text = trimTurnText(input.text);
  const thread = await loadThreadOrThrow(dependencies.repositories, input.threadId);
  if (thread.status !== 'active') {
    throw new ThreadNotActiveError(thread.id, thread.status);
  }

  const runtimeSelection = await resolveRuntimeSelection(dependencies, input);
  let queuedRunId = '';
  let queuedRun: Run | null = null;
  let queuedMessage: (Message & { parts: MessagePart[] }) | null = null;

  try {
    await dependencies.transaction(async (repositories) => {
      const messageId = generateId();
      const runId = generateId();
      queuedRunId = runId;

      const userMessage = await repositories.messageRepo.create({
        id: messageId,
        threadId: thread.id,
        runId: null,
        role: 'user',
        seq: await repositories.messageRepo.nextSeq(thread.id),
        status: 'completed',
        metadata: null
      });

      const firstPart = await repositories.messageRepo.createPart({
        id: generateId(),
        messageId: userMessage.id,
        partIndex: 0,
        type: 'text',
        textValue: text,
        jsonValue: null
      });

      const run = await repositories.runRepo.create({
        id: runId,
        threadId: thread.id,
        triggerMessageId: userMessage.id,
        provider: runtimeSelection.provider,
        model: runtimeSelection.model,
        status: 'queued',
        usage: null,
        error: null,
        startedAt: null,
        finishedAt: null
      });

      queuedMessage = {
        ...userMessage,
        parts: [firstPart]
      };
      queuedRun = run;
    });
  } catch (error) {
    throw new TurnPersistenceError('failed to persist queued turn state', { threadId: thread.id, runId: queuedRunId }, error);
  }

  if (!queuedRun || !queuedMessage) {
    throw new TurnPersistenceError('queued turn state was not committed', { threadId: thread.id, runId: queuedRunId });
  }

  return {
    thread,
    text,
    run: queuedRun,
    userMessage: queuedMessage,
    runtimeSelection
  };
}

export function createAgentInfraApp(dependencies: AgentInfraAppDependencies): AgentInfraApp {
  const generateId = dependencies.idGenerator ?? crypto.randomUUID;
  void dependencies.now;

  return {
    threads: {
      async create(input: CreateThreadInput) {
        return dependencies.repositories.threadRepo.create({
          id: generateId(),
          appId: input.appId,
          userId: input.userId ?? null,
          title: input.title?.trim() ? input.title.trim() : null,
          status: 'active',
          metadata: input.metadata ?? null,
          archivedAt: null
        });
      },
      async list(input) {
        return dependencies.repositories.threadRepo.listByApp(input.appId);
      },
      async getMessages(input) {
        await loadThreadOrThrow(dependencies.repositories, input.threadId);
        return dependencies.repositories.messageRepo.listByThread(input.threadId);
      }
    },
    turns: {
      async startText(input) {
        const queued = await queueTextTurn(dependencies, input, generateId);
        return {
          run: queued.run,
          userMessage: queued.userMessage,
          runtimeSelection: queued.runtimeSelection
        };
      },
      async runText(input) {
        const queued = await queueTextTurn(dependencies, input, generateId);
        const runId = queued.run.id;

        let executionError: string | undefined;
        try {
          await dependencies.runtime.runTextTurn(dependencies.repositories, {
            threadId: queued.thread.id,
            runId,
            provider: queued.runtimeSelection.provider,
            model: queued.runtimeSelection.model
          });
        } catch (error) {
          executionError = toErrorMessage(error, 'runtime execution failed');
        }

        const projection = await readProjectedTurnOutcome(dependencies.repositories, queued.thread.id, runId);
        return {
          ...projection,
          executionError
        };
      }
    },
    runs: {
      async getTimeline(input) {
        const run = await loadRunOrThrow(dependencies.repositories, input.runId);
        const [runEvents, toolInvocations] = await Promise.all([
          dependencies.repositories.runEventRepo.listByRun(input.runId),
          dependencies.repositories.toolRepo.listByRun(input.runId)
        ]);

        return {
          run,
          runEvents,
          toolInvocations
        };
      },
      async listByThread(input) {
        await loadThreadOrThrow(dependencies.repositories, input.threadId);
        return dependencies.repositories.runRepo.listByThread(input.threadId, {
          limit: input.limit
        });
      }
    }
  };
}
