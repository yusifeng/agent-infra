import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
    threadIdIdx: index('runs_thread_id_idx').on(table.threadId),
    threadTriggerMessageIdx: index('runs_thread_id_trigger_message_id_idx').on(table.threadId, table.triggerMessageId)
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

export const answerCandidates = sqliteTable(
  'answer_candidates',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id),
    triggerMessageId: text('trigger_message_id')
      .notNull()
      .references(() => messages.id),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id),
    ordinal: integer('ordinal').notNull(),
    kind: text('kind').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    runIdUnique: uniqueIndex('answer_candidates_run_id_unique').on(table.runId),
    threadTriggerOrdinalUnique: uniqueIndex('answer_candidates_thread_trigger_ordinal_unique').on(
      table.threadId,
      table.triggerMessageId,
      table.ordinal
    ),
    threadTriggerIdx: index('answer_candidates_thread_trigger_idx').on(table.threadId, table.triggerMessageId)
  })
);

export const answerSelections = sqliteTable(
  'answer_selections',
  {
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id),
    triggerMessageId: text('trigger_message_id')
      .notNull()
      .references(() => messages.id),
    selectedRunId: text('selected_run_id')
      .notNull()
      .references(() => runs.id),
    source: text('source').notNull(),
    selectedByUserId: text('selected_by_user_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.threadId, table.triggerMessageId] }),
    selectedRunIdx: index('answer_selections_selected_run_id_idx').on(table.selectedRunId)
  })
);

export const runFeedback = sqliteTable(
  'run_feedback',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id),
    triggerMessageId: text('trigger_message_id')
      .notNull()
      .references(() => messages.id),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id),
    feedbackActorId: text('feedback_actor_id').notNull(),
    value: text('value').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    runActorUnique: uniqueIndex('run_feedback_run_actor_unique').on(table.runId, table.feedbackActorId),
    threadTriggerIdx: index('run_feedback_thread_trigger_idx').on(table.threadId, table.triggerMessageId)
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

export const runEvents = sqliteTable(
  'run_events',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id),
    seq: integer('seq').notNull(),
    type: text('type').notNull(),
    payloadJson: text('payload_json', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    runIdIdx: index('run_events_run_id_idx').on(table.runId),
    threadIdIdx: index('run_events_thread_id_idx').on(table.threadId),
    runSeqUnique: uniqueIndex('run_events_run_id_seq_unique').on(table.runId, table.seq)
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

export const chatShares = sqliteTable(
  'chat_shares',
  {
    id: text('id').primaryKey(),
    publicId: text('public_id').notNull(),
    sourceThreadId: text('source_thread_id')
      .notNull()
      .references(() => threads.id),
    scopeType: text('scope_type').notNull(),
    status: text('status').notNull(),
    snapshotId: text('snapshot_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' })
  },
  (table) => ({
    publicIdUnique: uniqueIndex('chat_shares_public_id_unique').on(table.publicId),
    sourceThreadIdx: index('chat_shares_source_thread_id_idx').on(table.sourceThreadId),
    statusIdx: index('chat_shares_status_idx').on(table.status)
  })
);

export const chatShareSnapshots = sqliteTable(
  'chat_share_snapshots',
  {
    id: text('id').primaryKey(),
    shareId: text('share_id')
      .notNull()
      .references(() => chatShares.id),
    payloadFormat: text('payload_format').notNull(),
    payloadVersion: integer('payload_version').notNull(),
    payloadJson: text('payload_json', { mode: 'json' }),
    messageCount: integer('message_count').notNull(),
    startSeq: integer('start_seq'),
    endSeq: integer('end_seq'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    shareIdIdx: index('chat_share_snapshots_share_id_idx').on(table.shareId)
  })
);


export const SQLITE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    user_id TEXT,
    title TEXT,
    status TEXT NOT NULL,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    archived_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS runs (
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
  )`,
  'CREATE INDEX IF NOT EXISTS runs_thread_id_idx ON runs(thread_id)',
  'CREATE INDEX IF NOT EXISTS runs_thread_id_trigger_message_id_idx ON runs(thread_id, trigger_message_id)',
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES threads(id),
    run_id TEXT REFERENCES runs(id),
    role TEXT NOT NULL,
    seq INTEGER NOT NULL,
    status TEXT NOT NULL,
    metadata TEXT,
    created_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS messages_thread_id_idx ON messages(thread_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS messages_thread_id_seq_unique ON messages(thread_id, seq)',
  `CREATE TABLE IF NOT EXISTS answer_candidates (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES threads(id),
    trigger_message_id TEXT NOT NULL REFERENCES messages(id),
    run_id TEXT NOT NULL REFERENCES runs(id),
    ordinal INTEGER NOT NULL,
    kind TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS answer_candidates_run_id_unique ON answer_candidates(run_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS answer_candidates_thread_trigger_ordinal_unique ON answer_candidates(thread_id, trigger_message_id, ordinal)',
  'CREATE INDEX IF NOT EXISTS answer_candidates_thread_trigger_idx ON answer_candidates(thread_id, trigger_message_id)',
  `CREATE TABLE IF NOT EXISTS answer_selections (
    thread_id TEXT NOT NULL REFERENCES threads(id),
    trigger_message_id TEXT NOT NULL REFERENCES messages(id),
    selected_run_id TEXT NOT NULL REFERENCES runs(id),
    source TEXT NOT NULL,
    selected_by_user_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (thread_id, trigger_message_id)
  )`,
  'CREATE INDEX IF NOT EXISTS answer_selections_selected_run_id_idx ON answer_selections(selected_run_id)',
  `CREATE TABLE IF NOT EXISTS run_feedback (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES threads(id),
    trigger_message_id TEXT NOT NULL REFERENCES messages(id),
    run_id TEXT NOT NULL REFERENCES runs(id),
    feedback_actor_id TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS run_feedback_run_actor_unique ON run_feedback(run_id, feedback_actor_id)',
  'CREATE INDEX IF NOT EXISTS run_feedback_thread_trigger_idx ON run_feedback(thread_id, trigger_message_id)',
  `CREATE TABLE IF NOT EXISTS message_parts (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id),
    part_index INTEGER NOT NULL,
    type TEXT NOT NULL,
    text_value TEXT,
    json_value TEXT,
    created_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS message_parts_message_id_idx ON message_parts(message_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS message_parts_message_id_part_index_unique ON message_parts(message_id, part_index)',
  `CREATE TABLE IF NOT EXISTS tool_invocations (
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
  )`,
  'CREATE INDEX IF NOT EXISTS tool_invocations_run_id_idx ON tool_invocations(run_id)',
  'CREATE INDEX IF NOT EXISTS tool_invocations_thread_id_idx ON tool_invocations(thread_id)',
  `CREATE TABLE IF NOT EXISTS run_events (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES threads(id),
    run_id TEXT NOT NULL REFERENCES runs(id),
    seq INTEGER NOT NULL,
    type TEXT NOT NULL,
    payload_json TEXT,
    created_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS run_events_run_id_idx ON run_events(run_id)',
  'CREATE INDEX IF NOT EXISTS run_events_thread_id_idx ON run_events(thread_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS run_events_run_id_seq_unique ON run_events(run_id, seq)',
  `CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES threads(id),
    run_id TEXT REFERENCES runs(id),
    kind TEXT NOT NULL,
    uri TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS chat_shares (
    id TEXT PRIMARY KEY,
    public_id TEXT NOT NULL,
    source_thread_id TEXT NOT NULL REFERENCES threads(id),
    scope_type TEXT NOT NULL,
    status TEXT NOT NULL,
    snapshot_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    revoked_at INTEGER
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS chat_shares_public_id_unique ON chat_shares(public_id)',
  'CREATE INDEX IF NOT EXISTS chat_shares_source_thread_id_idx ON chat_shares(source_thread_id)',
  'CREATE INDEX IF NOT EXISTS chat_shares_status_idx ON chat_shares(status)',
  `CREATE TABLE IF NOT EXISTS chat_share_snapshots (
    id TEXT PRIMARY KEY,
    share_id TEXT NOT NULL REFERENCES chat_shares(id),
    payload_format TEXT NOT NULL,
    payload_version INTEGER NOT NULL,
    payload_json TEXT,
    message_count INTEGER NOT NULL,
    start_seq INTEGER,
    end_seq INTEGER,
    created_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS chat_share_snapshots_share_id_idx ON chat_share_snapshots(share_id)'
] as const;
