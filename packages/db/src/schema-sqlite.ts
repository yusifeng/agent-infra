import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const threads = sqliteTable('threads', {
  id: text('id').primaryKey(),
  appId: text('app_id').notNull(),
  userId: text('user_id'),
  title: text('title'),
  status: text('status').notNull(),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  archivedAt: integer('archived_at', { mode: 'timestamp_ms' })
});

export const runs = sqliteTable(
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
    usageJson: text('usage_json', { mode: 'json' }),
    error: text('error'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    threadIdIdx: index('runs_thread_id_idx').on(table.threadId)
  })
);

export const messages = sqliteTable(
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
    metadata: text('metadata', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    threadIdIdx: index('messages_thread_id_idx').on(table.threadId),
    threadSeqUnique: uniqueIndex('messages_thread_id_seq_unique').on(table.threadId, table.seq)
  })
);

export const messageParts = sqliteTable(
  'message_parts',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id),
    partIndex: integer('part_index').notNull(),
    type: text('type').notNull(),
    textValue: text('text_value'),
    jsonValue: text('json_value', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    messageIdIdx: index('message_parts_message_id_idx').on(table.messageId),
    messagePartIndexUnique: uniqueIndex('message_parts_message_id_part_index_unique').on(table.messageId, table.partIndex)
  })
);

export const toolInvocations = sqliteTable(
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
    inputJson: text('input_json', { mode: 'json' }),
    outputJson: text('output_json', { mode: 'json' }),
    error: text('error'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    runIdIdx: index('tool_invocations_run_id_idx').on(table.runId),
    threadIdIdx: index('tool_invocations_thread_id_idx').on(table.threadId)
  })
);

export const artifacts = sqliteTable('artifacts', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => threads.id),
  runId: text('run_id').references(() => runs.id),
  kind: text('kind').notNull(),
  uri: text('uri'),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
});
