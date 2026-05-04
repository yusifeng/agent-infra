import crypto from 'node:crypto';

import {
  createAgentInfraApp,
  type AgentInfraApp,
  type AgentInfraAppDependencies,
  type AgentInfraRuntimePort
} from '@agent-infra/app';
import {
  createAgentInfraRepositories,
  createAgentInfraTransaction,
  type AgentInfraRepositoryBundle,
  type DbConfig
} from '@agent-infra/db';

export type DurableChatDbInfo = {
  mode: DbConfig['mode'];
  connectionString: string;
};

export type DurableChatBaseServices = {
  dbConfig: DbConfig;
  dbInfo: DurableChatDbInfo;
  repos: AgentInfraRepositoryBundle;
  transaction: AgentInfraAppDependencies['transaction'];
};

export type DurableChatAppServices = DurableChatBaseServices & {
  app: AgentInfraApp;
};

export * from './api-dto.js';
export * from './chat-route-helpers.js';
export * from './route-errors.js';

export async function createDurableChatBaseServices(dbConfig: DbConfig): Promise<DurableChatBaseServices> {
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

export function createDurableChatAppServices(
  base: DurableChatBaseServices,
  runtime: AgentInfraRuntimePort,
  options: Pick<AgentInfraAppDependencies, 'idGenerator' | 'now'> = {}
): DurableChatAppServices {
  const appDependencies: AgentInfraAppDependencies = {
    repositories: base.repos,
    transaction: base.transaction,
    runtime,
    idGenerator: options.idGenerator ?? (() => crypto.randomUUID()),
    now: options.now ?? (() => new Date())
  };

  return {
    ...base,
    app: createAgentInfraApp(appDependencies)
  };
}
