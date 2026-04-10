import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePostgres } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { SQLITE_SCHEMA_STATEMENTS } from './schema-sqlite';

export type DbMode = 'sqlite' | 'postgres';

export interface DbConfig {
  mode: DbMode;
  db: any;
  connectionString: string;
  initialize: () => Promise<void>;
  sqlitePath?: string;
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

function ensureSqliteSchema(filePath: string) {
  const sqlite = new Database(filePath);
  sqlite.pragma('foreign_keys = ON');

  for (const statement of SQLITE_SCHEMA_STATEMENTS) {
    sqlite.exec(statement);
  }

  sqlite.close();
}

export function createDbConfigFromEnv(): DbConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const pool = new Pool({ connectionString: databaseUrl });
    return {
      mode: 'postgres',
      db: drizzlePostgres(pool),
      connectionString: databaseUrl,
      initialize: async () => {}
    };
  }

  const sqlitePath = path.resolve(process.cwd(), process.env.SQLITE_PATH ?? './local.db');
  const sqlite = new Database(sqlitePath);
  sqlite.pragma('foreign_keys = ON');

  return {
    mode: 'sqlite',
    db: drizzleSqlite(sqlite),
    connectionString: `file:${sqlitePath}`,
    sqlitePath,
    initialize: async () => {
      ensureSqliteSchema(sqlitePath);
    }
  };
}
