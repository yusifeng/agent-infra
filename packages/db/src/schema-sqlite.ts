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

export const datasets = sqliteTable(
  'datasets',
  {
    id: text('id').primaryKey(),
    appId: text('app_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    visibility: text('visibility').notNull(),
    metadata: text('metadata', { mode: 'json' }),
    createdByActorId: text('created_by_actor_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    appIdIdx: index('datasets_app_id_idx').on(table.appId)
  })
);

export const datasetExamples = sqliteTable(
  'dataset_examples',
  {
    id: text('id').primaryKey(),
    datasetId: text('dataset_id')
      .notNull()
      .references(() => datasets.id),
    sourceRunId: text('source_run_id'),
    sourceThreadId: text('source_thread_id'),
    triggerMessageId: text('trigger_message_id'),
    inputJson: text('input_json', { mode: 'json' }).notNull(),
    baselineOutputJson: text('baseline_output_json', { mode: 'json' }),
    expectedOutputJson: text('expected_output_json', { mode: 'json' }),
    metadataJson: text('metadata_json', { mode: 'json' }),
    contextSnapshotJson: text('context_snapshot_json', { mode: 'json' }),
    toolInvocationsSnapshotJson: text('tool_invocations_snapshot_json', { mode: 'json' }),
    createdByActorId: text('created_by_actor_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    datasetIdIdx: index('dataset_examples_dataset_id_idx').on(table.datasetId),
    sourceRunIdIdx: index('dataset_examples_source_run_id_idx').on(table.sourceRunId),
    sourceThreadIdIdx: index('dataset_examples_source_thread_id_idx').on(table.sourceThreadId),
    triggerMessageIdIdx: index('dataset_examples_trigger_message_id_idx').on(table.triggerMessageId)
  })
);

export const evalRuns = sqliteTable(
  'eval_runs',
  {
    id: text('id').primaryKey(),
    appId: text('app_id').notNull(),
    datasetId: text('dataset_id')
      .notNull()
      .references(() => datasets.id),
    status: text('status').notNull(),
    name: text('name'),
    configJson: text('config_json', { mode: 'json' }).notNull(),
    summaryJson: text('summary_json', { mode: 'json' }).notNull(),
    error: text('error'),
    createdByActorId: text('created_by_actor_id'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    appIdIdx: index('eval_runs_app_id_idx').on(table.appId),
    datasetIdIdx: index('eval_runs_dataset_id_idx').on(table.datasetId),
    statusIdx: index('eval_runs_status_idx').on(table.status)
  })
);

export const evalExampleResults = sqliteTable(
  'eval_example_results',
  {
    id: text('id').primaryKey(),
    evalRunId: text('eval_run_id')
      .notNull()
      .references(() => evalRuns.id),
    datasetExampleId: text('dataset_example_id')
      .notNull()
      .references(() => datasetExamples.id),
    exampleOrdinal: integer('example_ordinal').notNull(),
    status: text('status').notNull(),
    evalThreadId: text('eval_thread_id').references(() => threads.id),
    outputRunId: text('output_run_id').references(() => runs.id),
    expectedOutputJson: text('expected_output_json', { mode: 'json' }).notNull(),
    actualOutputJson: text('actual_output_json', { mode: 'json' }),
    inputJson: text('input_json', { mode: 'json' }),
    usageJson: text('usage_json', { mode: 'json' }),
    metadataJson: text('metadata_json', { mode: 'json' }),
    error: text('error'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    evalRunIdIdx: index('eval_example_results_eval_run_id_idx').on(table.evalRunId),
    datasetExampleIdIdx: index('eval_example_results_dataset_example_id_idx').on(table.datasetExampleId),
    statusIdx: index('eval_example_results_status_idx').on(table.status),
    exampleOrdinalIdx: index('eval_example_results_example_ordinal_idx').on(table.exampleOrdinal),
    evalRunDatasetExampleUnique: uniqueIndex('eval_example_results_eval_run_dataset_example_unique').on(
      table.evalRunId,
      table.datasetExampleId
    ),
    evalRunExampleOrdinalUnique: uniqueIndex('eval_example_results_eval_run_example_ordinal_unique').on(
      table.evalRunId,
      table.exampleOrdinal
    )
  })
);

export const evalRunCompareTriage = sqliteTable(
  'eval_run_compare_triage',
  {
    id: text('id').primaryKey(),
    appId: text('app_id').notNull(),
    datasetId: text('dataset_id')
      .notNull()
      .references(() => datasets.id),
    baselineEvalRunId: text('baseline_eval_run_id')
      .notNull()
      .references(() => evalRuns.id),
    candidateEvalRunId: text('candidate_eval_run_id')
      .notNull()
      .references(() => evalRuns.id),
    datasetExampleId: text('dataset_example_id')
      .notNull()
      .references(() => datasetExamples.id),
    triageStatus: text('triage_status').notNull(),
    reviewerNote: text('reviewer_note'),
    triagedByActorId: text('triaged_by_actor_id'),
    triagedAt: integer('triaged_at', { mode: 'timestamp_ms' }).notNull(),
    observedProjectionKind: text('observed_projection_kind').notNull(),
    observedProjectionSchemaVersion: integer('observed_projection_schema_version').notNull(),
    observedCompareStrategy: text('observed_compare_strategy'),
    observedOutcome: text('observed_outcome').notNull(),
    observedReason: text('observed_reason').notNull(),
    observedBaselineResultId: text('observed_baseline_result_id'),
    observedCandidateResultId: text('observed_candidate_result_id'),
    observedBaselineResultStatus: text('observed_baseline_result_status'),
    observedCandidateResultStatus: text('observed_candidate_result_status'),
    observedBaselineReviewStatus: text('observed_baseline_review_status'),
    observedCandidateReviewStatus: text('observed_candidate_review_status'),
    observedBaselineSignal: text('observed_baseline_signal'),
    observedCandidateSignal: text('observed_candidate_signal'),
    observedBaselineComparisonOutcome: text('observed_baseline_comparison_outcome'),
    observedCandidateComparisonOutcome: text('observed_candidate_comparison_outcome'),
    observedBaselineComparisonReason: text('observed_baseline_comparison_reason'),
    observedCandidateComparisonReason: text('observed_candidate_comparison_reason'),
    observedResultComparisonStrategy: text('observed_result_comparison_strategy'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    pairIdx: index('eval_run_compare_triage_pair_idx').on(table.baselineEvalRunId, table.candidateEvalRunId),
    appDatasetIdx: index('eval_run_compare_triage_app_dataset_idx').on(table.appId, table.datasetId),
    statusIdx: index('eval_run_compare_triage_status_idx').on(table.triageStatus),
    pairExampleUnique: uniqueIndex('eval_run_compare_triage_pair_example_unique').on(
      table.baselineEvalRunId,
      table.candidateEvalRunId,
      table.datasetExampleId
    )
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
  `CREATE TABLE IF NOT EXISTS datasets (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    visibility TEXT NOT NULL,
    metadata TEXT,
    created_by_actor_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS datasets_app_id_idx ON datasets(app_id)',
  `CREATE TABLE IF NOT EXISTS dataset_examples (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL REFERENCES datasets(id),
    source_run_id TEXT,
    source_thread_id TEXT,
    trigger_message_id TEXT,
    input_json TEXT NOT NULL,
    baseline_output_json TEXT,
    expected_output_json TEXT,
    metadata_json TEXT,
    context_snapshot_json TEXT,
    tool_invocations_snapshot_json TEXT,
    created_by_actor_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS dataset_examples_dataset_id_idx ON dataset_examples(dataset_id)',
  'CREATE INDEX IF NOT EXISTS dataset_examples_source_run_id_idx ON dataset_examples(source_run_id)',
  'CREATE INDEX IF NOT EXISTS dataset_examples_source_thread_id_idx ON dataset_examples(source_thread_id)',
  'CREATE INDEX IF NOT EXISTS dataset_examples_trigger_message_id_idx ON dataset_examples(trigger_message_id)',
  `CREATE TABLE IF NOT EXISTS eval_runs (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    dataset_id TEXT NOT NULL REFERENCES datasets(id),
    status TEXT NOT NULL,
    name TEXT,
    config_json TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    error TEXT,
    created_by_actor_id TEXT,
    started_at INTEGER,
    finished_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS eval_runs_app_id_idx ON eval_runs(app_id)',
  'CREATE INDEX IF NOT EXISTS eval_runs_dataset_id_idx ON eval_runs(dataset_id)',
  'CREATE INDEX IF NOT EXISTS eval_runs_status_idx ON eval_runs(status)',
  `CREATE TABLE IF NOT EXISTS eval_example_results (
    id TEXT PRIMARY KEY,
    eval_run_id TEXT NOT NULL REFERENCES eval_runs(id),
    dataset_example_id TEXT NOT NULL REFERENCES dataset_examples(id),
    example_ordinal INTEGER NOT NULL,
    status TEXT NOT NULL,
    eval_thread_id TEXT REFERENCES threads(id),
    output_run_id TEXT REFERENCES runs(id),
    expected_output_json TEXT NOT NULL,
    actual_output_json TEXT,
    input_json TEXT,
    usage_json TEXT,
    metadata_json TEXT,
    error TEXT,
    started_at INTEGER,
    finished_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS eval_example_results_eval_run_id_idx ON eval_example_results(eval_run_id)',
  'CREATE INDEX IF NOT EXISTS eval_example_results_dataset_example_id_idx ON eval_example_results(dataset_example_id)',
  'CREATE INDEX IF NOT EXISTS eval_example_results_status_idx ON eval_example_results(status)',
  'CREATE INDEX IF NOT EXISTS eval_example_results_example_ordinal_idx ON eval_example_results(example_ordinal)',
  'CREATE UNIQUE INDEX IF NOT EXISTS eval_example_results_eval_run_dataset_example_unique ON eval_example_results(eval_run_id, dataset_example_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS eval_example_results_eval_run_example_ordinal_unique ON eval_example_results(eval_run_id, example_ordinal)',
  `CREATE TABLE IF NOT EXISTS eval_run_compare_triage (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    dataset_id TEXT NOT NULL REFERENCES datasets(id),
    baseline_eval_run_id TEXT NOT NULL REFERENCES eval_runs(id),
    candidate_eval_run_id TEXT NOT NULL REFERENCES eval_runs(id),
    dataset_example_id TEXT NOT NULL REFERENCES dataset_examples(id),
    triage_status TEXT NOT NULL,
    reviewer_note TEXT,
    triaged_by_actor_id TEXT,
    triaged_at INTEGER NOT NULL,
    observed_projection_kind TEXT NOT NULL,
    observed_projection_schema_version INTEGER NOT NULL,
    observed_compare_strategy TEXT,
    observed_outcome TEXT NOT NULL,
    observed_reason TEXT NOT NULL,
    observed_baseline_result_id TEXT,
    observed_candidate_result_id TEXT,
    observed_baseline_result_status TEXT,
    observed_candidate_result_status TEXT,
    observed_baseline_review_status TEXT,
    observed_candidate_review_status TEXT,
    observed_baseline_signal TEXT,
    observed_candidate_signal TEXT,
    observed_baseline_comparison_outcome TEXT,
    observed_candidate_comparison_outcome TEXT,
    observed_baseline_comparison_reason TEXT,
    observed_candidate_comparison_reason TEXT,
    observed_result_comparison_strategy TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS eval_run_compare_triage_pair_idx ON eval_run_compare_triage(baseline_eval_run_id, candidate_eval_run_id)',
  'CREATE INDEX IF NOT EXISTS eval_run_compare_triage_app_dataset_idx ON eval_run_compare_triage(app_id, dataset_id)',
  'CREATE INDEX IF NOT EXISTS eval_run_compare_triage_status_idx ON eval_run_compare_triage(triage_status)',
  'CREATE UNIQUE INDEX IF NOT EXISTS eval_run_compare_triage_pair_example_unique ON eval_run_compare_triage(baseline_eval_run_id, candidate_eval_run_id, dataset_example_id)',
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
