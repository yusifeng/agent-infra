import crypto from 'node:crypto';

import {
  createAgentInfraApp,
  RuntimeSelectionError,
  RuntimeUnavailableError,
  type AgentInfraApp,
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
  type DbConfig,
  withDbTransaction
} from '@agent-infra/db';
import { createDemoTools, createPiRuntime, listAvailableRuntimePiModelOptionsFromEnv, resolveRuntimePiConfigFromEnv, type RuntimePiInput, type RuntimePiRuntime } from '@agent-infra/runtime-pi';

type PlaygroundDbInfo = {
  mode: string;
  connectionString: string;
};

type PlaygroundServices = {
  dbConfig: DbConfig;
  dbInfo: PlaygroundDbInfo;
  repos: AgentInfraAppRepositories;
  app: AgentInfraApp;
  durableRuntime: RuntimePiRuntime;
};

type PlaygroundMeta = {
  configured: boolean;
  provider: string;
  model: string;
  defaultModelKey: string | null;
  modelOptions: ReturnType<typeof listAvailableRuntimePiModelOptionsFromEnv>;
  configError: string | null;
};

let playgroundServicesPromise: Promise<PlaygroundServices> | null = null;

function createRepositories(dbConfig: DbConfig, db: any): AgentInfraAppRepositories {
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

async function buildPlaygroundServices(): Promise<PlaygroundServices> {
  const dbConfig = createDbConfigFromEnv();
  await dbConfig.initialize();

  const repos = createRepositories(dbConfig, dbConfig.db);
  const durableRuntime = createPiRuntime({
    tools: (context) => createDemoTools(context)
  });

  const runtimePort: AgentInfraRuntimePort = {
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

  const appDependencies: AgentInfraAppDependencies = {
    repositories: repos,
    transaction: async (operation) =>
      withDbTransaction(dbConfig, async (tx: any) => {
        const transactionalRepos = createRepositories(dbConfig, tx);
        return operation(transactionalRepos);
      }),
    runtime: runtimePort,
    idGenerator: () => crypto.randomUUID(),
    now: () => new Date()
  };

  return {
    dbConfig,
    dbInfo: {
      mode: dbConfig.mode,
      connectionString: dbConfig.connectionString
    },
    repos,
    app: createAgentInfraApp(appDependencies),
    durableRuntime
  };
}

export async function getPlaygroundServices(): Promise<PlaygroundServices> {
  if (!playgroundServicesPromise) {
    playgroundServicesPromise = buildPlaygroundServices().catch((error) => {
      playgroundServicesPromise = null;
      throw error;
    });
  }

  return playgroundServicesPromise;
}

export function getPlaygroundMeta(
  preferred: Pick<RuntimePiInput, 'provider' | 'model'> = {},
  dbInfo?: PlaygroundDbInfo
): PlaygroundMeta & { dbInfo: PlaygroundDbInfo } {
  const modelOptions = listAvailableRuntimePiModelOptionsFromEnv();
  const fallbackDbInfo = dbInfo ?? {
    mode: 'unavailable',
    connectionString: 'unavailable'
  };

  try {
    const runtime = resolveRuntimePiConfigFromEnv(preferred);
    return {
      configured: true,
      provider: runtime.provider,
      model: runtime.model,
      defaultModelKey: `${runtime.provider}:${runtime.model}`,
      modelOptions,
      configError: null,
      dbInfo: fallbackDbInfo
    };
  } catch (error) {
    return {
      configured: false,
      provider: modelOptions[0]?.provider ?? 'deepseek',
      model: modelOptions[0]?.model ?? 'deepseek-chat',
      defaultModelKey: modelOptions[0]?.key ?? null,
      modelOptions,
      configError: error instanceof Error ? error.message : 'Unknown runtime-pi configuration error',
      dbInfo: fallbackDbInfo
    };
  }
}
