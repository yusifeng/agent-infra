export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type ToolInvocationStatus = 'pending' | 'running' | 'completed' | 'failed';

export type MessagePartType = 'text' | 'tool-call' | 'tool-result' | 'reasoning' | 'data';

export type WorkspaceStatus = 'active' | 'archived';

export type AgentProfileStatus = 'active' | 'archived';

export type WorkspaceSecretRefStatus = 'active' | 'archived';

export type WorkspaceSecretRefScope = 'tenant' | 'user' | 'workspace';

export type WorkspaceSecretDelivery = 'env' | 'file' | 'proxy';

export type WorkspaceFileKind = 'file' | 'directory';

export type WorkspaceChangeSetStatus = 'pending' | 'merged' | 'discarded';

export type WorkspaceFileChangeType = 'created' | 'modified' | 'deleted';

export type ProviderSessionBindingStatus = 'active' | 'forked' | 'archived';

export type RunApprovalRequestStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'cancelled';

export type CloudAgentWorkerStatus = 'active' | 'draining' | 'stopped';

export type ChatShareScopeType = 'thread';

export type ChatShareStatus = 'active' | 'revoked';

export type ChatShareSnapshotPayloadFormat = 'messages_v1';

export type AnswerCandidateKind = 'primary' | 'alternative';

export type AnswerSelectionSource = 'default' | 'user' | 'system_fallback';

export type RunFeedbackValue = 'thumbs_up' | 'thumbs_down';

export type RunUsageNormalizationStatus = 'complete' | 'partial' | 'missing' | 'malformed';

export type DatasetVisibility = 'private' | 'app';

export type EvalRunStatus = 'queued' | 'running' | 'completed' | 'failed';

export type EvalExampleResultStatus = 'queued' | 'running' | 'completed' | 'failed' | 'skipped';

export type EvalRunCompareTriageStatus = 'accepted' | 'regression' | 'expected_changed' | 'needs_review' | 'ignored';

export interface RunUsageTokensV1 {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  reasoning?: number;
  total?: number;
}

export interface RunUsageEstimatedCostV1 {
  currency: string;
  amountMicros: number;
  source: string;
  version?: string | null;
}

export interface RunUsageSummaryV1 {
  schemaVersion: 1;
  provider?: string | null;
  model?: string | null;
  normalizationStatus: RunUsageNormalizationStatus;
  tokens: RunUsageTokensV1;
  estimatedCost?: RunUsageEstimatedCostV1 | null;
  rawProviderUsage?: Record<string, unknown> | null;
}

export type RunUsage = RunUsageSummaryV1 | Record<string, unknown>;

export interface Workspace {
  id: string;
  appId: string;
  userId: string;
  title?: string | null;
  status: WorkspaceStatus;
  defaultForUser: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | null;
}

export interface AgentProfile {
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
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | null;
}

export interface WorkspaceSecretRef {
  id: string;
  workspaceId: string;
  name: string;
  scope: WorkspaceSecretRefScope;
  delivery: WorkspaceSecretDelivery;
  status: WorkspaceSecretRefStatus;
  refKey: string;
  targetName?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | null;
}

export interface WorkspaceFileIndexEntry {
  id: string;
  workspaceId: string;
  path: string;
  kind: WorkspaceFileKind;
  sizeBytes?: number | null;
  mimeType?: string | null;
  contentHash?: string | null;
  previewCapability?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export interface WorkspaceChangeSet {
  id: string;
  workspaceId: string;
  threadId?: string | null;
  runId?: string | null;
  status: WorkspaceChangeSetStatus;
  baseSnapshotId?: string | null;
  nextSnapshotId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date | null;
}

export interface WorkspaceFileChange {
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
  createdAt: Date;
}

export interface CloudArtifactMetadataV1 {
  schemaVersion: 1;
  workspaceId?: string | null;
  producedByRunId?: string | null;
  sourcePath?: string | null;
  contentHash?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  previewCapability?: string | null;
}

export type ArtifactMetadata = CloudArtifactMetadataV1 | Record<string, unknown>;

export interface Thread {
  id: string;
  appId: string;
  userId?: string | null;
  title?: string | null;
  status: 'active' | 'archived';
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | null;
}

export interface Run {
  id: string;
  threadId: string;
  triggerMessageId?: string | null;
  provider?: string | null;
  model?: string | null;
  status: RunStatus;
  usage?: RunUsage | null;
  error?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  claimOwner?: string | null;
  claimExpiresAt?: Date | null;
  nextAttemptAt?: Date | null;
  attemptCount?: number;
  createdAt: Date;
}

export type RunStatusCount = Partial<Record<RunStatus, number>>;

export interface CloudAgentWorker {
  id: string;
  appId: string;
  queueProvider: string;
  status: CloudAgentWorkerStatus;
  concurrency: number;
  activeRunIds?: string[] | null;
  metadata?: Record<string, unknown> | null;
  startedAt: Date;
  lastHeartbeatAt: Date;
  stoppedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnswerCandidate {
  id: string;
  threadId: string;
  triggerMessageId: string;
  runId: string;
  ordinal: number;
  kind: AnswerCandidateKind;
  createdAt: Date;
}

export interface AnswerSelection {
  threadId: string;
  triggerMessageId: string;
  selectedRunId: string;
  source: AnswerSelectionSource;
  selectedByUserId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RunFeedback {
  id: string;
  threadId: string;
  triggerMessageId: string;
  runId: string;
  feedbackActorId: string;
  value: RunFeedbackValue;
  createdAt: Date;
  updatedAt: Date;
}

export interface Dataset {
  id: string;
  appId: string;
  name: string;
  description?: string | null;
  visibility: DatasetVisibility;
  metadata?: Record<string, unknown> | null;
  createdByActorId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DatasetExample {
  id: string;
  datasetId: string;
  sourceRunId?: string | null;
  sourceThreadId?: string | null;
  triggerMessageId?: string | null;
  inputJson: Record<string, unknown>;
  baselineOutputJson?: Record<string, unknown> | null;
  expectedOutputJson?: Record<string, unknown> | null;
  metadataJson?: Record<string, unknown> | null;
  contextSnapshotJson?: Record<string, unknown> | null;
  toolInvocationsSnapshotJson?: Record<string, unknown> | null;
  createdByActorId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EvalRun {
  id: string;
  appId: string;
  datasetId: string;
  status: EvalRunStatus;
  name?: string | null;
  configJson: Record<string, unknown>;
  summaryJson: Record<string, unknown>;
  error?: string | null;
  createdByActorId?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EvalExampleResult {
  id: string;
  evalRunId: string;
  datasetExampleId: string;
  exampleOrdinal: number;
  status: EvalExampleResultStatus;
  evalThreadId?: string | null;
  outputRunId?: string | null;
  expectedOutputJson: Record<string, unknown>;
  actualOutputJson?: Record<string, unknown> | null;
  inputJson?: Record<string, unknown> | null;
  usageJson?: Record<string, unknown> | null;
  metadataJson?: Record<string, unknown> | null;
  error?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EvalRunCompareTriage {
  id: string;
  appId: string;
  datasetId: string;
  baselineEvalRunId: string;
  candidateEvalRunId: string;
  datasetExampleId: string;
  triageStatus: EvalRunCompareTriageStatus;
  reviewerNote?: string | null;
  triagedByActorId?: string | null;
  triagedAt: Date;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface RunEvent {
  id: string;
  threadId: string;
  runId: string;
  seq: number;
  type: string;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

export type CloudRunEventType =
  | 'run_started'
  | 'agent_message_delta'
  | 'tool_call_started'
  | 'tool_call_delta'
  | 'tool_call_completed'
  | 'tool_call_failed'
  | 'file_change_detected'
  | 'permission_requested'
  | 'approval_resolved'
  | 'usage_updated'
  | 'provider_session_bound'
  | 'provider_session_lifecycle'
  | 'provider_session_recovery'
  | 'secret_broker_audit'
  | 'mcp_profile_audit'
  | 'run_requeued'
  | 'run_completed'
  | 'run_failed'
  | 'run_cancelled';

export interface CloudRunEventPayloadBaseV1 {
  schemaVersion: 1;
  provider?: string | null;
  model?: string | null;
  workspaceId?: string | null;
  threadId?: string | null;
  runId?: string | null;
}

export interface RunStartedEventPayloadV1 extends CloudRunEventPayloadBaseV1 {
  type: 'run_started';
  sandboxProvider?: string | null;
  sandboxSessionId?: string | null;
  cwd?: string | null;
}

export interface AgentMessageDeltaEventPayloadV1 extends CloudRunEventPayloadBaseV1 {
  type: 'agent_message_delta';
  messageId?: string | null;
  delta: string;
}

export interface ToolCallStartedEventPayloadV1 extends CloudRunEventPayloadBaseV1 {
  type: 'tool_call_started';
  toolCallId: string;
  toolName: string;
  input?: Record<string, unknown> | null;
  cwd?: string | null;
}

export interface ToolCallDeltaEventPayloadV1 extends CloudRunEventPayloadBaseV1 {
  type: 'tool_call_delta';
  toolCallId: string;
  stream?: 'stdout' | 'stderr' | 'patch' | 'other' | null;
  delta: string;
}

export interface ToolCallCompletedEventPayloadV1 extends CloudRunEventPayloadBaseV1 {
  type: 'tool_call_completed';
  toolCallId: string;
  output?: Record<string, unknown> | null;
  exitCode?: number | null;
}

export interface ToolCallFailedEventPayloadV1 extends CloudRunEventPayloadBaseV1 {
  type: 'tool_call_failed';
  toolCallId: string;
  error: string;
}

export interface FileChangeDetectedEventPayloadV1 extends CloudRunEventPayloadBaseV1 {
  type: 'file_change_detected';
  path: string;
  changeType: 'created' | 'modified' | 'deleted';
  toolCallId?: string | null;
  contentHash?: string | null;
}

export interface PermissionRequestedEventPayloadV1 extends CloudRunEventPayloadBaseV1 {
  type: 'permission_requested';
  permissionRequestId: string;
  action: string;
  details?: Record<string, unknown> | null;
}

export interface ApprovalResolvedEventPayloadV1 extends CloudRunEventPayloadBaseV1 {
  type: 'approval_resolved';
  permissionRequestId: string;
  decision: 'approved' | 'denied';
  status?: 'approved' | 'denied' | 'expired' | 'cancelled' | null;
  reason?: string | null;
  resolvedByActorId?: string | null;
}

export interface UsageUpdatedEventPayloadV1 extends CloudRunEventPayloadBaseV1 {
  type: 'usage_updated';
  usage: RunUsageSummaryV1 | Record<string, unknown>;
}

export interface ProviderSessionBoundEventPayloadV1 extends CloudRunEventPayloadBaseV1 {
  type: 'provider_session_bound';
  provider: string;
  providerSessionId: string;
  providerProjectKey?: string | null;
}

export interface ProviderSessionLifecycleEventPayloadV1 extends CloudRunEventPayloadBaseV1 {
  type: 'provider_session_lifecycle';
  provider: string;
  providerSessionId: string;
  providerProjectKey?: string | null;
  action: 'archive' | 'compact' | 'fork' | 'replay';
  bindingStatus: ProviderSessionBindingStatus;
  reason?: string | null;
  actorId?: string | null;
  replayAvailable?: boolean;
  transcriptEntryCount?: number;
}

export interface ProviderSessionRecoveryEventPayloadV1 extends CloudRunEventPayloadBaseV1 {
  type: 'provider_session_recovery';
  provider: string;
  strategy: 'archive_and_restart' | 'fork' | 'compact' | 'replay_transcript';
  reason: string;
  previousProviderSessionId?: string | null;
  newProviderSessionId?: string | null;
}

export interface SecretBrokerAuditEventPayloadV1 extends CloudRunEventPayloadBaseV1 {
  type: 'secret_broker_audit';
  purpose: 'agent' | 'mcp' | 'tool' | 'storage';
  refId: string;
  refName: string;
  refKey?: string | null;
  delivery?: 'env' | 'file' | 'proxy' | null;
  targetName?: string | null;
  decision: 'issued' | 'rejected';
  reason?: string | null;
  issuedAt: string;
  expiresAt?: string | null;
}

export interface McpProfileAuditEntryV1 {
  name?: string | null;
  transport?: string | null;
  decision: 'enabled' | 'skipped';
  reason?: string | null;
  target?: string | null;
  toolAllowlist?: string[] | null;
}

export interface SkillProfileAuditEntryV1 {
  ref: string;
  decision: 'enabled' | 'skipped';
  reason?: string | null;
  manifestPath?: string | null;
  materialization?: 'manifest' | null;
}

export interface McpProfileAuditEventPayloadV1 extends CloudRunEventPayloadBaseV1 {
  type: 'mcp_profile_audit';
  profileId?: string | null;
  executionMode: 'docker' | 'local';
  strictMcpConfig: boolean;
  remoteHostAllowlist?: string[] | null;
  stdioCommandAllowlist?: string[] | null;
  skillRefAllowlist?: string[] | null;
  servers: McpProfileAuditEntryV1[];
  skills: SkillProfileAuditEntryV1[];
}

export interface RunCompletedEventPayloadV1 extends CloudRunEventPayloadBaseV1 {
  type: 'run_completed';
  finishReason?: string | null;
}

export interface RunRequeuedEventPayloadV1 extends CloudRunEventPayloadBaseV1 {
  type: 'run_requeued';
  reason?: string | null;
  requeuedByActorId?: string | null;
  nextAttemptAt?: string | null;
}

export interface RunFailedEventPayloadV1 extends CloudRunEventPayloadBaseV1 {
  type: 'run_failed';
  error: string;
}

export interface RunCancelledEventPayloadV1 extends CloudRunEventPayloadBaseV1 {
  type: 'run_cancelled';
  reason?: string | null;
  cancelledByActorId?: string | null;
}

export type CloudRunEventPayloadV1 =
  | RunStartedEventPayloadV1
  | AgentMessageDeltaEventPayloadV1
  | ToolCallStartedEventPayloadV1
  | ToolCallDeltaEventPayloadV1
  | ToolCallCompletedEventPayloadV1
  | ToolCallFailedEventPayloadV1
  | FileChangeDetectedEventPayloadV1
  | PermissionRequestedEventPayloadV1
  | ApprovalResolvedEventPayloadV1
  | UsageUpdatedEventPayloadV1
  | ProviderSessionBoundEventPayloadV1
  | ProviderSessionLifecycleEventPayloadV1
  | ProviderSessionRecoveryEventPayloadV1
  | SecretBrokerAuditEventPayloadV1
  | McpProfileAuditEventPayloadV1
  | RunRequeuedEventPayloadV1
  | RunCompletedEventPayloadV1
  | RunFailedEventPayloadV1
  | RunCancelledEventPayloadV1;

export type CloudRunEvent = Omit<RunEvent, 'type' | 'payload'> & {
  type: CloudRunEventType;
  payload: CloudRunEventPayloadV1;
};

export interface Message {
  id: string;
  threadId: string;
  runId?: string | null;
  role: MessageRole;
  seq: number;
  status: 'created' | 'completed' | 'failed';
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}

export interface MessagePart {
  id: string;
  messageId: string;
  partIndex: number;
  type: MessagePartType;
  textValue?: string | null;
  jsonValue?: Record<string, unknown> | null;
  createdAt: Date;
}

export interface ToolInvocation {
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
  startedAt?: Date | null;
  finishedAt?: Date | null;
  createdAt: Date;
}

export interface Artifact {
  id: string;
  threadId: string;
  runId?: string | null;
  kind: string;
  uri?: string | null;
  metadata?: ArtifactMetadata | null;
  createdAt: Date;
}

export interface ProviderSessionBinding {
  id: string;
  workspaceId: string;
  threadId: string;
  runId?: string | null;
  provider: string;
  providerSessionId: string;
  providerProjectKey?: string | null;
  status: ProviderSessionBindingStatus;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | null;
}

export interface ProviderTranscriptEntry {
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
  createdAt: Date;
}

export interface RunApprovalRequest {
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
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date | null;
}

export interface ChatShare {
  id: string;
  publicId: string;
  sourceThreadId: string;
  scopeType: ChatShareScopeType;
  status: ChatShareStatus;
  snapshotId: string;
  createdAt: Date;
  revokedAt?: Date | null;
}

export interface ChatShareSnapshot {
  id: string;
  shareId: string;
  payloadFormat: ChatShareSnapshotPayloadFormat;
  payloadVersion: number;
  payloadJson?: Record<string, unknown> | null;
  messageCount: number;
  startSeq?: number | null;
  endSeq?: number | null;
  createdAt: Date;
}
