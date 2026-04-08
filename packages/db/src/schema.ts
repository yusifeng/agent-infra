import { jsonb, pgTable, text, timestamp, integer } from 'drizzle-orm/pg-core';

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

export const runs = pgTable('runs', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull(),
  triggerMessageId: text('trigger_message_id'),
  provider: text('provider'),
  model: text('model'),
  status: text('status').notNull(),
  usageJson: jsonb('usage_json'),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull()
});

export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull(),
  runId: text('run_id'),
  role: text('role').notNull(),
  seq: integer('seq').notNull(),
  status: text('status').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull()
});

export const messageParts = pgTable('message_parts', {
  id: text('id').primaryKey(),
  messageId: text('message_id').notNull(),
  partIndex: integer('part_index').notNull(),
  type: text('type').notNull(),
  textValue: text('text_value'),
  jsonValue: jsonb('json_value'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull()
});

export const toolInvocations = pgTable('tool_invocations', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull(),
  runId: text('run_id').notNull(),
  messageId: text('message_id').notNull(),
  toolName: text('tool_name').notNull(),
  toolCallId: text('tool_call_id').notNull(),
  status: text('status').notNull(),
  inputJson: jsonb('input_json'),
  outputJson: jsonb('output_json'),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull()
});

export const artifacts = pgTable('artifacts', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull(),
  runId: text('run_id'),
  kind: text('kind').notNull(),
  uri: text('uri'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull()
});
