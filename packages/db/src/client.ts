import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePostgres } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

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
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  user_id TEXT,
  title TEXT,
  status TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  trigger_message_id TEXT,
  provider TEXT,
  model TEXT,
  status TEXT NOT NULL,
  usage_json TEXT,
  error TEXT,
  started_at INTEGER,
  finished_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_thread_id_idx ON runs(thread_id);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  run_id TEXT REFERENCES runs(id),
  role TEXT NOT NULL,
  seq INTEGER NOT NULL,
  status TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_thread_id_idx ON messages(thread_id);
CREATE UNIQUE INDEX IF NOT EXISTS messages_thread_id_seq_unique ON messages(thread_id, seq);
CREATE TABLE IF NOT EXISTS message_parts (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id),
  part_index INTEGER NOT NULL,
  type TEXT NOT NULL,
  text_value TEXT,
  json_value TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS message_parts_message_id_idx ON message_parts(message_id);
CREATE UNIQUE INDEX IF NOT EXISTS message_parts_message_id_part_index_unique ON message_parts(message_id, part_index);
CREATE TABLE IF NOT EXISTS tool_invocations (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  run_id TEXT NOT NULL REFERENCES runs(id),
  message_id TEXT NOT NULL REFERENCES messages(id),
  tool_name TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  status TEXT NOT NULL,
  input_json TEXT,
  output_json TEXT,
  error TEXT,
  started_at INTEGER,
  finished_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tool_invocations_run_id_idx ON tool_invocations(run_id);
CREATE INDEX IF NOT EXISTS tool_invocations_thread_id_idx ON tool_invocations(thread_id);
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  run_id TEXT REFERENCES runs(id),
  kind TEXT NOT NULL,
  uri TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);
`);
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
