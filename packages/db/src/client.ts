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
  ChatShareRepository,
  ChatShareSnapshotRepository,
  MessageRepository,
  RunFeedbackRepository,
  RunEventRepository,
  RunRepository,
  ThreadRepository,
  ToolInvocationRepository
} from '@agent-infra/core';

import {
  DrizzleAnswerCandidateRepository,
  DrizzleAnswerSelectionRepository,
  DrizzleChatShareRepository,
  DrizzleChatShareSnapshotRepository,
  DrizzleMessageRepository,
  DrizzleRunFeedbackRepository,
  DrizzleRunEventRepository,
  DrizzleRunRepository,
  DrizzleThreadRepository,
  DrizzleToolInvocationRepository
} from './repositories.js';
import {
  SqliteAnswerCandidateRepository,
  SqliteAnswerSelectionRepository,
  SqliteChatShareRepository,
  SqliteChatShareSnapshotRepository,
  SqliteMessageRepository,
  SqliteRunFeedbackRepository,
  SqliteRunEventRepository,
  SqliteRunRepository,
  SqliteThreadRepository,
  SqliteToolInvocationRepository
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
  runRepo: RunRepository;
  messageRepo: MessageRepository;
  toolRepo: ToolInvocationRepository;
  runEventRepo: RunEventRepository;
  chatShareRepo: ChatShareRepository;
  chatShareSnapshotRepo: ChatShareSnapshotRepository;
  answerCandidateRepo: AnswerCandidateRepository;
  answerSelectionRepo: AnswerSelectionRepository;
  runFeedbackRepo: RunFeedbackRepository;
}

const sqliteTransactionQueues = new Map<string, Promise<void>>();

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
      runRepo: new SqliteRunRepository(db),
      messageRepo: new SqliteMessageRepository(db),
      toolRepo: new SqliteToolInvocationRepository(db),
      runEventRepo: new SqliteRunEventRepository(db),
      chatShareRepo: new SqliteChatShareRepository(db),
      chatShareSnapshotRepo: new SqliteChatShareSnapshotRepository(db),
      answerCandidateRepo: new SqliteAnswerCandidateRepository(db),
      answerSelectionRepo: new SqliteAnswerSelectionRepository(db),
      runFeedbackRepo: new SqliteRunFeedbackRepository(db)
    };
  }

  return {
    threadRepo: new DrizzleThreadRepository(db),
    runRepo: new DrizzleRunRepository(db),
    messageRepo: new DrizzleMessageRepository(db),
    toolRepo: new DrizzleToolInvocationRepository(db),
    runEventRepo: new DrizzleRunEventRepository(db),
    chatShareRepo: new DrizzleChatShareRepository(db),
    chatShareSnapshotRepo: new DrizzleChatShareSnapshotRepository(db),
    answerCandidateRepo: new DrizzleAnswerCandidateRepository(db),
    answerSelectionRepo: new DrizzleAnswerSelectionRepository(db),
    runFeedbackRepo: new DrizzleRunFeedbackRepository(db)
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
  }

  sqlite.close();
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

  const sqlitePath = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.SQLITE_PATH ?? './local.db');
  const sqlite = new Database(sqlitePath);
  sqlite.pragma('foreign_keys = ON');

  return {
    mode: 'sqlite',
    db: drizzleSqlite(sqlite),
    connectionString: `file:${sqlitePath}`,
    sqlitePath,
    bootstrapSchema: async () => {
      ensureSqliteSchema(sqlitePath);
    }
  };
}
