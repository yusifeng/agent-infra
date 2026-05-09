import type { DurableCreateThreadResponseDto, DurableThreadDto, DurableThreadsResponseDto, DurableUpdateThreadResponseDto } from '@/features/durable-chat/types/thread';

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

function asJsonRecordOrNull(value: unknown) {
  return value === null || value === undefined ? null : asRecord(value);
}

function asThreadStatus(value: unknown): DurableThreadDto['status'] | null {
  return value === 'active' || value === 'archived' ? value : null;
}

function normalizeThread(value: unknown): DurableThreadDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const appId = asString(record.appId);
  const status = asThreadStatus(record.status);
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
    pinned: record.pinned === true,
    createdAt,
    updatedAt,
    archivedAt: asNullableString(record.archivedAt)
  };
}

export function normalizeThreadsResponse(value: unknown): DurableThreadsResponseDto {
  const record = asRecord(value);
  const error = asNullableString(record?.error);

  return {
    threads: Array.isArray(record?.threads) ? record.threads.map(normalizeThread).filter((thread): thread is DurableThreadDto => thread !== null) : [],
    error: error ?? undefined
  };
}

export function normalizeCreateThreadResponse(value: unknown): DurableCreateThreadResponseDto {
  const record = asRecord(value);
  const thread = normalizeThread(record?.thread);
  const error = asNullableString(record?.error);

  return {
    thread: thread ?? undefined,
    error: error ?? undefined
  };
}

export function normalizeUpdateThreadResponse(value: unknown): DurableUpdateThreadResponseDto {
  const record = asRecord(value);
  const thread = normalizeThread(record?.thread);
  const error = asNullableString(record?.error);

  return {
    thread: thread ?? undefined,
    error: error ?? undefined
  };
}
