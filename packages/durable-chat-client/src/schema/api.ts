import type {
  AnswerCandidateDto,
  AnswerSelectionDto,
  CaptureDatasetExampleResponseDto,
  CreateThreadResponseDto,
  DatasetDto,
  DatasetExampleEffectiveEligibilityDto,
  DatasetExampleDto,
  DatasetExampleReviewDto,
  DatasetExpectedOutputNormalizationDto,
  DatasetExpectedOutputV1Dto,
  DatasetExampleResponseDto,
  DatasetExamplesResponseDto,
  DatasetResponseDto,
  DatasetsResponseDto,
  EvalActualOutputSnapshotV1Dto,
  EvalExampleResultDto,
  EvalExampleResultResponseDto,
  EvalExampleResultsResponseDto,
  EvalExampleResultReviewDto,
  EvalRunConfigV1Dto,
  EvalRunDto,
  EvalRunResponseDto,
  EvalRunsResponseDto,
  EvalRunSummaryV1Dto,
  MessageDto,
  MessagePartDto,
  RunFeedbackDto,
  RunDto,
  RunEventDto,
  RunTraceResponseDto,
  TraceProjectionDiagnosticCodeDto,
  RunTimelineItemDto,
  RunTimelineProjectionDto,
  RunTimelineResponseDto,
  RuntimePiMetaDto,
  ThreadDto,
  ThreadMessagesResponseDto,
  ThreadMessagesPageInfoDto,
  ThreadRunsResponseDto,
  ThreadsResponseDto,
  TraceProjectionDiagnosticDto,
  TraceSpanDto,
  TraceSpanKindDto,
  TraceSpanProjectionDiagnosticsDto,
  TraceSpanProjectionDto,
  TraceSpanSourceRefDto,
  TraceSpanStatusDto,
  ToolInvocationDto
} from '@agent-infra/contracts';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function asNullableString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNullableNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  return asNumber(value);
}

function isNullableNumber(value: unknown) {
  return value === null || value === undefined || asNumber(value) !== null;
}

function asBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function asJsonRecordOrNull(value: unknown) {
  return value === null || value === undefined ? null : asRecord(value);
}

function normalizeThread(value: unknown): ThreadDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const appId = asString(record.appId);
  const status = asString(record.status) as ThreadDto['status'] | null;
  const createdAt = asString(record.createdAt);
  const updatedAt = asString(record.updatedAt);

  if (!id || !appId || !status || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    appId,
    userId: asNullableString(record.userId),
    title: asNullableString(record.title),
    status,
    metadata: asJsonRecordOrNull(record.metadata),
    createdAt,
    updatedAt,
    archivedAt: asNullableString(record.archivedAt)
  };
}

function normalizeRun(value: unknown): RunDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const threadId = asString(record.threadId);
  const status = asString(record.status) as RunDto['status'] | null;
  const createdAt = asString(record.createdAt);

  if (!id || !threadId || !status || !createdAt) {
    return null;
  }

  return {
    id,
    threadId,
    triggerMessageId: asNullableString(record.triggerMessageId),
    provider: asNullableString(record.provider),
    model: asNullableString(record.model),
    status,
    usage: asJsonRecordOrNull(record.usage),
    error: asNullableString(record.error),
    startedAt: asNullableString(record.startedAt),
    finishedAt: asNullableString(record.finishedAt),
    createdAt
  };
}

function normalizeMessagePart(value: unknown): MessagePartDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const messageId = asString(record.messageId);
  const partIndex = asNumber(record.partIndex);
  const type = asString(record.type) as MessagePartDto['type'] | null;
  const createdAt = asString(record.createdAt);

  if (!id || !messageId || partIndex === null || !type || !createdAt) {
    return null;
  }

  return {
    id,
    messageId,
    partIndex,
    type,
    textValue: asNullableString(record.textValue),
    jsonValue: asJsonRecordOrNull(record.jsonValue),
    createdAt
  };
}

function normalizeMessage(value: unknown): MessageDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const threadId = asString(record.threadId);
  const role = asString(record.role) as MessageDto['role'] | null;
  const seq = asNumber(record.seq);
  const status = asString(record.status) as MessageDto['status'] | null;
  const createdAt = asString(record.createdAt);

  if (!id || !threadId || !role || seq === null || !status || !createdAt) {
    return null;
  }

  return {
    id,
    threadId,
    runId: asNullableString(record.runId),
    role,
    seq,
    status,
    metadata: asJsonRecordOrNull(record.metadata),
    createdAt,
    parts: Array.isArray(record.parts) ? record.parts.map(normalizeMessagePart).filter((part): part is MessagePartDto => part !== null) : []
  };
}

function normalizeAnswerCandidate(value: unknown): AnswerCandidateDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const threadId = asString(record.threadId);
  const triggerMessageId = asString(record.triggerMessageId);
  const runId = asString(record.runId);
  const ordinal = asNumber(record.ordinal);
  const kind = asString(record.kind) as AnswerCandidateDto['kind'] | null;
  const createdAt = asString(record.createdAt);

  if (!id || !threadId || !triggerMessageId || !runId || ordinal === null || !kind || !createdAt) {
    return null;
  }

  return {
    id,
    threadId,
    triggerMessageId,
    runId,
    ordinal,
    kind,
    createdAt
  };
}

function normalizeAnswerSelection(value: unknown): AnswerSelectionDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const threadId = asString(record.threadId);
  const triggerMessageId = asString(record.triggerMessageId);
  const selectedRunId = asString(record.selectedRunId);
  const source = asString(record.source) as AnswerSelectionDto['source'] | null;
  const createdAt = asString(record.createdAt);
  const updatedAt = asString(record.updatedAt);

  if (!threadId || !triggerMessageId || !selectedRunId || !source || !createdAt || !updatedAt) {
    return null;
  }

  return {
    threadId,
    triggerMessageId,
    selectedRunId,
    source,
    selectedByUserId: asNullableString(record.selectedByUserId),
    createdAt,
    updatedAt
  };
}

function normalizeRunFeedback(value: unknown): RunFeedbackDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const threadId = asString(record.threadId);
  const triggerMessageId = asString(record.triggerMessageId);
  const runId = asString(record.runId);
  const feedbackActorId = asString(record.feedbackActorId);
  const feedbackValue = asString(record.value) as RunFeedbackDto['value'] | null;
  const createdAt = asString(record.createdAt);
  const updatedAt = asString(record.updatedAt);

  if (!id || !threadId || !triggerMessageId || !runId || !feedbackActorId || !feedbackValue || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    threadId,
    triggerMessageId,
    runId,
    feedbackActorId,
    value: feedbackValue,
    createdAt,
    updatedAt
  };
}

function normalizeDataset(value: unknown): DatasetDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const appId = asString(record.appId);
  const name = asString(record.name);
  const visibility = asString(record.visibility) as DatasetDto['visibility'] | null;
  const createdAt = asString(record.createdAt);
  const updatedAt = asString(record.updatedAt);

  if (!id || !appId || !name || (visibility !== 'private' && visibility !== 'app') || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    appId,
    name,
    description: asNullableString(record.description),
    visibility,
    metadata: asJsonRecordOrNull(record.metadata),
    createdByActorId: asNullableString(record.createdByActorId),
    createdAt,
    updatedAt
  };
}

function normalizeDatasetExpectedOutputValue(value: unknown): DatasetExpectedOutputV1Dto | null {
  const record = asRecord(value);
  if (!record || record.schemaVersion !== 1 || record.kind !== 'assistant_text') {
    return null;
  }

  const text = asString(record.text);
  if (!text) {
    return null;
  }

  return {
    schemaVersion: 1,
    kind: 'assistant_text',
    text,
    notes: asNullableString(record.notes)
  };
}

function normalizeDatasetExpectedOutput(value: unknown): DatasetExpectedOutputNormalizationDto {
  const record = asRecord(value);
  if (!record) {
    return { state: 'missing', expectedOutput: null };
  }

  if (record.state === 'valid') {
    const expectedOutput = normalizeDatasetExpectedOutputValue(record.expectedOutput);
    return expectedOutput
      ? { state: 'valid', expectedOutput }
      : { state: 'invalid', expectedOutput: null, reason: 'invalid expected output projection' };
  }

  if (record.state === 'invalid') {
    return {
      state: 'invalid',
      expectedOutput: null,
      ...(typeof record.reason === 'string' ? { reason: record.reason } : {})
    };
  }

  return { state: 'missing', expectedOutput: null };
}

function normalizeDatasetExpectedOutputFromRaw(value: unknown): DatasetExpectedOutputNormalizationDto {
  if (value === null || value === undefined) {
    return { state: 'missing', expectedOutput: null };
  }

  const expectedOutput = normalizeDatasetExpectedOutputValue(value);
  return expectedOutput
    ? { state: 'valid', expectedOutput }
    : { state: 'invalid', expectedOutput: null, reason: 'invalid expectedOutputJson' };
}

function normalizeDatasetExampleReview(value: unknown): DatasetExampleReviewDto {
  const record = asRecord(value);
  const status = record?.status;
  const evalEligibility = record?.evalEligibility;
  const exclusionReason = record?.exclusionReason;

  return {
    status:
      status === 'needs_expected_output' || status === 'approved' || status === 'excluded'
        ? status
        : 'unreviewed',
    evalEligibility: evalEligibility === 'include' || evalEligibility === 'exclude' ? evalEligibility : 'default',
    exclusionReason:
      exclusionReason === 'failure_case' ||
      exclusionReason === 'debug_case' ||
      exclusionReason === 'missing_expected_output' ||
      exclusionReason === 'not_representative' ||
      exclusionReason === 'sensitive_or_unsafe' ||
      exclusionReason === 'other'
        ? exclusionReason
        : null,
    reviewerNote: asNullableString(record?.reviewerNote),
    reviewedByActorId: asNullableString(record?.reviewedByActorId),
    reviewedAt: asNullableString(record?.reviewedAt)
  };
}

function normalizeDatasetExampleEffectiveEligibility(value: unknown): DatasetExampleEffectiveEligibilityDto {
  const record = asRecord(value);
  const reason = asString(record?.reason);
  const eligible = asBoolean(record?.eligible);
  if (
    eligible !== null &&
    (reason === 'eligible_default' ||
      reason === 'eligible_included_by_review' ||
      reason === 'ineligible_unreviewed' ||
      reason === 'ineligible_needs_expected_output' ||
      reason === 'ineligible_missing_expected_output' ||
      reason === 'ineligible_invalid_expected_output' ||
      reason === 'ineligible_excluded_by_review' ||
      reason === 'ineligible_capture_default' ||
      reason === 'ineligible_contradictory_review_state')
  ) {
    return {
      eligible,
      reason
    };
  }

  return {
    eligible: false,
    reason: 'ineligible_unreviewed'
  };
}

function normalizeDatasetExample(value: unknown): DatasetExampleDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const datasetId = asString(record.datasetId);
  const inputJson = asRecord(record.inputJson);
  const createdAt = asString(record.createdAt);
  const updatedAt = asString(record.updatedAt);

  if (!id || !datasetId || !inputJson || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    datasetId,
    sourceRunId: asNullableString(record.sourceRunId),
    sourceThreadId: asNullableString(record.sourceThreadId),
    triggerMessageId: asNullableString(record.triggerMessageId),
    inputJson,
    baselineOutputJson: asJsonRecordOrNull(record.baselineOutputJson),
    expectedOutputJson: asJsonRecordOrNull(record.expectedOutputJson),
    expectedOutput: Object.hasOwn(record, 'expectedOutput')
      ? normalizeDatasetExpectedOutput(record.expectedOutput)
      : normalizeDatasetExpectedOutputFromRaw(record.expectedOutputJson),
    metadataJson: asJsonRecordOrNull(record.metadataJson),
    review: normalizeDatasetExampleReview(record.review),
    effectiveEligibility: normalizeDatasetExampleEffectiveEligibility(record.effectiveEligibility),
    contextSnapshotJson: asJsonRecordOrNull(record.contextSnapshotJson),
    toolInvocationsSnapshotJson: asJsonRecordOrNull(record.toolInvocationsSnapshotJson),
    createdByActorId: asNullableString(record.createdByActorId),
    createdAt,
    updatedAt
  };
}

function normalizeEvalExampleResultReview(value: unknown): EvalExampleResultReviewDto {
  const record = asRecord(value);
  const status = record?.status;

  return {
    status:
      status === 'pass' || status === 'fail' || status === 'needs_review' || status === 'not_applicable'
        ? status
        : 'unreviewed',
    reviewerNote: asNullableString(record?.reviewerNote),
    reviewedByActorId: asNullableString(record?.reviewedByActorId),
    reviewedAt: asNullableString(record?.reviewedAt)
  };
}

function normalizeEvalRunConfig(value: unknown): EvalRunConfigV1Dto | null {
  const record = asRecord(value);
  const selection = asRecord(record?.selection);
  const execution = asRecord(record?.execution);
  const runtime = asRecord(record?.runtime);
  if (
    !record ||
    record.schemaVersion !== 1 ||
    record.kind !== 'eval_run_config' ||
    selection?.policy !== 'effective_eligible_v1' ||
    execution?.mode !== 'current_runtime' ||
    execution.strategy !== 'isolated_eval_thread' ||
    execution.concurrency !== 'serial'
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    kind: 'eval_run_config',
    selection: {
      policy: 'effective_eligible_v1'
    },
    execution: {
      mode: 'current_runtime',
      strategy: 'isolated_eval_thread',
      concurrency: 'serial'
    },
    runtime: runtime
      ? {
          provider: asNullableString(runtime.provider),
          model: asNullableString(runtime.model),
          options: asJsonRecordOrNull(runtime.options)
        }
      : null
  };
}

function normalizeNumberRecord(value: unknown): Record<string, number> {
  const record = asRecord(value);
  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
  );
}

function normalizeEvalRunSummary(value: unknown): EvalRunSummaryV1Dto | null {
  const record = asRecord(value);
  const selection = asRecord(record?.selection);
  const results = asRecord(record?.results);
  const eligibleCount = asNumber(selection?.eligibleCount);
  const ineligibleCount = asNumber(selection?.ineligibleCount);
  const selectedCount = asNumber(selection?.selectedCount);
  if (
    !record ||
    record.schemaVersion !== 1 ||
    record.kind !== 'eval_run_summary' ||
    !selection ||
    !results ||
    eligibleCount === null ||
    ineligibleCount === null ||
    selectedCount === null ||
    !isNullableNumber(results.durationMs)
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    kind: 'eval_run_summary',
    selection: {
      eligibleCount,
      ineligibleCount,
      ineligibleReasonCounts: normalizeNumberRecord(selection.ineligibleReasonCounts),
      selectedCount
    },
    results: {
      statusCounts: normalizeNumberRecord(results.statusCounts) as EvalRunSummaryV1Dto['results']['statusCounts'],
      reviewStatusCounts: normalizeNumberRecord(results.reviewStatusCounts) as EvalRunSummaryV1Dto['results']['reviewStatusCounts'],
      aggregateUsage: asJsonRecordOrNull(results.aggregateUsage),
      durationMs: asNullableNumber(results.durationMs)
    }
  };
}

function normalizeEvalActualOutput(value: unknown): EvalActualOutputSnapshotV1Dto | null {
  const record = asRecord(value);
  if (!record || record.schemaVersion !== 1 || record.kind !== 'eval_run_output') {
    return null;
  }

  const outputRunId = asString(record.outputRunId);
  const evalThreadId = asString(record.evalThreadId);
  const status = asString(record.status) as EvalActualOutputSnapshotV1Dto['status'] | null;
  if (!outputRunId || !evalThreadId || !status) {
    return null;
  }

  return {
    schemaVersion: 1,
    kind: 'eval_run_output',
    outputRunId,
    evalThreadId,
    status,
    error: asNullableString(record.error),
    assistantMessages: Array.isArray(record.assistantMessages)
      ? record.assistantMessages.map(normalizeMessage).filter((message): message is MessageDto => message !== null)
      : []
  };
}

function normalizeEvalRun(value: unknown): EvalRunDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const appId = asString(record.appId);
  const datasetId = asString(record.datasetId);
  const status = asString(record.status) as EvalRunDto['status'] | null;
  const configJson = asRecord(record.configJson);
  const summaryJson = asRecord(record.summaryJson);
  const createdAt = asString(record.createdAt);
  const updatedAt = asString(record.updatedAt);
  if (!id || !appId || !datasetId || !status || !configJson || !summaryJson || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    appId,
    datasetId,
    status,
    name: asNullableString(record.name),
    configJson,
    config: Object.hasOwn(record, 'config') ? normalizeEvalRunConfig(record.config) : normalizeEvalRunConfig(configJson),
    summaryJson,
    summary: Object.hasOwn(record, 'summary') ? normalizeEvalRunSummary(record.summary) : normalizeEvalRunSummary(summaryJson),
    error: asNullableString(record.error),
    createdByActorId: asNullableString(record.createdByActorId),
    startedAt: asNullableString(record.startedAt),
    finishedAt: asNullableString(record.finishedAt),
    createdAt,
    updatedAt
  };
}

function normalizeEvalExampleResult(value: unknown): EvalExampleResultDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const evalRunId = asString(record.evalRunId);
  const datasetExampleId = asString(record.datasetExampleId);
  const exampleOrdinal = asNumber(record.exampleOrdinal);
  const status = asString(record.status) as EvalExampleResultDto['status'] | null;
  const expectedOutputJson = asRecord(record.expectedOutputJson);
  const createdAt = asString(record.createdAt);
  const updatedAt = asString(record.updatedAt);
  if (!id || !evalRunId || !datasetExampleId || exampleOrdinal === null || !status || !expectedOutputJson || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    evalRunId,
    datasetExampleId,
    exampleOrdinal,
    status,
    evalThreadId: asNullableString(record.evalThreadId),
    outputRunId: asNullableString(record.outputRunId),
    expectedOutputJson,
    actualOutputJson: asJsonRecordOrNull(record.actualOutputJson),
    actualOutput: Object.hasOwn(record, 'actualOutput') ? normalizeEvalActualOutput(record.actualOutput) : normalizeEvalActualOutput(record.actualOutputJson),
    inputJson: asJsonRecordOrNull(record.inputJson),
    usageJson: asJsonRecordOrNull(record.usageJson),
    metadataJson: asJsonRecordOrNull(record.metadataJson),
    review: normalizeEvalExampleResultReview(record.review),
    error: asNullableString(record.error),
    startedAt: asNullableString(record.startedAt),
    finishedAt: asNullableString(record.finishedAt),
    createdAt,
    updatedAt
  };
}

function normalizeThreadMessagesPageInfo(value: unknown): ThreadMessagesPageInfoDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const hasOlder = asBoolean(record.hasOlder);
  const hasNewer = asBoolean(record.hasNewer);
  if (hasOlder === null || hasNewer === null) {
    return null;
  }

  return {
    hasOlder,
    hasNewer,
    startCursor: asNullableString(record.startCursor),
    endCursor: asNullableString(record.endCursor)
  };
}

function normalizeToolInvocation(value: unknown): ToolInvocationDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const threadId = asString(record.threadId);
  const runId = asString(record.runId);
  const messageId = asString(record.messageId);
  const toolName = asString(record.toolName);
  const toolCallId = asString(record.toolCallId);
  const status = asString(record.status) as ToolInvocationDto['status'] | null;
  const createdAt = asString(record.createdAt);

  if (!id || !threadId || !runId || !messageId || !toolName || !toolCallId || !status || !createdAt) {
    return null;
  }

  return {
    id,
    threadId,
    runId,
    messageId,
    toolName,
    toolCallId,
    status,
    input: asJsonRecordOrNull(record.input),
    output: asJsonRecordOrNull(record.output),
    error: asNullableString(record.error),
    startedAt: asNullableString(record.startedAt),
    finishedAt: asNullableString(record.finishedAt),
    createdAt
  };
}

function normalizeRunEvent(value: unknown): RunEventDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const threadId = asString(record.threadId);
  const runId = asString(record.runId);
  const seq = asNumber(record.seq);
  const type = asString(record.type);
  const createdAt = asString(record.createdAt);

  if (!id || !threadId || !runId || seq === null || !type || !createdAt) {
    return null;
  }

  return {
    id,
    threadId,
    runId,
    seq,
    type,
    payload: asJsonRecordOrNull(record.payload),
    createdAt
  };
}

function normalizeRunTimelineItem(value: unknown): RunTimelineItemDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const kind = asString(record.kind);
  const phase = asString(record.phase);
  const runEventId = asString(record.runEventId);
  const seq = asNumber(record.seq);
  if (!kind || !runEventId || seq === null) {
    return null;
  }

  if (kind === 'run_lifecycle' && (phase === 'started' || phase === 'completed' || phase === 'failed' || phase === 'cancelled')) {
    return {
      kind,
      phase,
      runEventId,
      seq
    };
  }

  if (kind === 'assistant_message' && (phase === 'started' || phase === 'completed' || phase === 'failed')) {
    return {
      kind,
      phase,
      runEventId,
      seq
    };
  }

  if (kind === 'tool_invocation' && (phase === 'started' || phase === 'completed' || phase === 'failed')) {
    const toolCallId = asString(record.toolCallId);
    const toolName = asString(record.toolName);
    if (!toolCallId || !toolName) {
      return null;
    }

    return {
      kind,
      phase,
      toolCallId,
      toolName,
      toolInvocationId: asNullableString(record.toolInvocationId),
      runEventId,
      seq
    };
  }

  if (kind === 'runtime_error') {
    const message = asString(record.message);
    if (!message) {
      return null;
    }

    return {
      kind,
      message,
      runEventId,
      seq
    };
  }

  if (kind === 'unknown_event') {
    const type = asString(record.type);
    if (!type) {
      return null;
    }

    return {
      kind,
      type,
      runEventId,
      seq
    };
  }

  return null;
}

function normalizeRunTimelineProjection(value: unknown): RunTimelineProjectionDto | null {
  const record = asRecord(value);
  if (!record || record.schemaVersion !== 1 || !Array.isArray(record.items)) {
    return null;
  }

  return {
    schemaVersion: 1,
    items: record.items.map(normalizeRunTimelineItem).filter((item): item is RunTimelineItemDto => item !== null)
  };
}

function normalizeTraceSpanKind(value: unknown): TraceSpanKindDto | null {
  if (
    value === 'agent' ||
    value === 'assistant_message' ||
    value === 'tool_invocation' ||
    value === 'runtime_error' ||
    value === 'unknown_event'
  ) {
    return value;
  }

  return null;
}

function normalizeTraceSpanStatus(value: unknown): TraceSpanStatusDto | null {
  if (
    value === 'queued' ||
    value === 'running' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled' ||
    value === 'unknown'
  ) {
    return value;
  }

  return null;
}

function normalizeTraceProjectionDiagnosticCode(value: unknown): TraceProjectionDiagnosticCodeDto | null {
  if (
    value === 'unknown_event' ||
    value === 'orphan_event' ||
    value === 'missing_tool_invocation' ||
    value === 'unpaired_message_start' ||
    value === 'unpaired_message_end' ||
    value === 'unpaired_tool_start' ||
    value === 'unpaired_tool_end' ||
    value === 'nonterminal_child_on_terminal_run' ||
    value === 'negative_duration_clamped'
  ) {
    return value;
  }

  return null;
}

function normalizeTraceSpanSourceRef(value: unknown): TraceSpanSourceRefDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const type = asString(record.type);
  const id = asString(record.id);
  if (!type || !id) {
    return null;
  }

  if (type === 'run') {
    return {
      type,
      id
    };
  }

  if (type === 'run_event') {
    const seq = asNumber(record.seq);
    const eventType = asString(record.eventType);
    if (seq === null || !eventType) {
      return null;
    }

    return {
      type,
      id,
      seq,
      eventType
    };
  }

  if (type === 'tool_invocation') {
    const toolCallId = asString(record.toolCallId);
    if (!toolCallId) {
      return null;
    }

    return {
      type,
      id,
      toolCallId
    };
  }

  return null;
}

function normalizeTraceSpanUsageRef(value: unknown): TraceSpanDto['usageRef'] {
  const record = asRecord(value);
  if (!record || record.source !== 'run.usage') {
    return null;
  }

  const runId = asString(record.runId);
  if (!runId) {
    return null;
  }

  return {
    source: 'run.usage',
    runId
  };
}

function normalizeTraceSpanTool(value: unknown): TraceSpanDto['tool'] {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const toolCallId = asString(record.toolCallId);
  const toolName = asString(record.toolName);
  if (!toolCallId || !toolName) {
    return null;
  }

  return {
    toolInvocationId: asNullableString(record.toolInvocationId),
    toolCallId,
    toolName
  };
}

function normalizeTraceSpanError(value: unknown): TraceSpanDto['error'] {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const message = asString(record.message);
  if (!message) {
    return null;
  }

  return {
    message
  };
}

function normalizeTraceSpan(value: unknown): TraceSpanDto | null {
  const record = asRecord(value);
  if (!record || record.schemaVersion !== 1 || !Array.isArray(record.sourceRefs)) {
    return null;
  }

  const id = asString(record.id);
  const traceId = asString(record.traceId);
  const parentSpanId = asNullableString(record.parentSpanId);
  const kind = normalizeTraceSpanKind(record.kind);
  const name = asString(record.name);
  const status = normalizeTraceSpanStatus(record.status);
  const appId = asString(record.appId);
  const threadId = asString(record.threadId);
  const runId = asString(record.runId);
  const order = asNumber(record.order);
  const startedAt = asNullableString(record.startedAt);
  const finishedAt = asNullableString(record.finishedAt);
  const durationMs = asNullableNumber(record.durationMs);

  if (
    !id ||
    !traceId ||
    !kind ||
    !name ||
    !status ||
    !appId ||
    !threadId ||
    !runId ||
    order === null ||
    !isNullableNumber(record.durationMs)
  ) {
    return null;
  }

  return {
    schemaVersion: 1,
    id,
    traceId,
    parentSpanId,
    kind,
    name,
    status,
    appId,
    threadId,
    runId,
    order,
    startedAt,
    finishedAt,
    durationMs,
    provider: asNullableString(record.provider),
    model: asNullableString(record.model),
    usageRef: normalizeTraceSpanUsageRef(record.usageRef),
    tool: normalizeTraceSpanTool(record.tool),
    error: normalizeTraceSpanError(record.error),
    sourceRefs: record.sourceRefs.map(normalizeTraceSpanSourceRef).filter((sourceRef): sourceRef is TraceSpanSourceRefDto => sourceRef !== null),
    metadata: asJsonRecordOrNull(record.metadata)
  };
}

function normalizeTraceProjectionDiagnostic(value: unknown): TraceProjectionDiagnosticDto | null {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.sourceRefs)) {
    return null;
  }

  const code = normalizeTraceProjectionDiagnosticCode(record.code);
  const message = asString(record.message);
  if (!code || !message) {
    return null;
  }

  return {
    code,
    message,
    sourceRefs: record.sourceRefs.map(normalizeTraceSpanSourceRef).filter((sourceRef): sourceRef is TraceSpanSourceRefDto => sourceRef !== null)
  };
}

function normalizeTraceSpanProjectionDiagnostics(value: unknown): TraceSpanProjectionDiagnosticsDto | null {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.warnings)) {
    return null;
  }

  const unknownEventCount = asNumber(record.unknownEventCount);
  const orphanEventCount = asNumber(record.orphanEventCount);
  if (unknownEventCount === null || orphanEventCount === null) {
    return null;
  }

  return {
    unknownEventCount,
    orphanEventCount,
    warnings: record.warnings
      .map(normalizeTraceProjectionDiagnostic)
      .filter((warning): warning is TraceProjectionDiagnosticDto => warning !== null)
  };
}

function normalizeTraceSpanProjection(value: unknown): TraceSpanProjectionDto | null {
  const record = asRecord(value);
  if (!record || record.schemaVersion !== 1 || !Array.isArray(record.spans)) {
    return null;
  }

  const traceId = asString(record.traceId);
  const rootSpanId = asString(record.rootSpanId);
  const appId = asString(record.appId);
  const threadId = asString(record.threadId);
  const runId = asString(record.runId);
  const status = normalizeTraceSpanStatus(record.status);
  const startedAt = asNullableString(record.startedAt);
  const finishedAt = asNullableString(record.finishedAt);
  const durationMs = asNullableNumber(record.durationMs);
  const diagnostics = normalizeTraceSpanProjectionDiagnostics(record.diagnostics);
  const spans = record.spans.map(normalizeTraceSpan).filter((span): span is TraceSpanDto => span !== null);

  if (!traceId || !rootSpanId || !appId || !threadId || !runId || !status || !isNullableNumber(record.durationMs) || !diagnostics) {
    return null;
  }

  const rootSpan = spans.find((span) => span.id === rootSpanId);
  if (!rootSpan || rootSpan.parentSpanId !== null) {
    return null;
  }

  return {
    schemaVersion: 1,
    traceId,
    rootSpanId,
    appId,
    threadId,
    runId,
    status,
    startedAt,
    finishedAt,
    durationMs,
    spans,
    diagnostics
  };
}

function normalizeModelOption(value: unknown): RuntimePiMetaDto['modelOptions'][number] | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const key = asString(record.key);
  const provider = asString(record.provider);
  const model = asString(record.model);
  const label = asString(record.label);
  const description = asString(record.description);

  if (!key || !provider || !model || !label || !description) {
    return null;
  }

  return {
    key,
    provider,
    model,
    label,
    description
  };
}

export async function readJsonRecordOrEmpty(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return asRecord(JSON.parse(text)) ?? {};
  } catch {
    return {};
  }
}

export function readApiError(value: unknown) {
  return asString(asRecord(value)?.error) ?? null;
}

export function normalizeThreadsResponse(value: unknown): ThreadsResponseDto {
  const record = asRecord(value) ?? {};
  return {
    threads: Array.isArray(record.threads) ? record.threads.map(normalizeThread).filter((thread): thread is ThreadDto => thread !== null) : [],
    error: readApiError(record) ?? undefined
  };
}

export function normalizeCreateThreadResponse(value: unknown): CreateThreadResponseDto {
  const record = asRecord(value) ?? {};
  return {
    thread: normalizeThread(record.thread) ?? undefined,
    error: readApiError(record) ?? undefined
  };
}

export function normalizeDatasetsResponse(value: unknown): DatasetsResponseDto {
  const record = asRecord(value) ?? {};
  return {
    datasets: Array.isArray(record.datasets)
      ? record.datasets.map(normalizeDataset).filter((dataset): dataset is DatasetDto => dataset !== null)
      : [],
    error: readApiError(record) ?? undefined
  };
}

export function normalizeDatasetResponse(value: unknown): DatasetResponseDto {
  const record = asRecord(value) ?? {};
  return {
    dataset: normalizeDataset(record.dataset) ?? undefined,
    error: readApiError(record) ?? undefined
  };
}

export function normalizeDatasetExamplesResponse(value: unknown): DatasetExamplesResponseDto {
  const record = asRecord(value) ?? {};
  return {
    examples: Array.isArray(record.examples)
      ? record.examples.map(normalizeDatasetExample).filter((example): example is DatasetExampleDto => example !== null)
      : [],
    error: readApiError(record) ?? undefined
  };
}

export function normalizeDatasetExampleResponse(value: unknown): DatasetExampleResponseDto {
  const record = asRecord(value) ?? {};
  return {
    example: normalizeDatasetExample(record.example) ?? undefined,
    error: readApiError(record) ?? undefined
  };
}

export function normalizeCaptureDatasetExampleResponse(value: unknown): CaptureDatasetExampleResponseDto {
  const record = asRecord(value) ?? {};
  return {
    dataset: normalizeDataset(record.dataset) ?? undefined,
    example: normalizeDatasetExample(record.example) ?? undefined,
    error: readApiError(record) ?? undefined
  };
}

export function normalizeEvalRunsResponse(value: unknown): EvalRunsResponseDto {
  const record = asRecord(value) ?? {};
  return {
    evalRuns: Array.isArray(record.evalRuns)
      ? record.evalRuns.map(normalizeEvalRun).filter((evalRun): evalRun is EvalRunDto => evalRun !== null)
      : [],
    error: readApiError(record) ?? undefined
  };
}

export function normalizeEvalRunResponse(value: unknown): EvalRunResponseDto {
  const record = asRecord(value) ?? {};
  return {
    evalRun: normalizeEvalRun(record.evalRun) ?? undefined,
    error: readApiError(record) ?? undefined
  };
}

export function normalizeEvalExampleResultsResponse(value: unknown): EvalExampleResultsResponseDto {
  const record = asRecord(value) ?? {};
  return {
    results: Array.isArray(record.results)
      ? record.results.map(normalizeEvalExampleResult).filter((result): result is EvalExampleResultDto => result !== null)
      : [],
    error: readApiError(record) ?? undefined
  };
}

export function normalizeEvalExampleResultResponse(value: unknown): EvalExampleResultResponseDto {
  const record = asRecord(value) ?? {};
  return {
    result: normalizeEvalExampleResult(record.result) ?? undefined,
    error: readApiError(record) ?? undefined
  };
}

export function normalizeThreadMessagesResponse(value: unknown): ThreadMessagesResponseDto {
  const record = asRecord(value) ?? {};
  const legacyActiveRun = normalizeRun(record.activeRun);
  const canonicalActiveRuns = Array.isArray(record.activeRuns) ? record.activeRuns : null;
  const activeRuns = canonicalActiveRuns
    ? canonicalActiveRuns.map(normalizeRun).filter((run): run is RunDto => run !== null)
    : legacyActiveRun
      ? [legacyActiveRun]
      : [];
  const activeRun = canonicalActiveRuns ? activeRuns[0] ?? null : legacyActiveRun;
  return {
    messages: Array.isArray(record.messages)
      ? record.messages.map(normalizeMessage).filter((message): message is MessageDto => message !== null)
      : [],
    pageInfo: normalizeThreadMessagesPageInfo(record.pageInfo) ?? undefined,
    activeRun,
    activeRuns,
    answerCandidates: Array.isArray(record.answerCandidates)
      ? record.answerCandidates.map(normalizeAnswerCandidate).filter((candidate): candidate is AnswerCandidateDto => candidate !== null)
      : [],
    answerSelections: Array.isArray(record.answerSelections)
      ? record.answerSelections.map(normalizeAnswerSelection).filter((selection): selection is AnswerSelectionDto => selection !== null)
      : [],
    runFeedback: Array.isArray(record.runFeedback)
      ? record.runFeedback.map(normalizeRunFeedback).filter((feedback): feedback is RunFeedbackDto => feedback !== null)
      : [],
    error: readApiError(record) ?? undefined
  };
}

export function normalizeThreadRunsResponse(value: unknown): ThreadRunsResponseDto {
  const record = asRecord(value) ?? {};
  return {
    runs: Array.isArray(record.runs) ? record.runs.map(normalizeRun).filter((run): run is RunDto => run !== null) : [],
    error: readApiError(record) ?? undefined
  };
}

export function normalizeRunTimelineResponse(value: unknown): RunTimelineResponseDto {
  const record = asRecord(value) ?? {};
  return {
    run: normalizeRun(record.run),
    runEvents: Array.isArray(record.runEvents)
      ? record.runEvents.map(normalizeRunEvent).filter((event): event is RunEventDto => event !== null)
      : [],
    toolInvocations: Array.isArray(record.toolInvocations)
      ? record.toolInvocations.map(normalizeToolInvocation).filter((tool): tool is ToolInvocationDto => tool !== null)
      : [],
    projection: record.projection === undefined ? undefined : normalizeRunTimelineProjection(record.projection),
    error: readApiError(record) ?? undefined
  };
}

export function normalizeRunTraceResponse(value: unknown): RunTraceResponseDto {
  const record = asRecord(value) ?? {};
  return {
    run: normalizeRun(record.run),
    projection: record.projection === undefined ? undefined : normalizeTraceSpanProjection(record.projection),
    error: readApiError(record) ?? undefined
  };
}

export function normalizeRuntimeMetaResponse(value: unknown): Partial<RuntimePiMetaDto> {
  const record = asRecord(value) ?? {};
  return {
    dbMode: asString(record.dbMode) ?? undefined,
    dbConnection: asString(record.dbConnection) ?? undefined,
    runtimeConfigured: asBoolean(record.runtimeConfigured) ?? undefined,
    runtimeProvider: asString(record.runtimeProvider) ?? undefined,
    runtimeModel: asString(record.runtimeModel) ?? undefined,
    defaultModelKey: asNullableString(record.defaultModelKey) ?? undefined,
    modelOptions: Array.isArray(record.modelOptions)
      ? record.modelOptions.map(normalizeModelOption).filter((option): option is RuntimePiMetaDto['modelOptions'][number] => option !== null)
      : [],
    runtimeConfigError: asNullableString(record.runtimeConfigError) ?? undefined
  };
}

export {
  normalizeDataset,
  normalizeDatasetExample,
  normalizeDatasetExampleEffectiveEligibility,
  normalizeDatasetExampleReview,
  normalizeDatasetExpectedOutput,
  normalizeEvalActualOutput,
  normalizeEvalExampleResult,
  normalizeEvalExampleResultReview,
  normalizeEvalRun,
  normalizeEvalRunConfig,
  normalizeEvalRunSummary,
  normalizeMessage,
  normalizeRun,
  normalizeThread
};
