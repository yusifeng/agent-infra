import crypto from 'node:crypto';

import type { Message, MessagePart, Run, ToolInvocation } from '@agent-infra/core';

import {
  ActiveChatShareExistsError,
  AgentInfraAppError,
  ChatShareNotFoundError,
  ChatShareRevokedError,
  InvalidThreadTitleError,
  InvalidTurnTextError,
  RunNotFoundError,
  RuntimeUnavailableError,
  SharePersistenceError,
  ShareSnapshotBuildError,
  ThreadNotActiveError,
  ThreadHasActiveRunError,
  ThreadNotFoundError,
  TurnPersistenceError,
  TurnProjectionError
} from './errors.js';
import type {
  AgentInfraApp,
  AgentInfraAppDependencies,
  AgentInfraAppRepositories,
  CreateThreadInput,
  PublicChatShareResult,
  RunTextTurnInput,
  RuntimeSelection,
  SharedMessagePartSnapshot,
  SharedMessageSnapshot,
  SharedSearchBundle,
  SharedThreadSnapshotPayload
} from './types.js';

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

function trimThreadTitle(title: string) {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new InvalidThreadTitleError();
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

async function loadShareByPublicIdOrThrow(repositories: AgentInfraAppRepositories, publicId: string) {
  const share = await repositories.chatShareRepo.findByPublicId(publicId);
  if (!share) {
    throw new ChatShareNotFoundError(publicId);
  }

  return share;
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

function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function toSnapshotPayloadJson(payload: SharedThreadSnapshotPayload): Record<string, unknown> {
  return payload as unknown as Record<string, unknown>;
}

function fromSnapshotPayloadJson(payload: Record<string, unknown>): SharedThreadSnapshotPayload {
  return payload as unknown as SharedThreadSnapshotPayload;
}

function sanitizeShareToolPartJson(
  part: MessagePart,
  sharedToolCallId: string
): Record<string, unknown> | null {
  const value = part.jsonValue ?? {};

  if (part.type === 'tool-call') {
    const toolName = typeof value.toolName === 'string' ? value.toolName : 'unknown';
    const input = typeof value.input === 'object' && value.input !== null ? structuredClone(value.input) : null;

    return {
      toolName,
      toolCallId: sharedToolCallId,
      input
    };
  }

  if (part.type === 'tool-result') {
    const toolName = typeof value.toolName === 'string' ? value.toolName : 'unknown';
    const content = Array.isArray(value.content) ? structuredClone(value.content) : [];
    const details = typeof value.details === 'object' && value.details !== null ? structuredClone(value.details) : null;
    const isError = value.isError === true;

    return {
      toolName,
      toolCallId: sharedToolCallId,
      content,
      details,
      isError
    };
  }

  return null;
}

function buildSharedThreadSnapshotPayload(
  thread: Awaited<ReturnType<typeof loadThreadOrThrow>>,
  messages: Array<Message & { parts: MessagePart[] }>,
  toolInvocations: ToolInvocation[]
): SharedThreadSnapshotPayload {
  try {
    const runIdMap = new Map<string, string>();
    const toolCallIdMap = new Map<string, string>();
    let sharedRunSeq = 1;
    let sharedToolCallSeq = 1;

    const getSharedRunId = (runId: string | null | undefined) => {
      if (!runId) {
        return null;
      }

      const existing = runIdMap.get(runId);
      if (existing) {
        return existing;
      }

      const next = `shared-run-${sharedRunSeq++}`;
      runIdMap.set(runId, next);
      return next;
    };

    const getSharedToolCallId = (toolCallId: string | null | undefined) => {
      if (!toolCallId) {
        return null;
      }

      const existing = toolCallIdMap.get(toolCallId);
      if (existing) {
        return existing;
      }

      const next = `shared-tool-call-${sharedToolCallSeq++}`;
      toolCallIdMap.set(toolCallId, next);
      return next;
    };

    const sharedMessages: SharedMessageSnapshot[] = messages.map((message, messageIndex) => {
      const sharedMessageId = `shared-message-${messageIndex + 1}`;
      const sharedRunId = getSharedRunId(message.runId);
      const parts: SharedMessagePartSnapshot[] = message.parts
        .slice()
        .sort((left, right) => left.partIndex - right.partIndex)
        .map((part, partIndex) => {
          const sharedPartId = `shared-part-${messageIndex + 1}-${partIndex + 1}`;
          const toolCallId =
            typeof part.jsonValue?.toolCallId === 'string'
              ? getSharedToolCallId(part.jsonValue.toolCallId)
              : null;

          const jsonValue =
            part.type === 'tool-call' || part.type === 'tool-result'
              ? sanitizeShareToolPartJson(part, toolCallId ?? `shared-tool-call-${sharedToolCallSeq++}`)
              : part.type === 'data' && part.jsonValue
                ? structuredClone(part.jsonValue)
                : null;

          return {
            id: sharedPartId,
            messageId: sharedMessageId,
            partIndex: part.partIndex,
            type: part.type,
            textValue: part.textValue ?? null,
            jsonValue,
            createdAt: part.createdAt.toISOString()
          };
        });

      return {
        id: sharedMessageId,
        runId: sharedRunId,
        role: message.role,
        seq: message.seq,
        createdAt: message.createdAt.toISOString(),
        parts
      };
    });

    const searchBundles = Object.fromEntries(
      toolInvocations
        .filter((invocation) => invocation.toolName === 'searchWeb')
        .map((invocation) => {
          const sharedToolCallId = getSharedToolCallId(invocation.toolCallId) ?? `shared-tool-call-${sharedToolCallSeq++}`;
          const bundle: SharedSearchBundle = {
            runId: getSharedRunId(invocation.runId),
            toolCallId: sharedToolCallId,
            toolName: invocation.toolName,
            status: invocation.status,
            input: invocation.input ? structuredClone(invocation.input) : null,
            output: invocation.output ? structuredClone(invocation.output) : null,
            error: invocation.error ?? null,
            startedAt: toIsoString(invocation.startedAt),
            finishedAt: toIsoString(invocation.finishedAt)
          };

          return [sharedToolCallId, bundle];
        })
    );

    return {
      payloadFormat: 'messages_v1',
      payloadVersion: 1,
      title: thread.title ?? null,
      messages: sharedMessages,
      searchBundles: Object.keys(searchBundles).length > 0 ? searchBundles : null
    };
  } catch (error) {
    throw new ShareSnapshotBuildError('failed to build share snapshot payload', { threadId: thread.id }, error);
  }
}

async function queueTextTurn(
  dependencies: AgentInfraAppDependencies,
  input: RunTextTurnInput,
  generateId: () => string,
  getNow: () => Date
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
      await repositories.threadRepo.touch(thread.id, getNow());
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
  const now = dependencies.now ?? (() => new Date());

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
      async rename(input) {
        const thread = await loadThreadOrThrow(dependencies.repositories, input.threadId);
        const title = trimThreadTitle(input.title);
        return dependencies.repositories.threadRepo.rename(thread.id, title, now());
      },
      async archive(input) {
        const thread = await loadThreadOrThrow(dependencies.repositories, input.threadId);
        if (thread.status === 'archived') {
          return thread;
        }

        const activeRun = await dependencies.repositories.runRepo.findLatestActiveByThread(thread.id);
        if (activeRun) {
          throw new ThreadHasActiveRunError(thread.id, activeRun.id);
        }

        return dependencies.repositories.threadRepo.archive(thread.id, now());
      },
      async getMessages(input) {
        await loadThreadOrThrow(dependencies.repositories, input.threadId);
        return dependencies.repositories.messageRepo.listByThread(input.threadId);
      },
      async getMessagesPage(input) {
        await loadThreadOrThrow(dependencies.repositories, input.threadId);
        return dependencies.repositories.messageRepo.listPageByThread(input.threadId, {
          limit: input.limit,
          beforeSeq: input.beforeSeq,
          afterSeq: input.afterSeq
        });
      }
    },
    turns: {
      async startText(input) {
        const queued = await queueTextTurn(dependencies, input, generateId, now);
        return {
          run: queued.run,
          userMessage: queued.userMessage,
          runtimeSelection: queued.runtimeSelection
        };
      },
      async runText(input) {
        const queued = await queueTextTurn(dependencies, input, generateId, now);
        const runId = queued.run.id;

        let executionError: string | undefined;
        try {
          await dependencies.runtime.runTextTurn(dependencies.repositories, {
            threadId: queued.thread.id,
            runId,
            provider: queued.runtimeSelection.provider,
            model: queued.runtimeSelection.model,
            thinkingEnabled: input.thinkingEnabled,
            reasoningEffort: input.reasoningEffort,
            webSearchEnabled: input.webSearchEnabled
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
      },
      async getActiveByThread(input) {
        await loadThreadOrThrow(dependencies.repositories, input.threadId);
        return dependencies.repositories.runRepo.findLatestActiveByThread(input.threadId);
      }
    },
    shares: {
      async createThreadSnapshot(input) {
        const shareId = generateId();
        const snapshotId = generateId();
        const publicId = generateId();
        let shareCreatedAt: Date | undefined;
        let snapshotCreatedAt: Date | undefined;
        let payload: SharedThreadSnapshotPayload | undefined;

        try {
          await dependencies.transaction(async (repositories) => {
            const thread = await loadThreadOrThrow(repositories, input.threadId);
            await repositories.threadRepo.touch(thread.id, now());

            const activeRun = await repositories.runRepo.findLatestActiveByThread(thread.id);
            if (activeRun) {
              throw new ThreadHasActiveRunError(thread.id, activeRun.id);
            }

            const existingActiveShare = await repositories.chatShareRepo.findActiveByThread(thread.id);
            if (existingActiveShare) {
              throw new ActiveChatShareExistsError(thread.id, existingActiveShare.publicId);
            }

            const messages = await repositories.messageRepo.listByThread(thread.id);
            const runIds = [
              ...new Set(messages.map((message) => message.runId).filter((runId): runId is string => typeof runId === 'string' && runId.length > 0))
            ];
            const toolInvocations = (await Promise.all(runIds.map((runId) => repositories.toolRepo.listByRun(runId)))).flat();

            payload = buildSharedThreadSnapshotPayload(thread, messages, toolInvocations);

            const share = await repositories.chatShareRepo.create({
              id: shareId,
              publicId,
              sourceThreadId: input.threadId,
              scopeType: 'thread',
              status: 'active',
              snapshotId,
              revokedAt: null
            });
            shareCreatedAt = share.createdAt;

            const snapshot = await repositories.chatShareSnapshotRepo.create({
              id: snapshotId,
              shareId,
              payloadFormat: 'messages_v1',
              payloadVersion: 1,
              payloadJson: toSnapshotPayloadJson(payload),
              messageCount: payload.messages.length,
              startSeq: payload.messages[0]?.seq ?? null,
              endSeq: payload.messages.at(-1)?.seq ?? null
            });
            snapshotCreatedAt = snapshot.createdAt;
          });
        } catch (error) {
          if (error instanceof AgentInfraAppError) {
            throw error;
          }

          throw new SharePersistenceError('failed to persist thread snapshot share', { threadId: input.threadId, shareId, snapshotId }, error);
        }

        if (!payload) {
          throw new SharePersistenceError('thread snapshot payload was not committed', { threadId: input.threadId, shareId, snapshotId });
        }

        return {
          share: {
            id: shareId,
            publicId,
            sourceThreadId: input.threadId,
            scopeType: 'thread',
            status: 'active',
            snapshotId,
            createdAt: shareCreatedAt ?? now(),
            revokedAt: null
          },
          snapshot: {
            id: snapshotId,
            shareId,
            payloadFormat: 'messages_v1',
            payloadVersion: 1,
            payloadJson: toSnapshotPayloadJson(payload),
            messageCount: payload.messages.length,
            startSeq: payload.messages[0]?.seq ?? null,
            endSeq: payload.messages.at(-1)?.seq ?? null,
            createdAt: snapshotCreatedAt ?? now()
          }
        };
      },
      async getCurrentByThread(input) {
        await loadThreadOrThrow(dependencies.repositories, input.threadId);
        return dependencies.repositories.chatShareRepo.findActiveByThread(input.threadId);
      },
      async getPublic(input): Promise<PublicChatShareResult> {
        const share = await loadShareByPublicIdOrThrow(dependencies.repositories, input.publicId);
        if (share.status === 'revoked') {
          throw new ChatShareRevokedError(input.publicId);
        }

        const snapshot = await dependencies.repositories.chatShareSnapshotRepo.findById(share.snapshotId);
        if (!snapshot || !snapshot.payloadJson) {
          throw new ChatShareNotFoundError(input.publicId);
        }

        return {
          share,
          snapshot: fromSnapshotPayloadJson(snapshot.payloadJson)
        };
      },
      async revoke(input) {
        const share = await loadShareByPublicIdOrThrow(dependencies.repositories, input.publicId);
        if (share.status === 'revoked') {
          return share;
        }

        return dependencies.repositories.chatShareRepo.updateStatus(share.id, 'revoked', {
          revokedAt: now()
        });
      }
    }
  };
}
