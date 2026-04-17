import crypto from 'node:crypto';

import {
  createAgentInfraApp,
  type AgentInfraApp,
  type AgentInfraAppDependencies,
  type AgentInfraAppRepositories,
  type AgentInfraRuntimePort
} from '@agent-infra/app';
import {
  createAgentInfraRepositories,
  createAgentInfraTransaction,
  createDbConfigFromEnv,
  type DbConfig
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

async function buildPlaygroundBaseServices(): Promise<PlaygroundBaseServices> {
  const dbConfig = createDbConfigFromEnv();
  await dbConfig.initialize();
  const repos = createAgentInfraRepositories(dbConfig.mode, dbConfig.db);

  return {
    dbConfig,
    dbInfo: {
      mode: dbConfig.mode,
      connectionString: dbConfig.connectionString
    },
    repos,
    transaction: createAgentInfraTransaction(dbConfig)
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
