import crypto from 'node:crypto';

import {
  createAgentInfraApp,
  RuntimeSelectionError,
  RuntimeUnavailableError,
  type AgentInfraAppDependencies,
  type AgentInfraAppRepositories,
  type AgentInfraRuntimePort
} from '@agent-infra/app';
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
  SqliteToolInvocationRepository,
  withDbTransaction
} from '@agent-infra/db';
import { createDemoTools, createPiRuntime, listAvailableRuntimePiModelOptionsFromEnv, resolveRuntimePiConfigFromEnv, type RuntimePiInput } from '@agent-infra/runtime-pi';

const dbConfig = createDbConfigFromEnv();

export const dbReady = dbConfig.initialize();

function createRuntimePiRepositories(db: any): AgentInfraAppRepositories {
  if (dbConfig.mode === 'sqlite') {
    return {
      threadRepo: new SqliteThreadRepository(db),
      runRepo: new SqliteRunRepository(db),
      messageRepo: new SqliteMessageRepository(db),
      toolRepo: new SqliteToolInvocationRepository(db),
      runEventRepo: new SqliteRunEventRepository(db)
    };
  }

  return {
    threadRepo: new DrizzleThreadRepository(db),
    runRepo: new DrizzleRunRepository(db),
    messageRepo: new DrizzleMessageRepository(db),
    toolRepo: new DrizzleToolInvocationRepository(db),
    runEventRepo: new DrizzleRunEventRepository(db)
  };
}

function mapRuntimePiConfigError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown runtime-pi configuration error';

  if (
    message.includes('Unknown OpenAI model') ||
    message.includes('Unknown DeepSeek model') ||
    message.includes('Unsupported runtime-pi model selection') ||
    message.includes('could not infer a provider') ||
    message.includes('requires both provider and model')
  ) {
    return new RuntimeSelectionError(message, error);
  }

  return new RuntimeUnavailableError(message, error);
}

export const runtimePiRepos = createRuntimePiRepositories(dbConfig.db);

export const durableRuntime = createPiRuntime({
  tools: (context) => createDemoTools(context)
});

const runtimePiRuntime: AgentInfraRuntimePort = {
  async prepare(preferred) {
    try {
      return await durableRuntime.prepare(preferred);
    } catch (error) {
      throw mapRuntimePiConfigError(error);
    }
  },
  async runTextTurn(repositories, input) {
    await durableRuntime.runTurn(
      {
        runRepo: repositories.runRepo,
        messageRepo: repositories.messageRepo,
        toolRepo: repositories.toolRepo,
        runEventRepo: repositories.runEventRepo
      },
      input
    );
  }
};

const runtimePiAppDependencies: AgentInfraAppDependencies = {
  repositories: runtimePiRepos,
  transaction: async (operation) =>
    withDbTransaction(dbConfig, async (tx: any) => {
      const transactionalRepos = createRuntimePiRepositories(tx);
      return operation(transactionalRepos);
    }),
  runtime: runtimePiRuntime,
  idGenerator: () => crypto.randomUUID(),
  now: () => new Date()
};

export const runtimePiApp = createAgentInfraApp(runtimePiAppDependencies);

export function getRuntimePiMeta(preferred: Pick<RuntimePiInput, 'provider' | 'model'> = {}) {
  const modelOptions = listAvailableRuntimePiModelOptionsFromEnv();

  try {
    const runtime = resolveRuntimePiConfigFromEnv(preferred);
    return {
      configured: true,
      provider: runtime.provider,
      model: runtime.model,
      defaultModelKey: `${runtime.provider}:${runtime.model}`,
      modelOptions,
      configError: null
    };
  } catch (error) {
    return {
      configured: false,
      provider: modelOptions[0]?.provider ?? 'deepseek',
      model: modelOptions[0]?.model ?? 'deepseek-chat',
      defaultModelKey: modelOptions[0]?.key ?? null,
      modelOptions,
      configError: error instanceof Error ? error.message : 'Unknown runtime-pi configuration error'
    };
  }
}

export const runtimePiDbInfo = {
  mode: dbConfig.mode,
  connectionString: dbConfig.connectionString
};
