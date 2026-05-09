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
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

export const playgroundThreadCatalogPg = pgTable('playground_thread_catalog', {
  threadId: text('thread_id').primaryKey(),
  appId: text('app_id').notNull(),
  ownerUserId: text('owner_user_id').notNull(),
  pinnedAt: timestamp('pinned_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
});

const SQLITE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS playground_thread_catalog (
    thread_id text PRIMARY KEY NOT NULL,
    app_id text NOT NULL,
    owner_user_id text NOT NULL,
    pinned_at integer,
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
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS playground_thread_catalog_app_owner_idx ON playground_thread_catalog (app_id, owner_user_id)',
  'CREATE INDEX IF NOT EXISTS playground_thread_catalog_app_owner_pinned_idx ON playground_thread_catalog (app_id, owner_user_id, pinned_at)'
];

const SQLITE_BACKFILL_STATEMENT = `
  INSERT INTO playground_thread_catalog (thread_id, app_id, owner_user_id, pinned_at, created_at, updated_at)
  SELECT threads.id, threads.app_id, ?, NULL, threads.created_at, threads.updated_at
  FROM threads
  LEFT JOIN playground_thread_catalog catalog ON catalog.thread_id = threads.id
  WHERE threads.app_id = ? AND catalog.thread_id IS NULL
`;

export async function bootstrapPlaygroundThreadCatalog(dbConfig: DbConfig) {
  const statements = dbConfig.mode === 'postgres' ? POSTGRES_STATEMENTS : SQLITE_STATEMENTS;

  for (const statement of statements) {
    if (dbConfig.mode === 'sqlite') {
      dbConfig.db.$client.exec(statement);
      continue;
    }

    await dbConfig.db.execute(sql.raw(statement));
  }

  if (dbConfig.mode === 'sqlite') {
    dbConfig.db.$client.prepare(SQLITE_BACKFILL_STATEMENT).run(LOCAL_DEV_USER_ID, APP_ID);
    return;
  }

  await dbConfig.db.execute(sql`
    INSERT INTO playground_thread_catalog (thread_id, app_id, owner_user_id, pinned_at, created_at, updated_at)
    SELECT threads.id, threads.app_id, ${LOCAL_DEV_USER_ID}, NULL, threads.created_at, threads.updated_at
    FROM threads
    LEFT JOIN playground_thread_catalog catalog ON catalog.thread_id = threads.id
    WHERE threads.app_id = ${APP_ID} AND catalog.thread_id IS NULL
  `);
}
