import type {
  CreateThreadResponseDto,
  MessageDto,
  MessagePartDto,
  RunDto,
  RunEventDto,
  RunTimelineResponseDto,
  RuntimePiMetaDto,
  ThreadDto,
  ThreadMessagesResponseDto,
  ThreadRunsResponseDto,
  ThreadsResponseDto,
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

export function normalizeThreadMessagesResponse(value: unknown): ThreadMessagesResponseDto {
  const record = asRecord(value) ?? {};
  return {
    messages: Array.isArray(record.messages)
      ? record.messages.map(normalizeMessage).filter((message): message is MessageDto => message !== null)
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

export { normalizeMessage, normalizeRun, normalizeThread };
