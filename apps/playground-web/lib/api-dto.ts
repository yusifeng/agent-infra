import type { Message, MessagePart, Run, RunEvent, Thread, ToolInvocation } from '@agent-infra/core';
import type {
  MessageDto,
  MessagePartDto,
  RunDto,
  RunEventDto,
  RunEventSummaryDto,
  RuntimePiMetaDto,
  ThreadDto,
  ToolInvocationDto,
  ToolInvocationSummaryDto
} from '@agent-infra/contracts';

type RuntimePiMetaInput = {
  dbMode: string;
  dbConnection: string;
  runtimeConfigured: boolean;
  runtimeProvider: string;
  runtimeModel: string;
  defaultModelKey: string | null;
  modelOptions: RuntimePiMetaDto['modelOptions'];
  runtimeConfigError: string | null;
};

function serializeDate(value: Date | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value.toISOString();
}

export function toThreadDto(thread: Thread): ThreadDto {
  return {
    id: thread.id,
    appId: thread.appId,
    userId: thread.userId ?? null,
    title: thread.title ?? null,
    status: thread.status,
    metadata: thread.metadata ?? null,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    archivedAt: serializeDate(thread.archivedAt)
  };
}

export function toMessagePartDto(part: MessagePart): MessagePartDto {
  return {
    id: part.id,
    messageId: part.messageId,
    partIndex: part.partIndex,
    type: part.type,
    textValue: part.textValue ?? null,
    jsonValue: part.jsonValue ?? null,
    createdAt: part.createdAt.toISOString()
  };
}

export function toMessageDto(message: Message & { parts: MessagePart[] }): MessageDto {
  return {
    id: message.id,
    threadId: message.threadId,
    runId: message.runId ?? null,
    role: message.role,
    seq: message.seq,
    status: message.status,
    metadata: message.metadata ?? null,
    createdAt: message.createdAt.toISOString(),
    parts: message.parts.map(toMessagePartDto)
  };
}

export function toRunDto(run: Run | null): RunDto | null {
  if (!run) {
    return null;
  }

  return {
    id: run.id,
    threadId: run.threadId,
    triggerMessageId: run.triggerMessageId ?? null,
    provider: run.provider ?? null,
    model: run.model ?? null,
    status: run.status,
    usage: run.usage ?? null,
    error: run.error ?? null,
    startedAt: serializeDate(run.startedAt),
    finishedAt: serializeDate(run.finishedAt),
    createdAt: run.createdAt.toISOString()
  };
}

export function toRunEventSummaryDto(event: RunEvent): RunEventSummaryDto {
  return {
    seq: event.seq,
    type: event.type
  };
}

export function toRunEventDto(event: RunEvent): RunEventDto {
  return {
    id: event.id,
    threadId: event.threadId,
    runId: event.runId,
    seq: event.seq,
    type: event.type,
    payload: event.payload,
    createdAt: event.createdAt.toISOString()
  };
}

export function toToolInvocationSummaryDto(invocation: ToolInvocation): ToolInvocationSummaryDto {
  return {
    id: invocation.id,
    toolName: invocation.toolName,
    status: invocation.status
  };
}

export function toToolInvocationDto(invocation: ToolInvocation): ToolInvocationDto {
  return {
    id: invocation.id,
    threadId: invocation.threadId,
    runId: invocation.runId,
    messageId: invocation.messageId,
    toolName: invocation.toolName,
    toolCallId: invocation.toolCallId,
    status: invocation.status,
    input: invocation.input ?? null,
    output: invocation.output ?? null,
    error: invocation.error ?? null,
    startedAt: serializeDate(invocation.startedAt),
    finishedAt: serializeDate(invocation.finishedAt),
    createdAt: invocation.createdAt.toISOString()
  };
}

export function toRuntimeMetaDto(input: RuntimePiMetaInput): RuntimePiMetaDto {
  return {
    dbMode: input.dbMode,
    dbConnection: input.dbConnection,
    runtimeConfigured: input.runtimeConfigured,
    runtimeProvider: input.runtimeProvider,
    runtimeModel: input.runtimeModel,
    defaultModelKey: input.defaultModelKey,
    modelOptions: input.modelOptions,
    runtimeConfigError: input.runtimeConfigError
  };
}
