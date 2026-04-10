import crypto from 'node:crypto';

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
      async runText(input) {
        const text = trimTurnText(input.text);
        const thread = await loadThreadOrThrow(dependencies.repositories, input.threadId);
        if (thread.status !== 'active') {
          throw new ThreadNotActiveError(thread.id, thread.status);
        }

        const runtimeSelection = await resolveRuntimeSelection(dependencies, input);
        let runId = '';

        try {
          await dependencies.transaction(async (repositories) => {
            const messageId = generateId();
            runId = generateId();

            const userMessage = await repositories.messageRepo.create({
              id: messageId,
              threadId: thread.id,
              runId: null,
              role: 'user',
              seq: await repositories.messageRepo.nextSeq(thread.id),
              status: 'completed',
              metadata: null
            });

            await repositories.messageRepo.createPart({
              id: generateId(),
              messageId: userMessage.id,
              partIndex: 0,
              type: 'text',
              textValue: text,
              jsonValue: null
            });

            await repositories.runRepo.create({
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
          });
        } catch (error) {
          throw new TurnPersistenceError('failed to persist queued turn state', { threadId: thread.id, runId }, error);
        }

        let executionError: string | undefined;
        try {
          await dependencies.runtime.runTextTurn(dependencies.repositories, {
            threadId: thread.id,
            runId,
            provider: runtimeSelection.provider,
            model: runtimeSelection.model
          });
        } catch (error) {
          executionError = toErrorMessage(error, 'runtime execution failed');
        }

        const projection = await readProjectedTurnOutcome(dependencies.repositories, thread.id, runId);
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
      }
    }
  };
}
