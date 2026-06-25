import path from 'node:path';

import {
  createAgentInfraRepositories,
  createAgentInfraTransaction,
  createSqliteDbConfig,
  type AgentInfraRepositoryBundle,
  type DbConfig
} from '@agent-infra/db';

import { readServerEnv } from './server-env';

let cachedDb:
  | {
      config: DbConfig;
      ready: Promise<void>;
      repositories: AgentInfraRepositoryBundle;
      transaction: ReturnType<typeof createAgentInfraTransaction>;
    }
  | null = null;

export function getCloudAgentDb() {
  if (!cachedDb) {
    const config = createSqliteDbConfig(resolveCloudAgentSqlitePath());
    cachedDb = {
      config,
      ready: config.bootstrapSchema(),
      repositories: createAgentInfraRepositories(config.mode, config.db),
      transaction: createAgentInfraTransaction(config)
    };
  }

  return cachedDb;
}

export async function getCloudAgentRepositories(): Promise<AgentInfraRepositoryBundle> {
  const db = getCloudAgentDb();
  await db.ready;
  return db.repositories;
}

export async function withCloudAgentTransaction<T>(operation: (repositories: AgentInfraRepositoryBundle) => Promise<T>): Promise<T> {
  const db = getCloudAgentDb();
  await db.ready;
  return db.transaction(operation);
}

function resolveCloudAgentSqlitePath(): string {
  const env = readServerEnv();
  const configuredPath = env.CLOUD_AGENT_SQLITE_PATH?.trim();
  if (configuredPath) {
    return path.resolve(/* turbopackIgnore: true */ configuredPath);
  }

  const configuredDataDir = env.CLOUD_AGENT_DATA_DIR?.trim();
  const dataDir = configuredDataDir
    ? path.resolve(/* turbopackIgnore: true */ configuredDataDir)
    : path.join(process.cwd(), '.cloud-agent-data');
  return path.join(dataDir, 'cloud-agent.db');
}
