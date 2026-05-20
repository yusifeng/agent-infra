import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core';

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
    threadIdIdx: index('runs_thread_id_idx').on(table.threadId),
    threadTriggerMessageIdx: index('runs_thread_id_trigger_message_id_idx').on(table.threadId, table.triggerMessageId)
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

export const answerCandidates = pgTable(
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull()
  },
  (table) => ({
    runIdUnique: unique('answer_candidates_run_id_unique').on(table.runId),
    threadTriggerOrdinalUnique: unique('answer_candidates_thread_trigger_ordinal_unique').on(
      table.threadId,
      table.triggerMessageId,
      table.ordinal
    ),
    threadTriggerIdx: index('answer_candidates_thread_trigger_idx').on(table.threadId, table.triggerMessageId)
  })
);

export const answerSelections = pgTable(
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.threadId, table.triggerMessageId] }),
    selectedRunIdx: index('answer_selections_selected_run_id_idx').on(table.selectedRunId)
  })
);

export const runFeedback = pgTable(
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
  },
  (table) => ({
    runActorUnique: unique('run_feedback_run_actor_unique').on(table.runId, table.feedbackActorId),
    threadTriggerIdx: index('run_feedback_thread_trigger_idx').on(table.threadId, table.triggerMessageId)
  })
);

export const datasets = pgTable(
  'datasets',
  {
    id: text('id').primaryKey(),
    appId: text('app_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    visibility: text('visibility').notNull(),
    metadata: jsonb('metadata'),
    createdByActorId: text('created_by_actor_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
  },
  (table) => ({
    appIdIdx: index('datasets_app_id_idx').on(table.appId)
  })
);

export const datasetExamples = pgTable(
  'dataset_examples',
  {
    id: text('id').primaryKey(),
    datasetId: text('dataset_id')
      .notNull()
      .references(() => datasets.id),
    sourceRunId: text('source_run_id'),
    sourceThreadId: text('source_thread_id'),
    triggerMessageId: text('trigger_message_id'),
    inputJson: jsonb('input_json').notNull(),
    baselineOutputJson: jsonb('baseline_output_json'),
    expectedOutputJson: jsonb('expected_output_json'),
    metadataJson: jsonb('metadata_json'),
    contextSnapshotJson: jsonb('context_snapshot_json'),
    toolInvocationsSnapshotJson: jsonb('tool_invocations_snapshot_json'),
    createdByActorId: text('created_by_actor_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
  },
  (table) => ({
    datasetIdIdx: index('dataset_examples_dataset_id_idx').on(table.datasetId),
    sourceRunIdIdx: index('dataset_examples_source_run_id_idx').on(table.sourceRunId),
    sourceThreadIdIdx: index('dataset_examples_source_thread_id_idx').on(table.sourceThreadId),
    triggerMessageIdIdx: index('dataset_examples_trigger_message_id_idx').on(table.triggerMessageId)
  })
);

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: text('id').primaryKey(),
    appId: text('app_id').notNull(),
    datasetId: text('dataset_id')
      .notNull()
      .references(() => datasets.id),
    status: text('status').notNull(),
    name: text('name'),
    configJson: jsonb('config_json').notNull(),
    summaryJson: jsonb('summary_json').notNull(),
    error: text('error'),
    createdByActorId: text('created_by_actor_id'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
  },
  (table) => ({
    appIdIdx: index('eval_runs_app_id_idx').on(table.appId),
    datasetIdIdx: index('eval_runs_dataset_id_idx').on(table.datasetId),
    statusIdx: index('eval_runs_status_idx').on(table.status)
  })
);

export const evalExampleResults = pgTable(
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
    expectedOutputJson: jsonb('expected_output_json').notNull(),
    actualOutputJson: jsonb('actual_output_json'),
    inputJson: jsonb('input_json'),
    usageJson: jsonb('usage_json'),
    metadataJson: jsonb('metadata_json'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
  },
  (table) => ({
    evalRunIdIdx: index('eval_example_results_eval_run_id_idx').on(table.evalRunId),
    datasetExampleIdIdx: index('eval_example_results_dataset_example_id_idx').on(table.datasetExampleId),
    statusIdx: index('eval_example_results_status_idx').on(table.status),
    exampleOrdinalIdx: index('eval_example_results_example_ordinal_idx').on(table.exampleOrdinal),
    evalRunDatasetExampleUnique: unique('eval_example_results_eval_run_dataset_example_unique').on(
      table.evalRunId,
      table.datasetExampleId
    ),
    evalRunExampleOrdinalUnique: unique('eval_example_results_eval_run_example_ordinal_unique').on(
      table.evalRunId,
      table.exampleOrdinal
    )
  })
);

export const evalRunCompareTriage = pgTable(
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
    triagedAt: timestamp('triaged_at', { withTimezone: true }).notNull(),
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull()
  },
  (table) => ({
    pairIdx: index('eval_run_compare_triage_pair_idx').on(table.baselineEvalRunId, table.candidateEvalRunId),
    appDatasetIdx: index('eval_run_compare_triage_app_dataset_idx').on(table.appId, table.datasetId),
    statusIdx: index('eval_run_compare_triage_status_idx').on(table.triageStatus),
    pairExampleUnique: unique('eval_run_compare_triage_pair_example_unique').on(
      table.baselineEvalRunId,
      table.candidateEvalRunId,
      table.datasetExampleId
    )
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

export const runEvents = pgTable(
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
    payloadJson: jsonb('payload_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull()
  },
  (table) => ({
    runIdIdx: index('run_events_run_id_idx').on(table.runId),
    threadIdIdx: index('run_events_thread_id_idx').on(table.threadId),
    runSeqUnique: unique('run_events_run_id_seq_unique').on(table.runId, table.seq)
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

export const chatShares = pgTable(
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true })
  },
  (table) => ({
    publicIdUnique: unique('chat_shares_public_id_unique').on(table.publicId),
    sourceThreadIdx: index('chat_shares_source_thread_id_idx').on(table.sourceThreadId),
    statusIdx: index('chat_shares_status_idx').on(table.status)
  })
);

export const chatShareSnapshots = pgTable(
  'chat_share_snapshots',
  {
    id: text('id').primaryKey(),
    shareId: text('share_id')
      .notNull()
      .references(() => chatShares.id),
    payloadFormat: text('payload_format').notNull(),
    payloadVersion: integer('payload_version').notNull(),
    payloadJson: jsonb('payload_json'),
    messageCount: integer('message_count').notNull(),
    startSeq: integer('start_seq'),
    endSeq: integer('end_seq'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull()
  },
  (table) => ({
    shareIdIdx: index('chat_share_snapshots_share_id_idx').on(table.shareId)
  })
);
