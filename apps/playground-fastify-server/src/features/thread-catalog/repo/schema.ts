import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sqliteTable, text as sqliteText, integer } from 'drizzle-orm/sqlite-core';
import type { DbConfig } from '@agent-infra/db';

import { APP_ID } from '../../../constants.js';
import { LOCAL_DEV_USER_ID } from '../identity/current-user.js';

export const playgroundThreadCatalogSqlite = sqliteTable('playground_thread_catalog', {
  threadId: sqliteText('thread_id').primaryKey(),
  appId: sqliteText('app_id').notNull(),
  ownerUserId: sqliteText('owner_user_id').notNull(),
  pinnedAt: integer('pinned_at', { mode: 'timestamp_ms' }),
  runtimeProvider: sqliteText('runtime_provider'),
  runtimeModel: sqliteText('runtime_model'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

export const playgroundThreadCatalogPg = pgTable('playground_thread_catalog', {
  threadId: text('thread_id').primaryKey(),
  appId: text('app_id').notNull(),
  ownerUserId: text('owner_user_id').notNull(),
  pinnedAt: timestamp('pinned_at', { withTimezone: true }),
  runtimeProvider: text('runtime_provider'),
  runtimeModel: text('runtime_model'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
});

const SQLITE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS playground_thread_catalog (
    thread_id text PRIMARY KEY NOT NULL,
    app_id text NOT NULL,
    owner_user_id text NOT NULL,
    pinned_at integer,
    runtime_provider text,
    runtime_model text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS playground_thread_catalog_app_owner_idx ON playground_thread_catalog (app_id, owner_user_id)',
  'CREATE INDEX IF NOT EXISTS playground_thread_catalog_app_owner_pinned_idx ON playground_thread_catalog (app_id, owner_user_id, pinned_at)'
];

const POSTGRES_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS playground_thread_catalog (
    thread_id text PRIMARY KEY,
    app_id text NOT NULL,
    owner_user_id text NOT NULL,
    pinned_at timestamptz,
    runtime_provider text,
    runtime_model text,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS playground_thread_catalog_app_owner_idx ON playground_thread_catalog (app_id, owner_user_id)',
  'CREATE INDEX IF NOT EXISTS playground_thread_catalog_app_owner_pinned_idx ON playground_thread_catalog (app_id, owner_user_id, pinned_at)'
];

const SQLITE_BACKFILL_STATEMENT = `
  INSERT INTO playground_thread_catalog (
    thread_id,
    app_id,
    owner_user_id,
    pinned_at,
    runtime_provider,
    runtime_model,
    created_at,
    updated_at
  )
  SELECT threads.id, threads.app_id, ?, NULL, NULL, NULL, threads.created_at, threads.updated_at
  FROM threads
  LEFT JOIN playground_thread_catalog catalog ON catalog.thread_id = threads.id
  WHERE threads.app_id = ? AND catalog.thread_id IS NULL
`;

const TURSO_BACKFILL_STATEMENT = `
  INSERT INTO playground_thread_catalog (
    thread_id,
    app_id,
    owner_user_id,
    pinned_at,
    runtime_provider,
    runtime_model,
    created_at,
    updated_at
  )
  SELECT threads.id, threads.app_id, '${LOCAL_DEV_USER_ID}', NULL, NULL, NULL, threads.created_at, threads.updated_at
  FROM threads
  LEFT JOIN playground_thread_catalog catalog ON catalog.thread_id = threads.id
  WHERE threads.app_id = '${APP_ID}' AND catalog.thread_id IS NULL
`;

const SQLITE_ALTER_STATEMENTS = [
  'ALTER TABLE playground_thread_catalog ADD COLUMN runtime_provider text',
  'ALTER TABLE playground_thread_catalog ADD COLUMN runtime_model text'
];

const POSTGRES_ALTER_STATEMENTS = [
  'ALTER TABLE playground_thread_catalog ADD COLUMN IF NOT EXISTS runtime_provider text',
  'ALTER TABLE playground_thread_catalog ADD COLUMN IF NOT EXISTS runtime_model text'
];

function isDuplicateColumnError(error: unknown) {
  return error instanceof Error && /duplicate column name/i.test(error.message);
}

export async function bootstrapPlaygroundThreadCatalog(dbConfig: DbConfig) {
  const statements = dbConfig.mode === 'postgres' ? POSTGRES_STATEMENTS : SQLITE_STATEMENTS;

  for (const statement of statements) {
    if (dbConfig.mode === 'sqlite') {
      dbConfig.db.$client.exec(statement);
      continue;
    }

    if (dbConfig.mode === 'turso') {
      await dbConfig.db.$client.execute(statement);
      continue;
    }

    await dbConfig.db.execute(sql.raw(statement));
  }

  const alterStatements = dbConfig.mode === 'postgres' ? POSTGRES_ALTER_STATEMENTS : SQLITE_ALTER_STATEMENTS;

  for (const statement of alterStatements) {
    try {
      if (dbConfig.mode === 'sqlite') {
        dbConfig.db.$client.exec(statement);
        continue;
      }

      if (dbConfig.mode === 'turso') {
        await dbConfig.db.$client.execute(statement);
        continue;
      }

      await dbConfig.db.execute(sql.raw(statement));
    } catch (error) {
      if (dbConfig.mode !== 'postgres' && isDuplicateColumnError(error)) {
        continue;
      }

      throw error;
    }
  }

  if (dbConfig.mode === 'sqlite') {
    dbConfig.db.$client.prepare(SQLITE_BACKFILL_STATEMENT).run(LOCAL_DEV_USER_ID, APP_ID);
    return;
  }

  if (dbConfig.mode === 'turso') {
    await dbConfig.db.$client.execute(TURSO_BACKFILL_STATEMENT);
    return;
  }

  await dbConfig.db.execute(sql`
    INSERT INTO playground_thread_catalog (
      thread_id,
      app_id,
      owner_user_id,
      pinned_at,
      runtime_provider,
      runtime_model,
      created_at,
      updated_at
    )
    SELECT threads.id, threads.app_id, ${LOCAL_DEV_USER_ID}, NULL, NULL, NULL, threads.created_at, threads.updated_at
    FROM threads
    LEFT JOIN playground_thread_catalog catalog ON catalog.thread_id = threads.id
    WHERE threads.app_id = ${APP_ID} AND catalog.thread_id IS NULL
  `);
}
