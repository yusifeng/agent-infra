import { index, integer, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const threads = pgTable('threads', {
  id: text('id').primaryKey(),
  appId: text('app_id').notNull(),
  userId: text('user_id'),
  title: text('title'),
  status: text('status').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true })
});

export const runs = pgTable(
  'runs',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id),
    triggerMessageId: text('trigger_message_id'),
    provider: text('provider'),
    model: text('model'),
    status: text('status').notNull(),
    usageJson: jsonb('usage_json'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull()
  },
  (table) => ({
    threadIdIdx: index('runs_thread_id_idx').on(table.threadId)
  })
);

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id),
    runId: text('run_id').references(() => runs.id),
    role: text('role').notNull(),
    seq: integer('seq').notNull(),
    status: text('status').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull()
  },
  (table) => ({
    threadIdIdx: index('messages_thread_id_idx').on(table.threadId),
    threadSeqUnique: unique('messages_thread_id_seq_unique').on(table.threadId, table.seq)
  })
);

export const messageParts = pgTable(
  'message_parts',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id),
    partIndex: integer('part_index').notNull(),
    type: text('type').notNull(),
    textValue: text('text_value'),
    jsonValue: jsonb('json_value'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull()
  },
  (table) => ({
    messageIdIdx: index('message_parts_message_id_idx').on(table.messageId),
    messagePartIndexUnique: unique('message_parts_message_id_part_index_unique').on(table.messageId, table.partIndex)
  })
);

export const toolInvocations = pgTable(
  'tool_invocations',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id),
    toolName: text('tool_name').notNull(),
    toolCallId: text('tool_call_id').notNull(),
    status: text('status').notNull(),
    inputJson: jsonb('input_json'),
    outputJson: jsonb('output_json'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull()
  },
  (table) => ({
    runIdIdx: index('tool_invocations_run_id_idx').on(table.runId),
    threadIdIdx: index('tool_invocations_thread_id_idx').on(table.threadId)
  })
);

export const artifacts = pgTable('artifacts', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => threads.id),
  runId: text('run_id').references(() => runs.id),
  kind: text('kind').notNull(),
  uri: text('uri'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull()
});
