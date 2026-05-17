import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { index as sqliteIndex, integer, primaryKey as sqlitePrimaryKey, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core';
import type { DbConfig } from '@agent-infra/db';

import type { PlaygroundRunFeedbackReasonTag } from '../types/playground-run-feedback-details';

export const playgroundRunFeedbackDetailsSqlite = sqliteTable(
  'playground_run_feedback_details',
  {
    threadId: sqliteText('thread_id').notNull(),
    runId: sqliteText('run_id').notNull(),
    feedbackActorId: sqliteText('feedback_actor_id').notNull(),
    reasonTagsJson: sqliteText('reason_tags_json', { mode: 'json' }).$type<PlaygroundRunFeedbackReasonTag[]>().notNull(),
    commentText: sqliteText('comment_text'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    pk: sqlitePrimaryKey({ columns: [table.runId, table.feedbackActorId] }),
    threadRunIdx: sqliteIndex('playground_run_feedback_details_thread_run_idx').on(table.threadId, table.runId)
  })
);

export const playgroundRunFeedbackDetailsPg = pgTable(
  'playground_run_feedback_details',
  {
    threadId: text('thread_id').notNull(),
    runId: text('run_id').notNull(),
    feedbackActorId: text('feedback_actor_id').notNull(),
    reasonTagsJson: jsonb('reason_tags_json').$type<PlaygroundRunFeedbackReasonTag[]>().notNull(),
    commentText: text('comment_text'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.runId, table.feedbackActorId] }),
    threadRunIdx: index('playground_run_feedback_details_thread_run_idx').on(table.threadId, table.runId)
  })
);

export const PLAYGROUND_RUN_FEEDBACK_DETAILS_SQLITE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS playground_run_feedback_details (
    thread_id text NOT NULL REFERENCES threads(id),
    run_id text NOT NULL REFERENCES runs(id),
    feedback_actor_id text NOT NULL,
    reason_tags_json text NOT NULL,
    comment_text text,
    created_at integer NOT NULL,
    updated_at integer NOT NULL,
    PRIMARY KEY (run_id, feedback_actor_id)
  )`,
  'CREATE INDEX IF NOT EXISTS playground_run_feedback_details_thread_run_idx ON playground_run_feedback_details (thread_id, run_id)'
];

export const PLAYGROUND_RUN_FEEDBACK_DETAILS_POSTGRES_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS playground_run_feedback_details (
    thread_id text NOT NULL REFERENCES threads(id),
    run_id text NOT NULL REFERENCES runs(id),
    feedback_actor_id text NOT NULL,
    reason_tags_json jsonb NOT NULL,
    comment_text text,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    PRIMARY KEY (run_id, feedback_actor_id)
  )`,
  'CREATE INDEX IF NOT EXISTS playground_run_feedback_details_thread_run_idx ON playground_run_feedback_details (thread_id, run_id)'
];

export async function bootstrapPlaygroundRunFeedbackDetails(dbConfig: DbConfig) {
  const statements = dbConfig.mode === 'postgres'
    ? PLAYGROUND_RUN_FEEDBACK_DETAILS_POSTGRES_STATEMENTS
    : PLAYGROUND_RUN_FEEDBACK_DETAILS_SQLITE_STATEMENTS;

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
}
