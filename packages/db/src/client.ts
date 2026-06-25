import path from 'node:path';
import { createClient as createLibsqlClient } from '@libsql/client/http';
import Database from 'better-sqlite3';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzleLibsql } from 'drizzle-orm/libsql/http';
import { drizzle as drizzlePostgres } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type {
  AnswerCandidateRepository,
  AnswerSelectionRepository,
  AgentProfileRepository,
  ChatShareRepository,
  ChatShareSnapshotRepository,
  DatasetExampleRepository,
  DatasetRepository,
  EvalExampleResultRepository,
  EvalRunCompareTriageRepository,
  EvalRunRepository,
  MessageRepository,
  CloudAgentWorkerRepository,
  RunApprovalRequestRepository,
  RunFeedbackRepository,
  RunEventRepository,
  RunRepository,
  ThreadRepository,
  ToolInvocationRepository,
  WorkspaceChangeSetRepository,
  WorkspaceFileChangeRepository,
  WorkspaceFileIndexRepository,
  WorkspaceSecretRefRepository,
  WorkspaceRepository,
  ProviderSessionBindingRepository,
  ProviderTranscriptRepository
} from '@agent-infra/core';

import {
  DrizzleAnswerCandidateRepository,
  DrizzleAnswerSelectionRepository,
  DrizzleAgentProfileRepository,
  DrizzleChatShareRepository,
  DrizzleChatShareSnapshotRepository,
  DrizzleDatasetExampleRepository,
  DrizzleDatasetRepository,
  DrizzleEvalExampleResultRepository,
  DrizzleEvalRunCompareTriageRepository,
  DrizzleEvalRunRepository,
  DrizzleMessageRepository,
  DrizzleCloudAgentWorkerRepository,
  DrizzleRunApprovalRequestRepository,
  DrizzleRunFeedbackRepository,
  DrizzleRunEventRepository,
  DrizzleRunRepository,
  DrizzleThreadRepository,
  DrizzleToolInvocationRepository,
  DrizzleWorkspaceChangeSetRepository,
  DrizzleWorkspaceFileChangeRepository,
  DrizzleWorkspaceFileIndexRepository,
  DrizzleWorkspaceSecretRefRepository,
  DrizzleWorkspaceRepository,
  DrizzleProviderSessionBindingRepository,
  DrizzleProviderTranscriptRepository
} from './repositories.js';
import {
  SqliteAnswerCandidateRepository,
  SqliteAnswerSelectionRepository,
  SqliteAgentProfileRepository,
  SqliteChatShareRepository,
  SqliteChatShareSnapshotRepository,
  SqliteDatasetExampleRepository,
  SqliteDatasetRepository,
  SqliteEvalExampleResultRepository,
  SqliteEvalRunCompareTriageRepository,
  SqliteEvalRunRepository,
  SqliteMessageRepository,
  SqliteCloudAgentWorkerRepository,
  SqliteRunApprovalRequestRepository,
  SqliteRunFeedbackRepository,
  SqliteRunEventRepository,
  SqliteRunRepository,
  SqliteThreadRepository,
  SqliteToolInvocationRepository,
  SqliteWorkspaceChangeSetRepository,
  SqliteWorkspaceFileChangeRepository,
  SqliteWorkspaceFileIndexRepository,
  SqliteWorkspaceSecretRefRepository,
  SqliteWorkspaceRepository,
  SqliteProviderSessionBindingRepository,
  SqliteProviderTranscriptRepository
} from './repositories-sqlite.js';
import { SQLITE_SCHEMA_STATEMENTS } from './schema-sqlite.js';

export type DbMode = 'sqlite' | 'turso' | 'postgres';

export interface DbConfig {
  mode: DbMode;
  db: any;
  connectionString: string;
  bootstrapSchema: () => Promise<void>;
  sqlitePath?: string;
}

export interface AgentInfraRepositoryBundle {
  threadRepo: ThreadRepository;
  workspaceRepo: WorkspaceRepository;
  agentProfileRepo: AgentProfileRepository;
  workspaceSecretRefRepo: WorkspaceSecretRefRepository;
  workspaceFileIndexRepo: WorkspaceFileIndexRepository;
  workspaceChangeSetRepo: WorkspaceChangeSetRepository;
  workspaceFileChangeRepo: WorkspaceFileChangeRepository;
  runRepo: RunRepository;
  cloudAgentWorkerRepo: CloudAgentWorkerRepository;
  messageRepo: MessageRepository;
  toolRepo: ToolInvocationRepository;
  runEventRepo: RunEventRepository;
  runApprovalRequestRepo: RunApprovalRequestRepository;
  providerSessionBindingRepo: ProviderSessionBindingRepository;
  providerTranscriptRepo: ProviderTranscriptRepository;
  chatShareRepo: ChatShareRepository;
  chatShareSnapshotRepo: ChatShareSnapshotRepository;
  answerCandidateRepo: AnswerCandidateRepository;
  answerSelectionRepo: AnswerSelectionRepository;
  runFeedbackRepo: RunFeedbackRepository;
  datasetRepo: DatasetRepository;
  datasetExampleRepo: DatasetExampleRepository;
  evalRunRepo: EvalRunRepository;
  evalExampleResultRepo: EvalExampleResultRepository;
  evalRunCompareTriageRepo: EvalRunCompareTriageRepository;
}

const sqliteTransactionQueues = new Map<string, Promise<void>>();

const SQLITE_ADDITIVE_COLUMN_UPGRADES = [
  { table: 'runs', column: 'claim_owner', definition: 'TEXT' },
  { table: 'runs', column: 'claim_expires_at', definition: 'INTEGER' },
  { table: 'runs', column: 'next_attempt_at', definition: 'INTEGER' },
  { table: 'runs', column: 'attempt_count', definition: 'INTEGER NOT NULL DEFAULT 0' }
] as const;

async function withSerializedSqliteTransaction<T>(sqlitePath: string, operation: () => Promise<T>) {
  const pending = sqliteTransactionQueues.get(sqlitePath) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = pending.then(() => gate);
  sqliteTransactionQueues.set(sqlitePath, tail);

  await pending;
  try {
    return await operation();
  } finally {
    release?.();
    if (sqliteTransactionQueues.get(sqlitePath) === tail) {
      sqliteTransactionQueues.delete(sqlitePath);
    }
  }
}

export async function withDbTransaction<T>(config: DbConfig, operation: (db: any) => Promise<T>): Promise<T> {
  if (config.mode === 'sqlite') {
    if (!config.sqlitePath) {
      throw new Error('sqlite transactions require sqlitePath');
    }

    return withSerializedSqliteTransaction(config.sqlitePath, async () => {
      const sqlite = new Database(config.sqlitePath);
      sqlite.pragma('foreign_keys = ON');
      const txDb = drizzleSqlite(sqlite);

      try {
        sqlite.exec('BEGIN IMMEDIATE');
        const result = await operation(txDb);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          sqlite.exec('ROLLBACK');
        } catch {
          // Ignore rollback failures and surface the original error.
        }
        throw error;
      } finally {
        sqlite.close();
      }
    });
  }

  return config.db.transaction(async (tx: any) => operation(tx));
}

export function createAgentInfraRepositories(mode: DbMode, db: any): AgentInfraRepositoryBundle {
  if (mode === 'sqlite' || mode === 'turso') {
    return {
      threadRepo: new SqliteThreadRepository(db),
      workspaceRepo: new SqliteWorkspaceRepository(db),
      agentProfileRepo: new SqliteAgentProfileRepository(db),
      workspaceSecretRefRepo: new SqliteWorkspaceSecretRefRepository(db),
      workspaceFileIndexRepo: new SqliteWorkspaceFileIndexRepository(db),
      workspaceChangeSetRepo: new SqliteWorkspaceChangeSetRepository(db),
      workspaceFileChangeRepo: new SqliteWorkspaceFileChangeRepository(db),
      runRepo: new SqliteRunRepository(db),
      cloudAgentWorkerRepo: new SqliteCloudAgentWorkerRepository(db),
      messageRepo: new SqliteMessageRepository(db),
      toolRepo: new SqliteToolInvocationRepository(db),
      runEventRepo: new SqliteRunEventRepository(db),
      runApprovalRequestRepo: new SqliteRunApprovalRequestRepository(db),
      providerSessionBindingRepo: new SqliteProviderSessionBindingRepository(db),
      providerTranscriptRepo: new SqliteProviderTranscriptRepository(db),
      chatShareRepo: new SqliteChatShareRepository(db),
      chatShareSnapshotRepo: new SqliteChatShareSnapshotRepository(db),
      answerCandidateRepo: new SqliteAnswerCandidateRepository(db),
      answerSelectionRepo: new SqliteAnswerSelectionRepository(db),
      runFeedbackRepo: new SqliteRunFeedbackRepository(db),
      datasetRepo: new SqliteDatasetRepository(db),
      datasetExampleRepo: new SqliteDatasetExampleRepository(db),
      evalRunRepo: new SqliteEvalRunRepository(db),
      evalExampleResultRepo: new SqliteEvalExampleResultRepository(db),
      evalRunCompareTriageRepo: new SqliteEvalRunCompareTriageRepository(db)
    };
  }

  return {
    threadRepo: new DrizzleThreadRepository(db),
    workspaceRepo: new DrizzleWorkspaceRepository(db),
    agentProfileRepo: new DrizzleAgentProfileRepository(db),
    workspaceSecretRefRepo: new DrizzleWorkspaceSecretRefRepository(db),
    workspaceFileIndexRepo: new DrizzleWorkspaceFileIndexRepository(db),
    workspaceChangeSetRepo: new DrizzleWorkspaceChangeSetRepository(db),
    workspaceFileChangeRepo: new DrizzleWorkspaceFileChangeRepository(db),
    runRepo: new DrizzleRunRepository(db),
    cloudAgentWorkerRepo: new DrizzleCloudAgentWorkerRepository(db),
    messageRepo: new DrizzleMessageRepository(db),
    toolRepo: new DrizzleToolInvocationRepository(db),
    runEventRepo: new DrizzleRunEventRepository(db),
    runApprovalRequestRepo: new DrizzleRunApprovalRequestRepository(db),
    providerSessionBindingRepo: new DrizzleProviderSessionBindingRepository(db),
    providerTranscriptRepo: new DrizzleProviderTranscriptRepository(db),
    chatShareRepo: new DrizzleChatShareRepository(db),
    chatShareSnapshotRepo: new DrizzleChatShareSnapshotRepository(db),
    answerCandidateRepo: new DrizzleAnswerCandidateRepository(db),
    answerSelectionRepo: new DrizzleAnswerSelectionRepository(db),
    runFeedbackRepo: new DrizzleRunFeedbackRepository(db),
    datasetRepo: new DrizzleDatasetRepository(db),
    datasetExampleRepo: new DrizzleDatasetExampleRepository(db),
    evalRunRepo: new DrizzleEvalRunRepository(db),
    evalExampleResultRepo: new DrizzleEvalExampleResultRepository(db),
    evalRunCompareTriageRepo: new DrizzleEvalRunCompareTriageRepository(db)
  };
}

export function createAgentInfraTransaction(config: DbConfig) {
  return async <T>(operation: (repositories: AgentInfraRepositoryBundle) => Promise<T>): Promise<T> =>
    withDbTransaction(config, async (tx: any) => operation(createAgentInfraRepositories(config.mode, tx)));
}

function ensureSqliteSchema(filePath: string) {
  const sqlite = new Database(filePath);
  sqlite.pragma('foreign_keys = ON');

  for (const statement of SQLITE_SCHEMA_STATEMENTS) {
    sqlite.exec(statement);
    if (statement.startsWith('CREATE TABLE IF NOT EXISTS runs')) {
      ensureSqliteAdditiveColumns(sqlite);
    }
  }

  sqlite.close();
}

function ensureSqliteAdditiveColumns(sqlite: Database.Database) {
  for (const upgrade of SQLITE_ADDITIVE_COLUMN_UPGRADES) {
    const columns = sqlite.prepare(`PRAGMA table_info(${upgrade.table})`).all() as Array<{ name: string }>;
    if (columns.some((column) => column.name === upgrade.column)) {
      continue;
    }

    sqlite.exec(`ALTER TABLE ${upgrade.table} ADD COLUMN ${upgrade.column} ${upgrade.definition}`);
  }
}

export function createSqliteDbConfig(sqlitePath: string): DbConfig {
  const resolvedPath = path.resolve(/* turbopackIgnore: true */ sqlitePath);
  const sqlite = new Database(resolvedPath);
  sqlite.pragma('foreign_keys = ON');

  return {
    mode: 'sqlite',
    db: drizzleSqlite(sqlite),
    connectionString: `file:${resolvedPath}`,
    sqlitePath: resolvedPath,
    bootstrapSchema: async () => {
      ensureSqliteSchema(resolvedPath);
    }
  };
}

async function ensureTursoSchema(connectionString: string, authToken?: string) {
  const client = createLibsqlClient({
    url: connectionString,
    authToken
  });

  try {
    for (const statement of SQLITE_SCHEMA_STATEMENTS) {
      await client.execute(statement);
    }
  } finally {
    client.close();
  }
}

export function resolveDbModeOverrideFromEnv(): DbMode | null {
  const rawMode = process.env.PLAYGROUND_DB_MODE?.trim().toLowerCase();
  if (!rawMode) {
    return null;
  }

  if (rawMode === 'sqlite' || rawMode === 'turso' || rawMode === 'postgres') {
    return rawMode;
  }

  throw new Error(`unsupported PLAYGROUND_DB_MODE: ${process.env.PLAYGROUND_DB_MODE}`);
}

export function createDbConfigFromEnv(): DbConfig {
  const forcedMode = resolveDbModeOverrideFromEnv();
  const tursoDatabaseUrl = process.env.TURSO_DATABASE_URL;
  if (forcedMode === 'turso' || (!forcedMode && tursoDatabaseUrl)) {
    if (!tursoDatabaseUrl) {
      throw new Error('PLAYGROUND_DB_MODE=turso requires TURSO_DATABASE_URL');
    }

    const authToken = process.env.TURSO_AUTH_TOKEN;
    const client = createLibsqlClient({
      url: tursoDatabaseUrl,
      authToken
    });

    return {
      mode: 'turso',
      db: drizzleLibsql(client),
      connectionString: tursoDatabaseUrl,
      bootstrapSchema: async () => {
        await ensureTursoSchema(tursoDatabaseUrl, authToken);
      }
    };
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (forcedMode === 'postgres' || (!forcedMode && databaseUrl)) {
    if (!databaseUrl) {
      throw new Error('PLAYGROUND_DB_MODE=postgres requires DATABASE_URL');
    }

    const pool = new Pool({ connectionString: databaseUrl });
    return {
      mode: 'postgres',
      db: drizzlePostgres(pool),
      connectionString: databaseUrl,
      bootstrapSchema: async () => {}
    };
  }

  return createSqliteDbConfig(path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.SQLITE_PATH ?? './local.db'));
}
