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
    initialize: async () => {
      ensureSqliteSchema(sqlitePath);
    }
  };
}
