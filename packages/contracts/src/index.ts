import type {
  ChatShareScopeType,
  ChatShareSnapshotPayloadFormat,
  ChatShareStatus,
  MessagePartType,
  MessageRole,
  RunUsageSummaryV1,
  RunStatus,
  ToolInvocationStatus
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

export interface RunEventDto {
  id: string;
  threadId: string;
  runId: string;
  seq: number;
  type: string;
  payload: Record<string, unknown> | null;
  createdAt: IsoDateString;
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
}

export interface GetRunTimelineRequestDto {
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

export interface ThreadRunsResponseDto {
  runs: RunDto[];
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
  error?: string;
}

export interface RunStreamReadyEventDto {
  type: 'run.ready';
  runId: string;
  run: RunDto;
  userMessage: MessageDto;
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
