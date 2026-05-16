import type {
  AnswerCandidate,
  AnswerCandidateRepository,
  AnswerSelection,
  AnswerSelectionRepository,
  CanonicalTranscriptDiagnostic,
  ChatShare,
  ChatShareSnapshot,
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
  ToolInvocationRepository,
  ChatShareRepository,
  ChatShareSnapshotRepository
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
  triggerMessageId: string;
  runId: string;
  feedbackActorId: string;
  value: RunFeedbackValue;
}

export interface ClearRunFeedbackInput {
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

export interface ThreadMessagesWithAnswerCandidatesResult {
  messages: Array<Message & { parts: MessagePart[] }>;
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
  shares: {
    createThreadSnapshot(input: CreateThreadSnapshotShareInput): Promise<CreateThreadSnapshotShareResult>;
    getCurrentByThread(input: GetCurrentThreadShareInput): Promise<ChatShare | null>;
    getPublic(input: GetPublicShareInput): Promise<PublicChatShareResult>;
    revoke(input: RevokeShareInput): Promise<ChatShare>;
  };
}
