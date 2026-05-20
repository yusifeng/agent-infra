import type {
  AnswerCandidate,
  AnswerCandidateRepository,
  AnswerSelection,
  AnswerSelectionRepository,
  CanonicalTranscriptDiagnostic,
  ChatShare,
  ChatShareRepository,
  ChatShareSnapshot,
  ChatShareSnapshotRepository,
  Dataset,
  DatasetExample,
  DatasetExampleRepository,
  DatasetRepository,
  EvalExampleResult,
  EvalExampleResultRepository,
  EvalExampleResultStatus,
  EvalRunCompareOutcomeV1,
  EvalRunCompareReasonV1,
  EvalRunCompareResultSignalV1,
  EvalRunCompareTriage,
  EvalRunCompareTriageRepository,
  EvalRunCompareTriageStatus,
  EvalRun,
  EvalRunRepository,
  Message,
  MessagePageResult,
  MessagePart,
  MessageRepository,
  Run,
  RunFeedback,
  RunFeedbackRepository,
  RunFeedbackValue,
  RunEvent,
  RunEventRepository,
  RunRepository,
  Thread,
  ThreadRepository,
  ToolInvocation,
  ToolInvocationRepository
} from '@agent-infra/core';

export interface AgentInfraAppRepositories {
  threadRepo: ThreadRepository;
  runRepo: RunRepository;
  messageRepo: MessageRepository;
  toolRepo: ToolInvocationRepository;
  runEventRepo: RunEventRepository;
  chatShareRepo: ChatShareRepository;
  chatShareSnapshotRepo: ChatShareSnapshotRepository;
  answerCandidateRepo: AnswerCandidateRepository;
  answerSelectionRepo: AnswerSelectionRepository;
  runFeedbackRepo: RunFeedbackRepository;
  datasetRepo: DatasetRepository;
  datasetExampleRepo: DatasetExampleRepository;
  evalRunRepo: EvalRunRepository;
  evalExampleResultRepo: EvalExampleResultRepository;
  evalRunCompareTriageRepo: EvalRunCompareTriageRepository;
}

export interface RuntimeSelection {
  provider: string;
  model: string;
}

export interface RunTextRuntimeInput {
  threadId: string;
  runId: string;
  historyMessages?: Array<Message & { parts: MessagePart[] }>;
  provider: string;
  model: string;
  thinkingEnabled?: boolean;
  reasoningEffort?: 'high' | 'max';
  webSearchEnabled?: boolean;
}

export interface GenerateTextRuntimeInput {
  provider?: string;
  model?: string;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: 'off' | 'high' | 'max';
}

export interface GenerateTextRuntimeResult {
  provider: string;
  model: string;
  text: string | null;
}

export interface StartTextTurnResult {
  run: Run;
  userMessage: Message & { parts: MessagePart[] };
  runtimeSelection: RuntimeSelection;
}

export interface StartTextCandidateResult {
  candidate: AnswerCandidate;
  run: Run;
}

export interface StartTextCandidatesResult {
  triggerMessageId: string;
  userMessage: Message & { parts: MessagePart[] };
  candidates: StartTextCandidateResult[];
  answerSelection: AnswerSelection;
  runtimeSelection: RuntimeSelection;
}

export interface AgentInfraRuntimePort {
  prepare(input: { provider?: string; model?: string }): Promise<RuntimeSelection>;
  runTextTurn(repositories: AgentInfraAppRepositories, input: RunTextRuntimeInput): Promise<void>;
  generateText(input: GenerateTextRuntimeInput): Promise<GenerateTextRuntimeResult>;
}

export interface CreateThreadInput {
  appId: string;
  title?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ListThreadsInput {
  appId: string;
}

export interface RenameThreadInput {
  threadId: string;
  title: string;
}

export interface ArchiveThreadInput {
  threadId: string;
}

export interface GetThreadMessagesInput {
  threadId: string;
  limit?: number;
  beforeSeq?: number;
  afterSeq?: number;
  feedbackActorId?: string | null;
}

export interface RunTextTurnInput {
  threadId: string;
  text: string;
  provider?: string;
  model?: string;
  thinkingEnabled?: boolean;
  reasoningEffort?: 'high' | 'max';
  webSearchEnabled?: boolean;
}

export interface StartTextCandidatesInput extends RunTextTurnInput {
  candidateCount: 2;
}

export interface SelectAnswerCandidateInput {
  threadId: string;
  triggerMessageId: string;
  runId: string;
  selectedByUserId?: string | null;
}

export interface SetRunFeedbackInput {
  threadId: string;
  triggerMessageId?: string | null;
  runId: string;
  feedbackActorId: string;
  value: RunFeedbackValue;
}

export interface ClearRunFeedbackInput {
  threadId: string;
  runId: string;
  feedbackActorId: string;
}

export interface GetCanonicalThreadMessagesInput {
  threadId: string;
  cutoffMessageId?: string | null;
}

export interface CanonicalThreadMessagesResult {
  messages: Array<Message & { parts: MessagePart[] }>;
  canonicalRunIds: string[];
  diagnostics: CanonicalTranscriptDiagnostic[];
}

export interface CanonicalThreadMessagesPageResult extends MessagePageResult {
  canonicalRunIds: string[];
  diagnostics: CanonicalTranscriptDiagnostic[];
}

export interface ThreadMessagesWithAnswerCandidatesResult {
  messages: Array<Message & { parts: MessagePart[] }>;
  pageInfo?: MessagePageResult['pageInfo'];
  activeRuns: Run[];
  activeRun: Run | null;
  answerCandidates: AnswerCandidate[];
  answerSelections: AnswerSelection[];
  runFeedback: RunFeedback[];
}

export interface RunTextTurnResult {
  run: Run;
  messages: Array<Message & { parts: MessagePart[] }>;
  executionError?: string;
  debug: {
    runEventCount: number;
    toolInvocationCount: number;
  };
}

export interface GetRunTimelineInput {
  runId: string;
}

export interface GetRunTraceInput {
  runId: string;
}

export interface CreateDatasetInput {
  appId: string;
  name: string;
  description?: string | null;
  visibility?: Dataset['visibility'];
  metadata?: Record<string, unknown> | null;
  createdByActorId?: string | null;
}

export interface ListDatasetsInput {
  appId: string;
  actorId?: string | null;
  includeAppVisible?: boolean;
}

export interface GetDatasetInput {
  appId: string;
  datasetId: string;
  actorId?: string | null;
}

export interface ListDatasetExamplesInput extends GetDatasetInput {}

export interface GetDatasetExampleInput extends GetDatasetInput {
  exampleId: string;
}

export interface UpdateDatasetExampleExpectedOutputInput extends GetDatasetExampleInput {
  expectedOutputJson: DatasetExpectedOutputV1 | null;
}

export interface UpdateDatasetExampleReviewInput extends GetDatasetExampleInput {
  review: DatasetExampleReviewUpdateV1;
}

export interface CaptureDatasetExampleFromRunInput extends GetDatasetInput {
  sourceRunId: string;
  expectedOutputJson?: Record<string, unknown> | null;
  metadataJson?: Partial<DatasetExampleMetadataSnapshotV1> & Record<string, unknown>;
  capturedByActorId?: string | null;
  omitToolInvocations?: boolean;
  toolInvocationOmissionReason?: string | null;
}

export interface CaptureDatasetExampleFromRunResult {
  dataset: Dataset;
  example: DatasetExample;
}

export interface CreateEvalRunInput extends GetDatasetInput {
  name?: string | null;
  provider?: string | null;
  model?: string | null;
  runtimeOptions?: Record<string, unknown> | null;
  createdByActorId?: string | null;
}

export interface ListEvalRunsByDatasetInput extends GetDatasetInput {}

export interface GetEvalRunInput {
  appId: string;
  evalRunId: string;
  actorId?: string | null;
}

export interface RunEvalRunInput extends GetEvalRunInput {}

export interface ListEvalExampleResultsInput extends GetEvalRunInput {}

export interface UpdateEvalExampleResultReviewInput extends GetEvalRunInput {
  resultId: string;
  review: EvalExampleResultReviewUpdateV1;
}

export interface EvalRunComparePairInput {
  appId: string;
  baselineEvalRunId: string;
  candidateEvalRunId: string;
  actorId?: string | null;
}

export interface ListEvalRunCompareTriageInput extends EvalRunComparePairInput {}

export interface UpdateEvalRunCompareTriageInput extends EvalRunComparePairInput {
  datasetExampleId: string;
  triage: EvalRunCompareTriageUpdateV1;
}

export interface DeleteEvalRunCompareTriageInput extends EvalRunComparePairInput {
  datasetExampleId: string;
}

export interface EvalRunCompareTriageUpdateV1 {
  status: EvalRunCompareTriageStatus;
  reviewerNote?: string | null;
}

export interface EvalRunCompareTriageFingerprintV1 {
  observedProjectionKind: 'eval_run_compare';
  observedProjectionSchemaVersion: 1;
  observedCompareStrategy?: string | null;
  observedOutcome: EvalRunCompareOutcomeV1;
  observedReason: EvalRunCompareReasonV1;
  observedBaselineResultId?: string | null;
  observedCandidateResultId?: string | null;
  observedBaselineResultStatus?: EvalExampleResultStatus | null;
  observedCandidateResultStatus?: EvalExampleResultStatus | null;
  observedBaselineReviewStatus?: EvalExampleResultReviewStatusV1 | null;
  observedCandidateReviewStatus?: EvalExampleResultReviewStatusV1 | null;
  observedBaselineSignal?: EvalRunCompareResultSignalV1 | null;
  observedCandidateSignal?: EvalRunCompareResultSignalV1 | null;
  observedBaselineComparisonOutcome?: string | null;
  observedCandidateComparisonOutcome?: string | null;
  observedBaselineComparisonReason?: string | null;
  observedCandidateComparisonReason?: string | null;
  observedResultComparisonStrategy?: string | null;
}

export interface EvalRunCompareTriageRead {
  triage: EvalRunCompareTriage;
  stale: boolean;
}

export type EvalRunSelectionPolicyV1 = 'effective_eligible_v1';

export interface EvalRunConfigV1 {
  schemaVersion: 1;
  kind: 'eval_run_config';
  selection: {
    policy: EvalRunSelectionPolicyV1;
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

export type EvalExampleResultReviewStatusV1 = 'unreviewed' | 'pass' | 'fail' | 'needs_review' | 'not_applicable';

export interface EvalExampleResultReviewV1 {
  status: EvalExampleResultReviewStatusV1;
  reviewerNote?: string | null;
  reviewedByActorId?: string | null;
  reviewedAt?: string | null;
}

export interface EvalExampleResultReviewUpdateV1 {
  status?: EvalExampleResultReviewStatusV1;
  reviewerNote?: string | null;
}

export interface EvalRunSummaryV1 {
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
    reviewStatusCounts: Record<EvalExampleResultReviewStatusV1, number>;
    aggregateUsage?: Run['usage'] | null;
    durationMs?: number | null;
  };
}

export interface EvalActualOutputSnapshotV1 {
  schemaVersion: 1;
  kind: 'eval_run_output';
  outputRunId: string;
  evalThreadId: string;
  status: Run['status'];
  error?: string | null;
  assistantMessages: DatasetMessageSnapshotV1[];
}

export interface RunTimelineResult {
  run: Run;
  runEvents: RunEvent[];
  toolInvocations: ToolInvocation[];
  projection: RunTimelineProjectionV1;
}

export interface RunTraceResult {
  run: Run;
  projection: TraceSpanProjectionV1;
}

export interface RunTimelineProjectionV1 {
  schemaVersion: 1;
  items: RunTimelineItemV1[];
}

export type RunTimelineItemV1 =
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

export type TraceSpanKindV1 = 'agent' | 'assistant_message' | 'tool_invocation' | 'runtime_error' | 'unknown_event';

export type TraceSpanStatusV1 = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';

export type TraceProjectionDiagnosticCodeV1 =
  | 'unknown_event'
  | 'orphan_event'
  | 'missing_tool_invocation'
  | 'unpaired_message_start'
  | 'unpaired_message_end'
  | 'unpaired_tool_start'
  | 'unpaired_tool_end'
  | 'nonterminal_child_on_terminal_run'
  | 'negative_duration_clamped';

export type TraceSpanSourceRefV1 =
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

export interface TraceSpanUsageRefV1 {
  source: 'run.usage';
  runId: string;
}

export interface TraceSpanToolV1 {
  toolInvocationId?: string | null;
  toolCallId: string;
  toolName: string;
}

export interface TraceSpanErrorV1 {
  message: string;
}

export interface TraceProjectionDiagnosticV1 {
  code: TraceProjectionDiagnosticCodeV1;
  message: string;
  sourceRefs: TraceSpanSourceRefV1[];
}

export interface TraceSpanProjectionDiagnosticsV1 {
  unknownEventCount: number;
  orphanEventCount: number;
  warnings: TraceProjectionDiagnosticV1[];
}

export interface TraceSpanV1 {
  schemaVersion: 1;
  id: string;
  traceId: string;
  parentSpanId: string | null;
  kind: TraceSpanKindV1;
  name: string;
  status: TraceSpanStatusV1;
  appId: string;
  threadId: string;
  runId: string;
  order: number;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  provider?: string | null;
  model?: string | null;
  usageRef?: TraceSpanUsageRefV1 | null;
  tool?: TraceSpanToolV1 | null;
  error?: TraceSpanErrorV1 | null;
  sourceRefs: TraceSpanSourceRefV1[];
  metadata?: Record<string, unknown> | null;
}

export interface TraceSpanProjectionV1 {
  schemaVersion: 1;
  traceId: string;
  rootSpanId: string;
  appId: string;
  threadId: string;
  runId: string;
  status: TraceSpanStatusV1;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  spans: TraceSpanV1[];
  diagnostics: TraceSpanProjectionDiagnosticsV1;
}

export interface DatasetMessagePartSnapshotV1 {
  id: string;
  messageId: string;
  partIndex: number;
  type: MessagePart['type'];
  textValue?: string | null;
  jsonValue?: Record<string, unknown> | null;
  createdAt: string;
}

export interface DatasetMessageSnapshotV1 {
  id: string;
  threadId: string;
  runId?: string | null;
  role: Message['role'];
  seq: number;
  status: Message['status'];
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  parts: DatasetMessagePartSnapshotV1[];
}

export interface DatasetInputSnapshotV1 {
  schemaVersion: 1;
  kind: 'chat_turn';
  contextSource: 'current_canonical_at_capture';
  triggerMessageId?: string | null;
  triggerMessage?: DatasetMessageSnapshotV1 | null;
  messages: DatasetMessageSnapshotV1[];
  canonicalRunIds?: string[];
  diagnostics?: CanonicalTranscriptDiagnostic[];
}

export interface DatasetBaselineOutputSnapshotV1 {
  schemaVersion: 1;
  kind: 'run_output';
  runId: string;
  status: Run['status'];
  error?: string | null;
  assistantMessages: DatasetMessageSnapshotV1[];
}

export interface DatasetContextSnapshotV1 {
  schemaVersion: 1;
  kind: 'run_context';
  appId: string;
  threadId: string;
  runId: string;
  triggerMessageId?: string | null;
  provider?: string | null;
  model?: string | null;
  status: Run['status'];
  usage?: Run['usage'] | null;
  error?: string | null;
  runCreatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  traceDiagnostics?: TraceProjectionDiagnosticV1[];
}

export type DatasetToolInvocationSnapshotStateV1 = 'captured' | 'omitted_by_policy';

export interface DatasetToolInvocationSnapshotV1 {
  id: string;
  threadId: string;
  runId: string;
  messageId: string;
  toolName: string;
  toolCallId: string;
  status: ToolInvocation['status'];
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
}

export interface DatasetToolInvocationsSnapshotV1 {
  schemaVersion: 1;
  kind: 'tool_invocations';
  sourceRunId: string;
  state: DatasetToolInvocationSnapshotStateV1;
  omissionReason?: string | null;
  toolInvocations: DatasetToolInvocationSnapshotV1[];
}

export type DatasetCaptureKindV1 = 'normal_example' | 'failure_case' | 'debug_case';

export const DATASET_EXPECTED_OUTPUT_TEXT_MAX_LENGTH = 20000;
export const DATASET_EXPECTED_OUTPUT_NOTES_MAX_LENGTH = 4000;
export const DATASET_REVIEWER_NOTE_MAX_LENGTH = 4000;

export interface DatasetExpectedOutputV1 {
  schemaVersion: 1;
  kind: 'assistant_text';
  text: string;
  notes?: string | null;
}

export type DatasetExpectedOutputStateV1 = 'missing' | 'valid' | 'invalid';

export interface DatasetExpectedOutputNormalizationV1 {
  state: DatasetExpectedOutputStateV1;
  expectedOutput: DatasetExpectedOutputV1 | null;
  reason?: string;
}

export type DatasetExampleReviewStatusV1 = 'unreviewed' | 'needs_expected_output' | 'approved' | 'excluded';

export type DatasetExampleReviewEvalEligibilityV1 = 'default' | 'include' | 'exclude';

export type DatasetExampleReviewExclusionReasonV1 =
  | 'failure_case'
  | 'debug_case'
  | 'missing_expected_output'
  | 'not_representative'
  | 'sensitive_or_unsafe'
  | 'other';

export interface DatasetExampleReviewMetadataV1 {
  status: DatasetExampleReviewStatusV1;
  evalEligibility: DatasetExampleReviewEvalEligibilityV1;
  exclusionReason?: DatasetExampleReviewExclusionReasonV1 | null;
  reviewerNote?: string | null;
  reviewedByActorId?: string | null;
  reviewedAt?: string | null;
}

export interface DatasetExampleReviewUpdateV1 {
  status?: DatasetExampleReviewStatusV1;
  evalEligibility?: DatasetExampleReviewEvalEligibilityV1;
  exclusionReason?: DatasetExampleReviewExclusionReasonV1 | null;
  reviewerNote?: string | null;
}

export type DatasetExampleEffectiveEligibilityReasonV1 =
  | 'eligible_default'
  | 'eligible_included_by_review'
  | 'ineligible_unreviewed'
  | 'ineligible_needs_expected_output'
  | 'ineligible_missing_expected_output'
  | 'ineligible_invalid_expected_output'
  | 'ineligible_excluded_by_review'
  | 'ineligible_capture_default'
  | 'ineligible_contradictory_review_state';

export interface DatasetExampleEffectiveEligibilityV1 {
  eligible: boolean;
  reason: DatasetExampleEffectiveEligibilityReasonV1;
}

export interface DatasetExampleMetadataSnapshotV1 {
  schemaVersion: 1;
  capture: {
    kind: DatasetCaptureKindV1;
    capturedAt: string;
    capturedByActorId?: string | null;
    sourceRunId?: string | null;
    sourceThreadId?: string | null;
    triggerMessageId?: string | null;
  };
  feedback?: {
    sharedRunFeedback?: Record<string, unknown> | null;
  };
  host?: {
    playground?: {
      runFeedbackDetails?: Record<string, unknown> | null;
    };
  };
  evaluation?: {
    defaultEligible: boolean;
  };
  review?: DatasetExampleReviewMetadataV1;
}

export interface GetThreadRunsInput {
  threadId: string;
  limit?: number;
}

export interface GetActiveThreadRunInput {
  threadId: string;
}

export interface CreateThreadSnapshotShareInput {
  threadId: string;
}

export interface GetPublicShareInput {
  publicId: string;
}

export interface RevokeShareInput {
  publicId: string;
}

export interface GetCurrentThreadShareInput {
  threadId: string;
}

export interface SharedMessagePartSnapshot {
  id: string;
  messageId: string;
  partIndex: number;
  type: MessagePart['type'];
  textValue?: string | null;
  jsonValue?: Record<string, unknown> | null;
  createdAt: string;
}

export interface SharedMessageSnapshot {
  id: string;
  runId?: string | null;
  role: Message['role'];
  seq: number;
  createdAt: string;
  parts: SharedMessagePartSnapshot[];
}

export interface SharedSearchBundle {
  runId?: string | null;
  toolCallId: string;
  toolName: string;
  status: ToolInvocation['status'];
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface SharedThreadSnapshotPayload {
  payloadFormat: 'messages_v1';
  payloadVersion: 1;
  title?: string | null;
  messages: SharedMessageSnapshot[];
  searchBundles?: Record<string, SharedSearchBundle> | null;
}

export interface CreateThreadSnapshotShareResult {
  share: ChatShare;
  snapshot: ChatShareSnapshot;
}

export interface PublicChatShareResult {
  share: ChatShare;
  snapshot: SharedThreadSnapshotPayload;
}

export interface AgentInfraAppDependencies {
  repositories: AgentInfraAppRepositories;
  runtime: AgentInfraRuntimePort;
  transaction: <T>(operation: (repositories: AgentInfraAppRepositories) => Promise<T>) => Promise<T>;
  idGenerator?: () => string;
  now?: () => Date;
}

export interface AgentInfraApp {
  threads: {
    create(input: CreateThreadInput): Promise<Thread>;
    list(input: ListThreadsInput): Promise<Thread[]>;
    rename(input: RenameThreadInput): Promise<Thread>;
    archive(input: ArchiveThreadInput): Promise<Thread>;
    getMessages(input: GetThreadMessagesInput): Promise<Array<Message & { parts: MessagePart[] }>>;
    getMessagesPage(input: GetThreadMessagesInput): Promise<MessagePageResult>;
    getCanonicalMessages(input: GetCanonicalThreadMessagesInput): Promise<CanonicalThreadMessagesResult>;
    getCanonicalMessagesPage(input: GetThreadMessagesInput): Promise<CanonicalThreadMessagesPageResult>;
    getMessagesWithAnswerCandidates(input: GetThreadMessagesInput): Promise<ThreadMessagesWithAnswerCandidatesResult>;
  };
  turns: {
    startText(input: RunTextTurnInput): Promise<StartTextTurnResult>;
    startTextCandidates(input: StartTextCandidatesInput): Promise<StartTextCandidatesResult>;
    selectAnswerCandidate(input: SelectAnswerCandidateInput): Promise<AnswerSelection>;
    setRunFeedback(input: SetRunFeedbackInput): Promise<RunFeedback>;
    clearRunFeedback(input: ClearRunFeedbackInput): Promise<void>;
    runText(input: RunTextTurnInput): Promise<RunTextTurnResult>;
  };
  runs: {
    getTimeline(input: GetRunTimelineInput): Promise<RunTimelineResult>;
    getTrace(input: GetRunTraceInput): Promise<RunTraceResult>;
    listByThread(input: GetThreadRunsInput): Promise<Run[]>;
    getActiveByThread(input: GetActiveThreadRunInput): Promise<Run | null>;
    listActiveByThread(input: GetActiveThreadRunInput): Promise<Run[]>;
  };
  datasets: {
    create(input: CreateDatasetInput): Promise<Dataset>;
    list(input: ListDatasetsInput): Promise<Dataset[]>;
    get(input: GetDatasetInput): Promise<Dataset>;
    listExamples(input: ListDatasetExamplesInput): Promise<DatasetExample[]>;
    getExample(input: GetDatasetExampleInput): Promise<DatasetExample>;
    updateExampleExpectedOutput(input: UpdateDatasetExampleExpectedOutputInput): Promise<DatasetExample>;
    updateExampleReview(input: UpdateDatasetExampleReviewInput): Promise<DatasetExample>;
    captureExampleFromRun(input: CaptureDatasetExampleFromRunInput): Promise<CaptureDatasetExampleFromRunResult>;
  };
  evals: {
    create(input: CreateEvalRunInput): Promise<EvalRun>;
    listByDataset(input: ListEvalRunsByDatasetInput): Promise<EvalRun[]>;
    get(input: GetEvalRunInput): Promise<EvalRun>;
    listResults(input: ListEvalExampleResultsInput): Promise<EvalExampleResult[]>;
    run(input: RunEvalRunInput): Promise<EvalRun>;
    updateResultReview(input: UpdateEvalExampleResultReviewInput): Promise<EvalExampleResult>;
    listCompareTriage(input: ListEvalRunCompareTriageInput): Promise<EvalRunCompareTriageRead[]>;
    updateCompareTriage(input: UpdateEvalRunCompareTriageInput): Promise<EvalRunCompareTriageRead>;
    deleteCompareTriage(input: DeleteEvalRunCompareTriageInput): Promise<void>;
  };
  shares: {
    createThreadSnapshot(input: CreateThreadSnapshotShareInput): Promise<CreateThreadSnapshotShareResult>;
    getCurrentByThread(input: GetCurrentThreadShareInput): Promise<ChatShare | null>;
    getPublic(input: GetPublicShareInput): Promise<PublicChatShareResult>;
    revoke(input: RevokeShareInput): Promise<ChatShare>;
  };
}
