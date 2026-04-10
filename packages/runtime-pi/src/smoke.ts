import crypto from 'node:crypto';

import {
  createDbConfigFromEnv,
  DrizzleMessageRepository,
  DrizzleRunEventRepository,
  DrizzleRunRepository,
  DrizzleThreadRepository,
  DrizzleToolInvocationRepository,
  SqliteMessageRepository,
  SqliteRunEventRepository,
  SqliteRunRepository,
  SqliteThreadRepository,
  SqliteToolInvocationRepository
} from '@agent-infra/db';

import { createPiRuntime, resolveRuntimePiConfigFromEnv } from './runtime';
import { createDemoTools } from './tools';

type RepoBundle = {
  threadRepo: DrizzleThreadRepository | SqliteThreadRepository;
  runRepo: DrizzleRunRepository | SqliteRunRepository;
  messageRepo: DrizzleMessageRepository | SqliteMessageRepository;
  toolRepo: DrizzleToolInvocationRepository | SqliteToolInvocationRepository;
  runEventRepo: DrizzleRunEventRepository | SqliteRunEventRepository;
};

function createRepos(): { repos: RepoBundle; dbMode: 'sqlite' | 'postgres'; connectionString: string; initialize: () => Promise<void> } {
  process.env.SQLITE_PATH ??= './runtime-pi-smoke.db';

  const dbConfig = createDbConfigFromEnv();

  const repos =
    dbConfig.mode === 'sqlite'
      ? {
          threadRepo: new SqliteThreadRepository(dbConfig.db),
          runRepo: new SqliteRunRepository(dbConfig.db),
          messageRepo: new SqliteMessageRepository(dbConfig.db),
          toolRepo: new SqliteToolInvocationRepository(dbConfig.db),
          runEventRepo: new SqliteRunEventRepository(dbConfig.db)
        }
      : {
          threadRepo: new DrizzleThreadRepository(dbConfig.db),
          runRepo: new DrizzleRunRepository(dbConfig.db),
          messageRepo: new DrizzleMessageRepository(dbConfig.db),
          toolRepo: new DrizzleToolInvocationRepository(dbConfig.db),
          runEventRepo: new DrizzleRunEventRepository(dbConfig.db)
        };

  return {
    repos,
    dbMode: dbConfig.mode,
    connectionString: dbConfig.connectionString,
    initialize: dbConfig.initialize
  };
}

function readPrompt(): string {
  const cliPrompt = process.argv.slice(2).join(' ').trim();
  if (cliPrompt) {
    return cliPrompt;
  }

  return (
    process.env.RUNTIME_PI_SMOKE_PROMPT?.trim() ||
    'Use getCurrentTime and getRuntimeInfo, then summarize the results in two short bullet points.'
  );
}

function formatMessageSummary(message: Awaited<ReturnType<RepoBundle['messageRepo']['listByThread']>>[number]) {
  return {
    id: message.id,
    role: message.role,
    status: message.status,
    seq: message.seq,
    parts: message.parts.map((part) => ({
      index: part.partIndex,
      type: part.type,
      text: part.textValue ?? undefined,
      json: part.jsonValue ?? undefined
    }))
  };
}

async function main() {
  const prompt = readPrompt();
  const { repos, dbMode, connectionString, initialize } = createRepos();
  const runtime = resolveRuntimePiConfigFromEnv();
  const piRuntime = createPiRuntime({
    tools: (context) => createDemoTools(context)
  });

  await initialize();

  const thread = await repos.threadRepo.create({
    id: crypto.randomUUID(),
    appId: 'runtime-pi-smoke',
    userId: null,
    title: process.env.RUNTIME_PI_SMOKE_TITLE?.trim() || 'runtime-pi smoke',
    status: 'active',
    metadata: {
      source: 'runtime-pi-smoke'
    },
    archivedAt: null
  });

  const userMessage = await repos.messageRepo.create({
    id: crypto.randomUUID(),
    threadId: thread.id,
    runId: null,
    role: 'user',
    seq: await repos.messageRepo.nextSeq(thread.id),
    status: 'completed',
    metadata: {
      source: 'runtime-pi-smoke'
    }
  });

  await repos.messageRepo.createPart({
    id: crypto.randomUUID(),
    messageId: userMessage.id,
    partIndex: 0,
    type: 'text',
    textValue: prompt,
    jsonValue: null
  });

  const run = await repos.runRepo.create({
    id: crypto.randomUUID(),
    threadId: thread.id,
    triggerMessageId: userMessage.id,
    provider: runtime.provider,
    model: runtime.model,
    status: 'queued',
    usage: null,
    error: null,
    startedAt: null,
    finishedAt: null
  });

  await piRuntime.runTurn(
    {
      runRepo: repos.runRepo,
      messageRepo: repos.messageRepo,
      toolRepo: repos.toolRepo,
      runEventRepo: repos.runEventRepo
    },
    {
      threadId: thread.id,
      runId: run.id,
      provider: runtime.provider,
      model: runtime.model
    }
  );

  const finalRun = await repos.runRepo.findById(run.id);
  const messages = await repos.messageRepo.listByThread(thread.id);
  const toolInvocations = await repos.toolRepo.listByRun(run.id);
  const runEvents = await repos.runEventRepo.listByRun(run.id);

  console.log(
    JSON.stringify(
      {
        smoke: {
          dbMode,
          connectionString,
          prompt,
          provider: runtime.provider,
          model: runtime.model
        },
        thread: {
          id: thread.id,
          title: thread.title
        },
        run: finalRun,
        messages: messages.map(formatMessageSummary),
        toolInvocations,
        runEvents: runEvents.map((event) => ({
          seq: event.seq,
          type: event.type,
          payload: event.payload
        }))
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
