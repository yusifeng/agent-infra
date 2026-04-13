import type { MessagePartType, MessageRole, RunStatus, ToolInvocationStatus } from '@agent-infra/core';

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

export interface RunDto {
  id: string;
  threadId: string;
  triggerMessageId?: string | null;
  provider?: string | null;
  model?: string | null;
  status: RunStatus;
  usage?: Record<string, unknown> | null;
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

export type RunEventSummaryDto = Pick<RunEventDto, 'seq' | 'type'>;

export type ToolInvocationSummaryDto = Pick<ToolInvocationDto, 'id' | 'toolName' | 'status'>;

export interface CreateThreadRequestDto {
  title?: string;
}

export interface GetThreadMessagesRequestDto {
  threadId: string;
}

export interface RunTextTurnRequestDto {
  text: string;
  provider?: string;
  model?: string;
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

export interface ThreadMessagesResponseDto {
  messages?: MessageDto[];
  error?: string;
}

export interface ThreadRunsResponseDto {
  runs: RunDto[];
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

export type RunAssistantStreamEventType =
  | 'start'
  | 'text_start'
  | 'text_delta'
  | 'text_end'
  | 'thinking_start'
  | 'thinking_delta'
  | 'thinking_end'
  | 'toolcall_start'
  | 'toolcall_delta'
  | 'toolcall_end';

export interface RunStreamAssistantSnapshotDto {
  messageId: string;
  eventType: RunAssistantStreamEventType;
  partialText: string;
  partialReasoning: string | null;
}

export interface RunStreamAssistantEventDto {
  type: 'run.assistant';
  runId: string;
  assistant: RunStreamAssistantSnapshotDto;
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

export type RuntimePiThreadsResponseDto = ThreadsResponseDto;
export type RuntimePiCreateThreadResponseDto = CreateThreadResponseDto;
export type RuntimePiMessagesResponseDto = ThreadMessagesResponseDto;
export type RuntimePiRunResponseDto = RunTextTurnResponseDto;
