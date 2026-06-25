import type {
  ChatShareScopeType,
  ChatShareSnapshotPayloadFormat,
  ChatShareStatus,
  DatasetVisibility,
  EvalExampleResultStatus,
  EvalRunCompareTriageStatus,
  EvalRunStatus,
  AnswerCandidateKind,
  AnswerSelectionSource,
  MessagePartType,
  MessageRole,
  RunFeedbackValue,
  RunApprovalRequestStatus,
  RunUsageSummaryV1,
  RunStatus,
  ToolInvocationStatus,
  WorkspaceStatus,
  AgentProfileStatus,
  WorkspaceChangeSetStatus,
  WorkspaceFileChangeType,
  WorkspaceFileKind,
  WorkspaceSecretDelivery,
  WorkspaceSecretRefScope,
  WorkspaceSecretRefStatus,
  ProviderSessionBindingStatus,
  CloudRunEventPayloadV1,
  ArtifactMetadata
} from '@agent-infra/core';

export type IsoDateString = string;

export interface ThreadDto {
  id: string;
  appId: string;
  userId?: string | null;
  title?: string | null;
  status: 'active' | 'archived';
  metadata?: Record<string, unknown> | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  archivedAt?: IsoDateString | null;
}

export interface WorkspaceDto {
  id: string;
  appId: string;
  userId: string;
  title?: string | null;
  status: WorkspaceStatus;
  defaultForUser: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  archivedAt?: IsoDateString | null;
}

export interface AgentProfileDto {
  id: string;
  workspaceId: string;
  name: string;
  provider: string;
  model?: string | null;
  status: AgentProfileStatus;
  defaultForWorkspace: boolean;
  approvalPolicy?: string | null;
  sandboxMode?: string | null;
  toolAllowlist?: string[] | null;
  mcpServers?: Record<string, unknown>[] | null;
  skillRefs?: string[] | null;
  secretRefs?: string[] | null;
  metadata?: Record<string, unknown> | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  archivedAt?: IsoDateString | null;
}

export interface WorkspaceSecretRefDto {
  id: string;
  workspaceId: string;
  name: string;
  scope: WorkspaceSecretRefScope;
  delivery: WorkspaceSecretDelivery;
  status: WorkspaceSecretRefStatus;
  refKey: string;
  targetName?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  archivedAt?: IsoDateString | null;
}

export interface WorkspaceFileIndexEntryDto {
  id: string;
  workspaceId: string;
  path: string;
  kind: WorkspaceFileKind;
  sizeBytes?: number | null;
  mimeType?: string | null;
  contentHash?: string | null;
  previewCapability?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  deletedAt?: IsoDateString | null;
}

export interface WorkspaceChangeSetDto {
  id: string;
  workspaceId: string;
  threadId?: string | null;
  runId?: string | null;
  status: WorkspaceChangeSetStatus;
  baseSnapshotId?: string | null;
  nextSnapshotId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  resolvedAt?: IsoDateString | null;
}

export interface WorkspaceFileChangeDto {
  id: string;
  changeSetId: string;
  workspaceId: string;
  threadId?: string | null;
  runId?: string | null;
  path: string;
  changeType: WorkspaceFileChangeType;
  beforeContentHash?: string | null;
  afterContentHash?: string | null;
  artifactId?: string | null;
  metadata?: Record<string, unknown> | null;
  diff?: WorkspaceFileChangeDiffDto | null;
  createdAt: IsoDateString;
}

export interface WorkspaceFileChangeDiffDto {
  status: 'available' | 'unavailable';
  format?: 'unified' | null;
  reason?: string | null;
  beforePath?: string | null;
  afterPath?: string | null;
  unifiedDiff?: string | null;
  truncated?: boolean;
}

export interface ArtifactDto {
  id: string;
  threadId: string;
  runId?: string | null;
  kind: string;
  uri?: string | null;
  metadata?: ArtifactMetadata | null;
  createdAt: IsoDateString;
}

export type RunUsageDto = RunUsageSummaryV1 | Record<string, unknown>;

export interface RunDto {
  id: string;
  threadId: string;
  triggerMessageId?: string | null;
  provider?: string | null;
  model?: string | null;
  status: RunStatus;
  usage?: RunUsageDto | null;
  error?: string | null;
  startedAt?: IsoDateString | null;
  finishedAt?: IsoDateString | null;
  createdAt: IsoDateString;
}

export interface MessagePartDto {
  id: string;
  messageId: string;
  partIndex: number;
  type: MessagePartType;
  textValue?: string | null;
  jsonValue?: Record<string, unknown> | null;
  createdAt: IsoDateString;
}

export interface MessageDto {
  id: string;
  threadId: string;
  runId?: string | null;
  role: MessageRole;
  seq: number;
  status: 'created' | 'completed' | 'failed';
  metadata?: Record<string, unknown> | null;
  createdAt: IsoDateString;
  parts: MessagePartDto[];
}

export interface ToolInvocationDto {
  id: string;
  threadId: string;
  runId: string;
  messageId: string;
  toolName: string;
  toolCallId: string;
  status: ToolInvocationStatus;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  error?: string | null;
  startedAt?: IsoDateString | null;
  finishedAt?: IsoDateString | null;
  createdAt: IsoDateString;
}

export interface AnswerCandidateDto {
  id: string;
  threadId: string;
  triggerMessageId: string;
  runId: string;
  ordinal: number;
  kind: AnswerCandidateKind;
  createdAt: IsoDateString;
}

export interface AnswerSelectionDto {
  threadId: string;
  triggerMessageId: string;
  selectedRunId: string;
  source: AnswerSelectionSource;
  selectedByUserId?: string | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface RunFeedbackDto {
  id: string;
  threadId: string;
  triggerMessageId: string;
  runId: string;
  feedbackActorId: string;
  value: RunFeedbackValue;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface RunApprovalRequestDto {
  id: string;
  workspaceId?: string | null;
  threadId: string;
  runId: string;
  provider: string;
  permissionRequestId: string;
  action: string;
  status: RunApprovalRequestStatus;
  details?: Record<string, unknown> | null;
  decision?: 'approved' | 'denied' | null;
  decisionReason?: string | null;
  resolvedByActorId?: string | null;
  metadata?: Record<string, unknown> | null;
  expiresAt?: IsoDateString | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  resolvedAt?: IsoDateString | null;
}

export interface DatasetDto {
  id: string;
  appId: string;
  name: string;
  description?: string | null;
  visibility: DatasetVisibility;
  metadata?: Record<string, unknown> | null;
  createdByActorId?: string | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface DatasetExampleDto {
  id: string;
  datasetId: string;
  sourceRunId?: string | null;
  sourceThreadId?: string | null;
  triggerMessageId?: string | null;
  inputJson: Record<string, unknown>;
  baselineOutputJson?: Record<string, unknown> | null;
  expectedOutputJson?: Record<string, unknown> | null;
  expectedOutput?: DatasetExpectedOutputNormalizationDto;
  metadataJson?: Record<string, unknown> | null;
  review?: DatasetExampleReviewDto;
  effectiveEligibility?: DatasetExampleEffectiveEligibilityDto;
  contextSnapshotJson?: Record<string, unknown> | null;
  toolInvocationsSnapshotJson?: Record<string, unknown> | null;
  createdByActorId?: string | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface DatasetExpectedOutputV1Dto {
  schemaVersion: 1;
  kind: 'assistant_text';
  text: string;
  notes?: string | null;
}

export interface DatasetExpectedOutputNormalizationDto {
  state: 'missing' | 'valid' | 'invalid';
  expectedOutput: DatasetExpectedOutputV1Dto | null;
  reason?: string;
}

export type DatasetExampleReviewStatusDto = 'unreviewed' | 'needs_expected_output' | 'approved' | 'excluded';

export type DatasetExampleReviewEvalEligibilityDto = 'default' | 'include' | 'exclude';

export type DatasetExampleReviewExclusionReasonDto =
  | 'failure_case'
  | 'debug_case'
  | 'missing_expected_output'
  | 'not_representative'
  | 'sensitive_or_unsafe'
  | 'other';

export interface DatasetExampleReviewDto {
  status: DatasetExampleReviewStatusDto;
  evalEligibility: DatasetExampleReviewEvalEligibilityDto;
  exclusionReason?: DatasetExampleReviewExclusionReasonDto | null;
  reviewerNote?: string | null;
  reviewedByActorId?: string | null;
  reviewedAt?: IsoDateString | null;
}

export type DatasetExampleEffectiveEligibilityReasonDto =
  | 'eligible_default'
  | 'eligible_included_by_review'
  | 'ineligible_unreviewed'
  | 'ineligible_needs_expected_output'
  | 'ineligible_missing_expected_output'
  | 'ineligible_invalid_expected_output'
  | 'ineligible_excluded_by_review'
  | 'ineligible_capture_default'
  | 'ineligible_contradictory_review_state';

export interface DatasetExampleEffectiveEligibilityDto {
  eligible: boolean;
  reason: DatasetExampleEffectiveEligibilityReasonDto;
}

export type EvalRunStatusDto = EvalRunStatus;

export type EvalExampleResultStatusDto = EvalExampleResultStatus;

export interface EvalRunConfigV1Dto {
  schemaVersion: 1;
  kind: 'eval_run_config';
  selection: {
    policy: 'effective_eligible_v1';
  };
  execution: {
    mode: 'current_runtime';
    strategy: 'isolated_eval_thread';
    concurrency: 'serial';
  };
  runtime?: {
    provider?: string | null;
    model?: string | null;
    options?: Record<string, unknown> | null;
  } | null;
}

export type EvalExampleResultReviewStatusDto = 'unreviewed' | 'pass' | 'fail' | 'needs_review' | 'not_applicable';

export interface EvalExampleResultReviewDto {
  status: EvalExampleResultReviewStatusDto;
  reviewerNote?: string | null;
  reviewedByActorId?: string | null;
  reviewedAt?: IsoDateString | null;
}

export interface EvalRunSummaryV1Dto {
  schemaVersion: 1;
  kind: 'eval_run_summary';
  selection: {
    eligibleCount: number;
    ineligibleCount: number;
    ineligibleReasonCounts: Record<string, number>;
    selectedCount: number;
  };
  results: {
    statusCounts: Record<EvalExampleResultStatus, number>;
    reviewStatusCounts: Record<EvalExampleResultReviewStatusDto, number>;
    aggregateUsage?: RunUsageDto | null;
    durationMs?: number | null;
  };
}

export interface EvalActualOutputSnapshotV1Dto {
  schemaVersion: 1;
  kind: 'eval_run_output';
  outputRunId: string;
  evalThreadId: string;
  status: RunStatus;
  error?: string | null;
  assistantMessages: MessageDto[];
}

export interface EvalRunDto {
  id: string;
  appId: string;
  datasetId: string;
  status: EvalRunStatusDto;
  name?: string | null;
  configJson: Record<string, unknown>;
  config?: EvalRunConfigV1Dto | null;
  summaryJson: Record<string, unknown>;
  summary?: EvalRunSummaryV1Dto | null;
  error?: string | null;
  createdByActorId?: string | null;
  startedAt?: IsoDateString | null;
  finishedAt?: IsoDateString | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface EvalExampleResultDto {
  id: string;
  evalRunId: string;
  datasetExampleId: string;
  exampleOrdinal: number;
  status: EvalExampleResultStatusDto;
  evalThreadId?: string | null;
  outputRunId?: string | null;
  expectedOutputJson: Record<string, unknown>;
  actualOutputJson?: Record<string, unknown> | null;
  actualOutput?: EvalActualOutputSnapshotV1Dto | null;
  inputJson?: Record<string, unknown> | null;
  usageJson?: Record<string, unknown> | null;
  metadataJson?: Record<string, unknown> | null;
  review?: EvalExampleResultReviewDto;
  error?: string | null;
  startedAt?: IsoDateString | null;
  finishedAt?: IsoDateString | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export type EvalRunCompareTriageStatusV1Dto = EvalRunCompareTriageStatus;

export interface EvalRunCompareTriageDto {
  id: string;
  appId: string;
  datasetId: string;
  baselineEvalRunId: string;
  candidateEvalRunId: string;
  datasetExampleId: string;
  triageStatus: EvalRunCompareTriageStatusV1Dto;
  reviewerNote?: string | null;
  triagedByActorId?: string | null;
  triagedAt: IsoDateString;
  observedProjectionKind: 'eval_run_compare';
  observedProjectionSchemaVersion: 1;
  observedCompareStrategy?: string | null;
  observedOutcome: string;
  observedReason: string;
  observedBaselineResultId?: string | null;
  observedCandidateResultId?: string | null;
  observedBaselineResultStatus?: string | null;
  observedCandidateResultStatus?: string | null;
  observedBaselineReviewStatus?: string | null;
  observedCandidateReviewStatus?: string | null;
  observedBaselineSignal?: string | null;
  observedCandidateSignal?: string | null;
  observedBaselineComparisonOutcome?: string | null;
  observedCandidateComparisonOutcome?: string | null;
  observedBaselineComparisonReason?: string | null;
  observedCandidateComparisonReason?: string | null;
  observedResultComparisonStrategy?: string | null;
  stale: boolean;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface RunEventDto {
  id: string;
  threadId: string;
  runId: string;
  seq: number;
  type: string;
  payload: Record<string, unknown> | null;
  createdAt: IsoDateString;
}

export interface CloudRunEventDto extends Omit<RunEventDto, 'type' | 'payload'> {
  type: CloudRunEventPayloadV1['type'];
  payload: CloudRunEventPayloadV1;
}

export interface ProviderSessionBindingDto {
  id: string;
  workspaceId: string;
  threadId: string;
  runId?: string | null;
  provider: string;
  providerSessionId: string;
  providerProjectKey?: string | null;
  status: ProviderSessionBindingStatus;
  metadata?: Record<string, unknown> | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  archivedAt?: IsoDateString | null;
}

export interface ProviderTranscriptEntryDto {
  id: string;
  workspaceId: string;
  threadId?: string | null;
  runId?: string | null;
  provider: string;
  providerSessionId: string;
  providerProjectKey?: string | null;
  providerEntryId?: string | null;
  ordinal: number;
  entryType: string;
  rawJson: unknown;
  createdAt: IsoDateString;
}

export interface ProviderTranscriptSummaryDto {
  entryCount: number;
  entryTypes: Record<string, number>;
  firstOrdinal: number | null;
  lastOrdinal: number | null;
  lastRunId: string | null;
}

export interface ProviderTranscriptReplayEntryRefDto {
  entryType: string;
  ordinal: number;
  providerEntryId: string | null;
  runId: string | null;
  summary?: string | null;
}

export interface ProviderTranscriptReplayPlanDto {
  available: boolean;
  entryCount: number;
  entries: ProviderTranscriptReplayEntryRefDto[];
  fromOrdinal: number | null;
  sourceRunIds: string[];
  toOrdinal: number | null;
}

export interface ProviderSessionRecommendedActionDto {
  action: 'resume' | 'archive_and_restart' | 'fork' | 'compact' | 'replay_transcript';
  reason: string;
  status: 'manual' | 'planned' | 'supported';
}

export interface ProviderSessionSnapshotDto {
  binding: ProviderSessionBindingDto;
  replayPlan: ProviderTranscriptReplayPlanDto;
  recommendedActions: ProviderSessionRecommendedActionDto[];
  transcriptSummary: ProviderTranscriptSummaryDto;
}

export interface ProviderSessionRecoveryStrategyDto {
  action: 'resume' | 'archive_and_restart' | 'fork' | 'compact' | 'replay_transcript';
  status: 'manual' | 'planned' | 'supported';
  notes?: string | null;
}

export interface ProviderSessionRecoveryProviderManifestDto {
  provider: string;
  strategies: ProviderSessionRecoveryStrategyDto[];
}

export interface ProviderSessionRecoveryReportDto {
  schemaVersion: 1;
  threadId: string;
  providerManifests: ProviderSessionRecoveryProviderManifestDto[];
  sessions: ProviderSessionSnapshotDto[];
  lifecycleEvents: CloudRunEventDto[];
  recoveryEvents: CloudRunEventDto[];
  sourceRuns: RunDto[];
  strategyCounts: Record<string, number>;
}

export interface RunObservabilityDto {
  schemaVersion: 1;
  run: RunDto;
  events: CloudRunEventDto[];
  approvalRequests: RunApprovalRequestDto[];
  toolInvocations: ToolInvocationDto[];
  workspaceFileChanges: WorkspaceFileChangeDto[];
  providerTranscript: ProviderTranscriptEntryDto[];
}

export interface RunTimelineProjectionDto {
  schemaVersion: 1;
  items: RunTimelineItemDto[];
}

export type RunTimelineItemDto =
  | {
      kind: 'run_lifecycle';
      phase: 'started' | 'completed' | 'failed' | 'cancelled';
      runEventId: string;
      seq: number;
    }
  | {
      kind: 'assistant_message';
      phase: 'started' | 'completed' | 'failed';
      runEventId: string;
      seq: number;
    }
  | {
      kind: 'tool_invocation';
      phase: 'started' | 'completed' | 'failed';
      toolCallId: string;
      toolName: string;
      toolInvocationId?: string | null;
      runEventId: string;
      seq: number;
    }
  | {
      kind: 'runtime_error';
      message: string;
      runEventId: string;
      seq: number;
    }
  | {
      kind: 'unknown_event';
      type: string;
      runEventId: string;
      seq: number;
    };

export type TraceSpanKindDto = 'agent' | 'assistant_message' | 'tool_invocation' | 'runtime_error' | 'unknown_event';

export type TraceSpanStatusDto = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';

export type TraceProjectionDiagnosticCodeDto =
  | 'unknown_event'
  | 'orphan_event'
  | 'missing_tool_invocation'
  | 'unpaired_message_start'
  | 'unpaired_message_end'
  | 'unpaired_tool_start'
  | 'unpaired_tool_end'
  | 'nonterminal_child_on_terminal_run'
  | 'negative_duration_clamped';

export type TraceSpanSourceRefDto =
  | {
      type: 'run';
      id: string;
    }
  | {
      type: 'run_event';
      id: string;
      seq: number;
      eventType: string;
    }
  | {
      type: 'tool_invocation';
      id: string;
      toolCallId: string;
    };

export interface TraceSpanUsageRefDto {
  source: 'run.usage';
  runId: string;
}

export interface TraceSpanToolDto {
  toolInvocationId?: string | null;
  toolCallId: string;
  toolName: string;
}

export interface TraceSpanErrorDto {
  message: string;
}

export interface TraceProjectionDiagnosticDto {
  code: TraceProjectionDiagnosticCodeDto;
  message: string;
  sourceRefs: TraceSpanSourceRefDto[];
}

export interface TraceSpanProjectionDiagnosticsDto {
  unknownEventCount: number;
  orphanEventCount: number;
  warnings: TraceProjectionDiagnosticDto[];
}

export interface TraceSpanDto {
  schemaVersion: 1;
  id: string;
  traceId: string;
  parentSpanId: string | null;
  kind: TraceSpanKindDto;
  name: string;
  status: TraceSpanStatusDto;
  appId: string;
  threadId: string;
  runId: string;
  order: number;
  startedAt: IsoDateString | null;
  finishedAt: IsoDateString | null;
  durationMs: number | null;
  provider?: string | null;
  model?: string | null;
  usageRef?: TraceSpanUsageRefDto | null;
  tool?: TraceSpanToolDto | null;
  error?: TraceSpanErrorDto | null;
  sourceRefs: TraceSpanSourceRefDto[];
  metadata?: Record<string, unknown> | null;
}

export interface TraceSpanProjectionDto {
  schemaVersion: 1;
  traceId: string;
  rootSpanId: string;
  appId: string;
  threadId: string;
  runId: string;
  status: TraceSpanStatusDto;
  startedAt: IsoDateString | null;
  finishedAt: IsoDateString | null;
  durationMs: number | null;
  spans: TraceSpanDto[];
  diagnostics: TraceSpanProjectionDiagnosticsDto;
}

export interface RuntimePiModelOptionDto {
  key: string;
  provider: string;
  model: string;
  label: string;
  description: string;
}

export interface RuntimePiMetaDto {
  dbMode: string;
  dbConnection: string;
  runtimeConfigured: boolean;
  runtimeProvider: string;
  runtimeModel: string;
  defaultModelKey: string | null;
  modelOptions: RuntimePiModelOptionDto[];
  runtimeConfigError: string | null;
}

export type RuntimePiReasoningEffortDto = 'high' | 'max';

export type RunEventSummaryDto = Pick<RunEventDto, 'seq' | 'type'>;

export type ToolInvocationSummaryDto = Pick<ToolInvocationDto, 'id' | 'toolName' | 'status'>;

export interface CreateThreadRequestDto {
  title?: string;
}

export interface RenameThreadRequestDto {
  title: string;
}

export interface GetThreadMessagesRequestDto {
  threadId: string;
  limit?: number;
  before?: string;
  after?: string;
}

export interface RunTextTurnRequestDto {
  text: string;
  provider?: string;
  model?: string;
  thinkingEnabled?: boolean;
  reasoningEffort?: RuntimePiReasoningEffortDto;
  webSearchEnabled?: boolean;
  answerMode?: 'single' | 'dual';
  candidateCount?: 1 | 2;
}

export interface StartAnswerCandidatesRequestDto extends RunTextTurnRequestDto {
  answerMode?: 'dual';
  candidateCount: 2;
}

export interface SelectAnswerCandidateRequestDto {
  triggerMessageId: string;
}

export interface SetRunFeedbackRequestDto {
  triggerMessageId?: string | null;
  value: RunFeedbackValue;
}

export interface ResolveRunApprovalRequestDto {
  decision: 'approved' | 'denied';
  reason?: string | null;
}

export interface CreateDatasetRequestDto {
  name: string;
  description?: string | null;
  visibility?: DatasetVisibility;
  metadata?: Record<string, unknown> | null;
}

export interface CaptureDatasetExampleFromRunRequestDto {
  sourceRunId: string;
  expectedOutputJson?: Record<string, unknown> | null;
  metadataJson?: Record<string, unknown> | null;
  omitToolInvocations?: boolean;
  toolInvocationOmissionReason?: string | null;
}

export interface UpdateDatasetExampleExpectedOutputRequestDto {
  expectedOutputJson: DatasetExpectedOutputV1Dto | null;
}

export interface UpdateDatasetExampleReviewRequestDto {
  status?: DatasetExampleReviewStatusDto;
  evalEligibility?: DatasetExampleReviewEvalEligibilityDto;
  exclusionReason?: DatasetExampleReviewExclusionReasonDto | null;
  reviewerNote?: string | null;
}

export interface CreateEvalRunRequestDto {
  name?: string | null;
  provider?: string | null;
  model?: string | null;
  runtimeOptions?: Record<string, unknown> | null;
}

export interface UpdateEvalExampleResultReviewRequestDto {
  status?: EvalExampleResultReviewStatusDto;
  reviewerNote?: string | null;
}

export interface UpdateEvalRunCompareTriageRequestDto {
  status: EvalRunCompareTriageStatusV1Dto;
  reviewerNote?: string | null;
}

export interface AnswerSelectionResponseDto {
  answerSelection?: AnswerSelectionDto;
  error?: string;
}

export interface DatasetsResponseDto {
  datasets: DatasetDto[];
  error?: string;
}

export interface DatasetResponseDto {
  dataset?: DatasetDto;
  error?: string;
}

export interface DatasetExamplesResponseDto {
  examples: DatasetExampleDto[];
  error?: string;
}

export interface DatasetExampleResponseDto {
  example?: DatasetExampleDto;
  error?: string;
}

export interface CaptureDatasetExampleResponseDto {
  dataset?: DatasetDto;
  example?: DatasetExampleDto;
  error?: string;
}

export interface EvalRunsResponseDto {
  evalRuns: EvalRunDto[];
  error?: string;
}

export interface EvalRunResponseDto {
  evalRun?: EvalRunDto;
  error?: string;
}

export interface EvalExampleResultsResponseDto {
  results: EvalExampleResultDto[];
  error?: string;
}

export interface EvalExampleResultResponseDto {
  result?: EvalExampleResultDto;
  error?: string;
}

export interface EvalRunCompareTriageListResponseDto {
  triageRows: EvalRunCompareTriageDto[];
  error?: string;
}

export interface EvalRunCompareTriageResponseDto {
  triage?: EvalRunCompareTriageDto | null;
  error?: string;
}

export interface RunFeedbackResponseDto {
  runFeedback?: RunFeedbackDto | null;
  error?: string;
}

export interface RunApprovalRequestsResponseDto {
  approvalRequests?: RunApprovalRequestDto[];
  error?: string;
}

export interface RunApprovalRequestResponseDto {
  approvalRequest?: RunApprovalRequestDto;
  error?: string;
}

export interface CancelRunResponseDto {
  run?: RunDto;
  error?: string;
}

export interface GetRunTimelineRequestDto {
  runId: string;
}

export interface GetRunTraceRequestDto {
  runId: string;
}

export interface GetThreadRunsRequestDto {
  threadId: string;
  limit?: number;
}

export interface ThreadsResponseDto {
  threads: ThreadDto[];
  error?: string;
}

export interface CreateThreadResponseDto {
  thread?: ThreadDto;
  error?: string;
}

export interface UpdateThreadResponseDto {
  thread?: ThreadDto;
  error?: string;
}

export interface ThreadMessagesResponseDto {
  messages?: MessageDto[];
  pageInfo?: ThreadMessagesPageInfoDto;
  activeRun?: RunDto | null;
  activeRuns?: RunDto[];
  answerCandidates?: AnswerCandidateDto[];
  answerSelections?: AnswerSelectionDto[];
  runFeedback?: RunFeedbackDto[];
  error?: string;
}

export interface ThreadMessagesPageInfoDto {
  hasOlder: boolean;
  hasNewer: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

export interface ChatShareDto {
  id: string;
  publicId: string;
  sourceThreadId: string;
  scopeType: ChatShareScopeType;
  status: ChatShareStatus;
  snapshotId: string;
  createdAt: IsoDateString;
  revokedAt?: IsoDateString | null;
}

export interface ChatShareSnapshotDto {
  id: string;
  shareId: string;
  payloadFormat: ChatShareSnapshotPayloadFormat;
  payloadVersion: number;
  payloadJson?: Record<string, unknown> | null;
  messageCount: number;
  startSeq?: number | null;
  endSeq?: number | null;
  createdAt: IsoDateString;
}

export interface SharedMessagePartDto {
  id: string;
  messageId: string;
  partIndex: number;
  type: MessagePartType;
  textValue?: string | null;
  jsonValue?: Record<string, unknown> | null;
  createdAt: IsoDateString;
}

export interface SharedMessageDto {
  id: string;
  runId?: string | null;
  role: MessageRole;
  seq: number;
  createdAt: IsoDateString;
  parts: SharedMessagePartDto[];
}

export interface SharedThreadSnapshotDto {
  payloadFormat: ChatShareSnapshotPayloadFormat;
  payloadVersion: number;
  title?: string | null;
  messages: SharedMessageDto[];
  searchBundles?: Record<string, unknown> | null;
}

export interface ThreadRunListItemDto {
  run: RunDto;
  triggerMessage: {
    id: string;
    seq: number;
    preview: string | null;
  } | null;
}

export interface ThreadRunsResponseDto {
  items: ThreadRunListItemDto[];
  error?: string;
}

export interface CreateThreadShareResponseDto {
  share?: ChatShareDto;
  error?: string;
}

export interface ThreadShareStateResponseDto {
  share?: ChatShareDto | null;
  error?: string;
}

export interface PublicChatShareDto {
  publicId: string;
  scopeType: ChatShareScopeType;
  status: Extract<ChatShareStatus, 'active'>;
  createdAt: IsoDateString;
  snapshot: SharedThreadSnapshotDto;
}

export interface PublicChatShareResponseDto {
  share?: PublicChatShareDto;
  error?: string;
}

export interface RevokeChatShareResponseDto {
  share?: ChatShareDto;
  error?: string;
}

export interface RunTextTurnResponseDto {
  run: RunDto | null;
  messages: MessageDto[];
  debug?: {
    runEventCount: number;
    toolInvocationCount: number;
  };
  error?: string;
}

export interface RunTimelineResponseDto {
  run: RunDto | null;
  runEvents: RunEventDto[];
  toolInvocations: ToolInvocationDto[];
  projection?: RunTimelineProjectionDto | null;
  error?: string;
}

export interface RunTraceResponseDto {
  run: RunDto | null;
  projection?: TraceSpanProjectionDto | null;
  error?: string;
}

export interface RunStreamReadyEventDto {
  type: 'run.ready';
  runId: string;
  run: RunDto;
  userMessage: MessageDto;
  triggerMessageId?: string;
  candidateId?: string;
  ordinal?: number;
  kind?: AnswerCandidateKind;
}

export interface RunStreamStateEventDto {
  type: 'run.state';
  runId: string;
  run: RunDto;
}

export interface RunStreamAssistantDeltaDto {
  messageId: string;
  kind: 'assistant_delta';
  // The newly appended assistant text for the current message segment.
  textDelta: string;
}

export interface RunStreamAssistantReplaceDto {
  messageId: string;
  kind: 'assistant_replace';
  // A full replacement for the current visible assistant text when the upstream
  // partial message is no longer a simple prefix extension.
  textSnapshot: string;
}

export interface RunStreamThinkingDeltaDto {
  messageId: string;
  kind: 'thinking_delta';
  // The newly appended assistant thinking text for the current message segment.
  thinkingDelta: string;
}

export interface RunStreamThinkingReplaceDto {
  messageId: string;
  kind: 'thinking_replace';
  // A full replacement for the current visible thinking text when the upstream
  // partial message is no longer a simple prefix extension.
  thinkingSnapshot: string;
}

export interface RunStreamToolEventDto {
  messageId: string;
  kind: 'tool_event';
  toolCallId: string;
  toolName: string;
  phase: 'start' | 'completed' | 'failed';
  // Tool lifecycle is streamed separately from assistant text to avoid
  // back-writing already visible commentary during tool execution.
  input?: Record<string, unknown> | null;
}

export type RunStreamAssistantPayloadDto =
  | RunStreamAssistantDeltaDto
  | RunStreamAssistantReplaceDto
  | RunStreamThinkingDeltaDto
  | RunStreamThinkingReplaceDto
  | RunStreamToolEventDto;

export interface RunStreamAssistantEventDto {
  type: 'run.assistant';
  runId: string;
  assistant: RunStreamAssistantPayloadDto;
}

export interface RunStreamCompletedEventDto {
  type: 'run.completed';
  runId: string;
  run: RunDto;
}

export interface RunStreamFailedEventDto {
  type: 'run.failed';
  runId: string;
  run: RunDto | null;
  error: string;
}

export type RunStreamEventDto =
  | RunStreamReadyEventDto
  | RunStreamStateEventDto
  | RunStreamAssistantEventDto
  | RunStreamCompletedEventDto
  | RunStreamFailedEventDto;

export type RunStreamSnapshotEventTypeDto = 'start' | 'thinking' | 'streaming' | 'searching';

export interface RunStreamAssistantSnapshotToolDto {
  toolCallId: string;
  toolName: string;
  phase: 'start' | 'completed' | 'failed';
  input?: Record<string, unknown> | null;
}

export interface RunStreamAssistantSnapshotSegmentDto {
  id: string;
  messageId: string;
  text: string;
  reasoning: string | null;
  tools: RunStreamAssistantSnapshotToolDto[];
  eventType: RunStreamSnapshotEventTypeDto;
}

export interface RunStreamAssistantSnapshotDto {
  liveDraftId: string;
  messageId: string | null;
  text: string;
  reasoning: string | null;
  activeTools: RunStreamAssistantSnapshotToolDto[];
  eventType: RunStreamSnapshotEventTypeDto;
  segments: RunStreamAssistantSnapshotSegmentDto[];
}

export interface RunStreamSnapshotEventDto {
  type: 'run.snapshot';
  runId: string;
  run: RunDto;
  version: number;
  assistant: RunStreamAssistantSnapshotDto | null;
}

export interface RunAttachStreamStateEventDto extends RunStreamStateEventDto {
  version: number;
}

export interface RunAttachStreamAssistantEventDto extends RunStreamAssistantEventDto {
  version: number;
}

export interface RunAttachStreamCompletedEventDto extends RunStreamCompletedEventDto {
  version: number;
}

export interface RunAttachStreamFailedEventDto extends RunStreamFailedEventDto {
  version: number;
}

export type RunAttachStreamUnavailableReasonDto =
  | 'run_not_found'
  | 'run_not_active'
  | 'stream_session_gone'
  | 'thread_run_mismatch'
  | 'not_authorized';

export interface RunAttachStreamUnavailableEventDto {
  type: 'run.attach_unavailable';
  runId: string;
  reason: RunAttachStreamUnavailableReasonDto;
  run?: RunDto | null;
  message?: string | null;
}

export type RunAttachStreamEventDto =
  | RunStreamSnapshotEventDto
  | RunAttachStreamStateEventDto
  | RunAttachStreamAssistantEventDto
  | RunAttachStreamCompletedEventDto
  | RunAttachStreamFailedEventDto
  | RunAttachStreamUnavailableEventDto;

export type RuntimePiThreadsResponseDto = ThreadsResponseDto;
export type RuntimePiCreateThreadResponseDto = CreateThreadResponseDto;
export type RuntimePiMessagesResponseDto = ThreadMessagesResponseDto;
export type RuntimePiRunResponseDto = RunTextTurnResponseDto;
