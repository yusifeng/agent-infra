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

export const workspaces = sqliteTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    appId: text('app_id').notNull(),
    userId: text('user_id').notNull(),
    title: text('title'),
    status: text('status').notNull(),
    defaultForUser: integer('default_for_user', { mode: 'boolean' }).notNull(),
    metadata: text('metadata', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' })
  },
  (table) => ({
    appUserIdx: index('workspaces_app_id_user_id_idx').on(table.appId, table.userId),
    defaultUserIdx: index('workspaces_app_id_user_id_default_idx').on(table.appId, table.userId, table.defaultForUser)
  })
);

export const agentProfiles = sqliteTable(
  'agent_profiles',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    name: text('name').notNull(),
    provider: text('provider').notNull(),
    model: text('model'),
    status: text('status').notNull(),
    defaultForWorkspace: integer('default_for_workspace', { mode: 'boolean' }).notNull(),
    approvalPolicy: text('approval_policy'),
    sandboxMode: text('sandbox_mode'),
    toolAllowlist: text('tool_allowlist', { mode: 'json' }),
    mcpServers: text('mcp_servers', { mode: 'json' }),
    skillRefs: text('skill_refs', { mode: 'json' }),
    secretRefs: text('secret_refs', { mode: 'json' }),
    metadata: text('metadata', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' })
  },
  (table) => ({
    workspaceIdx: index('agent_profiles_workspace_id_idx').on(table.workspaceId),
    workspaceDefaultIdx: index('agent_profiles_workspace_default_idx').on(table.workspaceId, table.defaultForWorkspace)
  })
);

export const workspaceSecretRefs = sqliteTable(
  'workspace_secret_refs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    name: text('name').notNull(),
    scope: text('scope').notNull(),
    delivery: text('delivery').notNull(),
    status: text('status').notNull(),
    refKey: text('ref_key').notNull(),
    targetName: text('target_name'),
    metadata: text('metadata', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' })
  },
  (table) => ({
    workspaceIdx: index('workspace_secret_refs_workspace_id_idx').on(table.workspaceId),
    workspaceNameIdx: index('workspace_secret_refs_workspace_name_idx').on(table.workspaceId, table.name)
  })
);

export const workspaceFileIndex = sqliteTable(
  'workspace_file_index',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    path: text('path').notNull(),
    kind: text('kind').notNull(),
    sizeBytes: integer('size_bytes'),
    mimeType: text('mime_type'),
    contentHash: text('content_hash'),
    previewCapability: text('preview_capability'),
    metadata: text('metadata', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' })
  },
  (table) => ({
    workspaceIdx: index('workspace_file_index_workspace_id_idx').on(table.workspaceId),
    workspacePathUnique: uniqueIndex('workspace_file_index_workspace_path_unique').on(table.workspaceId, table.path)
  })
);

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
    claimOwner: text('claim_owner'),
    claimExpiresAt: integer('claim_expires_at', { mode: 'timestamp_ms' }),
    nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp_ms' }),
    attemptCount: integer('attempt_count').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    threadIdIdx: index('runs_thread_id_idx').on(table.threadId),
    threadTriggerMessageIdx: index('runs_thread_id_trigger_message_id_idx').on(table.threadId, table.triggerMessageId),
    statusClaimExpiresAtIdx: index('runs_status_claim_expires_at_idx').on(table.status, table.claimExpiresAt),
    statusNextAttemptAtIdx: index('runs_status_next_attempt_at_idx').on(table.status, table.nextAttemptAt)
  })
);

export const cloudAgentWorkers = sqliteTable(
  'cloud_agent_workers',
  {
    id: text('id').primaryKey(),
    appId: text('app_id').notNull(),
    queueProvider: text('queue_provider').notNull(),
    status: text('status').notNull(),
    concurrency: integer('concurrency').notNull(),
    activeRunIds: text('active_run_ids', { mode: 'json' }),
    metadata: text('metadata', { mode: 'json' }),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    lastHeartbeatAt: integer('last_heartbeat_at', { mode: 'timestamp_ms' }).notNull(),
    stoppedAt: integer('stopped_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    appStatusIdx: index('cloud_agent_workers_app_status_idx').on(table.appId, table.status),
    heartbeatIdx: index('cloud_agent_workers_last_heartbeat_idx').on(table.lastHeartbeatAt),
    providerIdx: index('cloud_agent_workers_provider_idx').on(table.queueProvider)
  })
);

export const workspaceChangeSets = sqliteTable(
  'workspace_change_sets',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    threadId: text('thread_id').references(() => threads.id),
    runId: text('run_id').references(() => runs.id),
    status: text('status').notNull(),
    baseSnapshotId: text('base_snapshot_id'),
    nextSnapshotId: text('next_snapshot_id'),
    metadata: text('metadata', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' })
  },
  (table) => ({
    workspaceIdx: index('workspace_change_sets_workspace_id_idx').on(table.workspaceId),
    runIdIdx: index('workspace_change_sets_run_id_idx').on(table.runId),
    statusIdx: index('workspace_change_sets_status_idx').on(table.status)
  })
);

export const workspaceFileChanges = sqliteTable(
  'workspace_file_changes',
  {
    id: text('id').primaryKey(),
    changeSetId: text('change_set_id')
      .notNull()
      .references(() => workspaceChangeSets.id),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    threadId: text('thread_id').references(() => threads.id),
    runId: text('run_id').references(() => runs.id),
    path: text('path').notNull(),
    changeType: text('change_type').notNull(),
    beforeContentHash: text('before_content_hash'),
    afterContentHash: text('after_content_hash'),
    artifactId: text('artifact_id'),
    metadata: text('metadata', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    changeSetIdx: index('workspace_file_changes_change_set_id_idx').on(table.changeSetId),
    runIdIdx: index('workspace_file_changes_run_id_idx').on(table.runId),
    workspacePathIdx: index('workspace_file_changes_workspace_path_idx').on(table.workspaceId, table.path)
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

export const runApprovalRequests = sqliteTable(
  'run_approval_requests',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').references(() => workspaces.id),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id),
    provider: text('provider').notNull(),
    permissionRequestId: text('permission_request_id').notNull(),
    action: text('action').notNull(),
    status: text('status').notNull(),
    detailsJson: text('details_json', { mode: 'json' }),
    decision: text('decision'),
    decisionReason: text('decision_reason'),
    resolvedByActorId: text('resolved_by_actor_id'),
    metadataJson: text('metadata_json', { mode: 'json' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' })
  },
  (table) => ({
    runIdIdx: index('run_approval_requests_run_id_idx').on(table.runId),
    providerRequestUnique: uniqueIndex('run_approval_requests_run_provider_request_unique').on(
      table.runId,
      table.provider,
      table.permissionRequestId
    ),
    statusExpiresAtIdx: index('run_approval_requests_status_expires_at_idx').on(table.status, table.expiresAt)
  })
);

export const providerSessionBindings = sqliteTable(
  'provider_session_bindings',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id),
    runId: text('run_id').references(() => runs.id),
    provider: text('provider').notNull(),
    providerSessionId: text('provider_session_id').notNull(),
    providerProjectKey: text('provider_project_key'),
    status: text('status').notNull(),
    metadata: text('metadata', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' })
  },
  (table) => ({
    threadProviderIdx: index('provider_session_bindings_thread_provider_idx').on(table.threadId, table.provider),
    providerSessionIdx: index('provider_session_bindings_provider_session_idx').on(
      table.provider,
      table.providerSessionId,
      table.providerProjectKey
    )
  })
);

export const providerTranscriptEntries = sqliteTable(
  'provider_transcript_entries',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    threadId: text('thread_id').references(() => threads.id),
    runId: text('run_id').references(() => runs.id),
    provider: text('provider').notNull(),
    providerSessionId: text('provider_session_id').notNull(),
    providerProjectKey: text('provider_project_key'),
    providerEntryId: text('provider_entry_id'),
    ordinal: integer('ordinal').notNull(),
    entryType: text('entry_type').notNull(),
    rawJson: text('raw_json', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    providerSessionOrdinalUnique: uniqueIndex('provider_transcript_entries_session_ordinal_unique').on(
      table.provider,
      table.providerSessionId,
      table.providerProjectKey,
      table.ordinal
    ),
    providerSessionIdx: index('provider_transcript_entries_provider_session_idx').on(
      table.provider,
      table.providerSessionId,
      table.providerProjectKey
    ),
    runIdIdx: index('provider_transcript_entries_run_id_idx').on(table.runId)
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
  `CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT,
    status TEXT NOT NULL,
    default_for_user INTEGER NOT NULL,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    archived_at INTEGER
  )`,
  'CREATE INDEX IF NOT EXISTS workspaces_app_id_user_id_idx ON workspaces(app_id, user_id)',
  'CREATE INDEX IF NOT EXISTS workspaces_app_id_user_id_default_idx ON workspaces(app_id, user_id, default_for_user)',
  `CREATE TABLE IF NOT EXISTS agent_profiles (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT,
    status TEXT NOT NULL,
    default_for_workspace INTEGER NOT NULL,
    approval_policy TEXT,
    sandbox_mode TEXT,
    tool_allowlist TEXT,
    mcp_servers TEXT,
    skill_refs TEXT,
    secret_refs TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    archived_at INTEGER
  )`,
  'CREATE INDEX IF NOT EXISTS agent_profiles_workspace_id_idx ON agent_profiles(workspace_id)',
  'CREATE INDEX IF NOT EXISTS agent_profiles_workspace_default_idx ON agent_profiles(workspace_id, default_for_workspace)',
  `CREATE TABLE IF NOT EXISTS workspace_secret_refs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    name TEXT NOT NULL,
    scope TEXT NOT NULL,
    delivery TEXT NOT NULL,
    status TEXT NOT NULL,
    ref_key TEXT NOT NULL,
    target_name TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    archived_at INTEGER
  )`,
  'CREATE INDEX IF NOT EXISTS workspace_secret_refs_workspace_id_idx ON workspace_secret_refs(workspace_id)',
  'CREATE INDEX IF NOT EXISTS workspace_secret_refs_workspace_name_idx ON workspace_secret_refs(workspace_id, name)',
  `CREATE TABLE IF NOT EXISTS workspace_file_index (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    path TEXT NOT NULL,
    kind TEXT NOT NULL,
    size_bytes INTEGER,
    mime_type TEXT,
    content_hash TEXT,
    preview_capability TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  )`,
  'CREATE INDEX IF NOT EXISTS workspace_file_index_workspace_id_idx ON workspace_file_index(workspace_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS workspace_file_index_workspace_path_unique ON workspace_file_index(workspace_id, path)',
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
    claim_owner TEXT,
    claim_expires_at INTEGER,
    next_attempt_at INTEGER,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS runs_thread_id_idx ON runs(thread_id)',
  'CREATE INDEX IF NOT EXISTS runs_thread_id_trigger_message_id_idx ON runs(thread_id, trigger_message_id)',
  'CREATE INDEX IF NOT EXISTS runs_status_claim_expires_at_idx ON runs(status, claim_expires_at)',
  'CREATE INDEX IF NOT EXISTS runs_status_next_attempt_at_idx ON runs(status, next_attempt_at)',
  `CREATE TABLE IF NOT EXISTS cloud_agent_workers (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    queue_provider TEXT NOT NULL,
    status TEXT NOT NULL,
    concurrency INTEGER NOT NULL,
    active_run_ids TEXT,
    metadata TEXT,
    started_at INTEGER NOT NULL,
    last_heartbeat_at INTEGER NOT NULL,
    stopped_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS cloud_agent_workers_app_status_idx ON cloud_agent_workers(app_id, status)',
  'CREATE INDEX IF NOT EXISTS cloud_agent_workers_last_heartbeat_idx ON cloud_agent_workers(last_heartbeat_at)',
  'CREATE INDEX IF NOT EXISTS cloud_agent_workers_provider_idx ON cloud_agent_workers(queue_provider)',
  `CREATE TABLE IF NOT EXISTS workspace_change_sets (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    thread_id TEXT REFERENCES threads(id),
    run_id TEXT REFERENCES runs(id),
    status TEXT NOT NULL,
    base_snapshot_id TEXT,
    next_snapshot_id TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    resolved_at INTEGER
  )`,
  'CREATE INDEX IF NOT EXISTS workspace_change_sets_workspace_id_idx ON workspace_change_sets(workspace_id)',
  'CREATE INDEX IF NOT EXISTS workspace_change_sets_run_id_idx ON workspace_change_sets(run_id)',
  'CREATE INDEX IF NOT EXISTS workspace_change_sets_status_idx ON workspace_change_sets(status)',
  `CREATE TABLE IF NOT EXISTS workspace_file_changes (
    id TEXT PRIMARY KEY,
    change_set_id TEXT NOT NULL REFERENCES workspace_change_sets(id),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    thread_id TEXT REFERENCES threads(id),
    run_id TEXT REFERENCES runs(id),
    path TEXT NOT NULL,
    change_type TEXT NOT NULL,
    before_content_hash TEXT,
    after_content_hash TEXT,
    artifact_id TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS workspace_file_changes_change_set_id_idx ON workspace_file_changes(change_set_id)',
  'CREATE INDEX IF NOT EXISTS workspace_file_changes_run_id_idx ON workspace_file_changes(run_id)',
  'CREATE INDEX IF NOT EXISTS workspace_file_changes_workspace_path_idx ON workspace_file_changes(workspace_id, path)',
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
  `CREATE TABLE IF NOT EXISTS run_approval_requests (
    id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces(id),
    thread_id TEXT NOT NULL REFERENCES threads(id),
    run_id TEXT NOT NULL REFERENCES runs(id),
    provider TEXT NOT NULL,
    permission_request_id TEXT NOT NULL,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    details_json TEXT,
    decision TEXT,
    decision_reason TEXT,
    resolved_by_actor_id TEXT,
    metadata_json TEXT,
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    resolved_at INTEGER
  )`,
  'CREATE INDEX IF NOT EXISTS run_approval_requests_run_id_idx ON run_approval_requests(run_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS run_approval_requests_run_provider_request_unique ON run_approval_requests(run_id, provider, permission_request_id)',
  'CREATE INDEX IF NOT EXISTS run_approval_requests_status_expires_at_idx ON run_approval_requests(status, expires_at)',
  `CREATE TABLE IF NOT EXISTS provider_session_bindings (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    thread_id TEXT NOT NULL REFERENCES threads(id),
    run_id TEXT REFERENCES runs(id),
    provider TEXT NOT NULL,
    provider_session_id TEXT NOT NULL,
    provider_project_key TEXT,
    status TEXT NOT NULL,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    archived_at INTEGER
  )`,
  'CREATE INDEX IF NOT EXISTS provider_session_bindings_thread_provider_idx ON provider_session_bindings(thread_id, provider)',
  'CREATE INDEX IF NOT EXISTS provider_session_bindings_provider_session_idx ON provider_session_bindings(provider, provider_session_id, provider_project_key)',
  `CREATE TABLE IF NOT EXISTS provider_transcript_entries (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    thread_id TEXT REFERENCES threads(id),
    run_id TEXT REFERENCES runs(id),
    provider TEXT NOT NULL,
    provider_session_id TEXT NOT NULL,
    provider_project_key TEXT,
    provider_entry_id TEXT,
    ordinal INTEGER NOT NULL,
    entry_type TEXT NOT NULL,
    raw_json TEXT,
    created_at INTEGER NOT NULL
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS provider_transcript_entries_session_ordinal_unique ON provider_transcript_entries(provider, provider_session_id, provider_project_key, ordinal)',
  'CREATE INDEX IF NOT EXISTS provider_transcript_entries_provider_session_idx ON provider_transcript_entries(provider, provider_session_id, provider_project_key)',
  'CREATE INDEX IF NOT EXISTS provider_transcript_entries_run_id_idx ON provider_transcript_entries(run_id)',
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
