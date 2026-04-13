import crypto from 'node:crypto';

import {
  createAgentInfraApp,
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

import type { PlaygroundDbInfo } from './playground-meta';

export type PlaygroundBaseServices = {
  dbConfig: DbConfig;
  dbInfo: PlaygroundDbInfo;
  repos: AgentInfraAppRepositories;
  transaction: AgentInfraAppDependencies['transaction'];
};

export type PlaygroundAppServices = PlaygroundBaseServices & {
  app: AgentInfraApp;
};

let playgroundBaseServicesPromise: Promise<PlaygroundBaseServices> | null = null;

function createRepositories(dbConfig: DbConfig, db: any): AgentInfraAppRepositories {
  if (dbConfig.mode === 'sqlite' || dbConfig.mode === 'turso') {
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

async function buildPlaygroundBaseServices(): Promise<PlaygroundBaseServices> {
  const dbConfig = createDbConfigFromEnv();
  await dbConfig.initialize();

  return {
    dbConfig,
    dbInfo: {
      mode: dbConfig.mode,
      connectionString: dbConfig.connectionString
    },
    repos: createRepositories(dbConfig, dbConfig.db),
    transaction: async (operation) =>
      withDbTransaction(dbConfig, async (tx: any) => {
        const transactionalRepos = createRepositories(dbConfig, tx);
        return operation(transactionalRepos);
      })
  };
}

export async function getPlaygroundBaseServices(): Promise<PlaygroundBaseServices> {
  if (!playgroundBaseServicesPromise) {
    playgroundBaseServicesPromise = buildPlaygroundBaseServices().catch((error) => {
      playgroundBaseServicesPromise = null;
      throw error;
    });
  }

  return playgroundBaseServicesPromise;
}

export function createPlaygroundAppServices(
  base: PlaygroundBaseServices,
  runtime: AgentInfraRuntimePort
): PlaygroundAppServices {
  const appDependencies: AgentInfraAppDependencies = {
    repositories: base.repos,
    transaction: base.transaction,
    runtime,
    idGenerator: () => crypto.randomUUID(),
    now: () => new Date()
  };

  return {
    ...base,
    app: createAgentInfraApp(appDependencies)
  };
}
