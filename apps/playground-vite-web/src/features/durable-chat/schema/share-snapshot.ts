import type {
  ChatShareDto,
  CreateThreadShareResponseDto,
  PublicChatShareDto,
  PublicChatShareResponseDto,
  RevokeChatShareResponseDto,
  SharedMessageDto,
  SharedMessagePartDto,
  SharedThreadSnapshotDto,
  ThreadShareStateResponseDto
} from '@agent-infra/contracts';
import { readApiError } from '@agent-infra/durable-chat-client';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
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

function asJsonRecordOrNull(value: unknown) {
  return value === null || value === undefined ? null : asRecord(value);
}

function asChatShareScopeType(value: unknown): ChatShareDto['scopeType'] | null {
  return value === 'thread' ? value : null;
}

function asChatShareStatus(value: unknown): ChatShareDto['status'] | null {
  return value === 'active' || value === 'revoked' ? value : null;
}

function asPublicChatShareStatus(value: unknown): PublicChatShareDto['status'] | null {
  return value === 'active' ? value : null;
}

function asSharedMessagePartType(value: unknown): SharedMessagePartDto['type'] | null {
  return value === 'text' || value === 'tool-call' || value === 'tool-result' || value === 'reasoning' || value === 'data'
    ? value
    : null;
}

function asSharedMessageRole(value: unknown): SharedMessageDto['role'] | null {
  return value === 'user' || value === 'assistant' || value === 'system' || value === 'tool' ? value : null;
}

function normalizeChatShare(value: unknown): ChatShareDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const publicId = asString(record.publicId);
  const sourceThreadId = asString(record.sourceThreadId);
  const scopeType = asChatShareScopeType(record.scopeType);
  const status = asChatShareStatus(record.status);
  const snapshotId = asString(record.snapshotId);
  const createdAt = asString(record.createdAt);

  if (!id || !publicId || !sourceThreadId || !scopeType || !status || !snapshotId || !createdAt) {
    return null;
  }

  return {
    id,
    publicId,
    sourceThreadId,
    scopeType,
    status,
    snapshotId,
    createdAt,
    revokedAt: asNullableString(record.revokedAt)
  };
}

function normalizeSharedMessagePart(value: unknown): SharedMessagePartDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const messageId = asString(record.messageId);
  const partIndex = asNumber(record.partIndex);
  const type = asSharedMessagePartType(record.type);
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

function normalizeSharedMessage(value: unknown): SharedMessageDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const role = asSharedMessageRole(record.role);
  const seq = asNumber(record.seq);
  const createdAt = asString(record.createdAt);

  if (!id || !role || seq === null || !createdAt) {
    return null;
  }

  return {
    id,
    runId: asNullableString(record.runId),
    role,
    seq,
    createdAt,
    parts: Array.isArray(record.parts)
      ? record.parts.map(normalizeSharedMessagePart).filter((part): part is SharedMessagePartDto => part !== null)
      : []
  };
}

function normalizeSharedThreadSnapshot(value: unknown): SharedThreadSnapshotDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const payloadFormat = record.payloadFormat === 'messages_v1' ? record.payloadFormat : null;
  const payloadVersion = asNumber(record.payloadVersion);

  if (!payloadFormat || payloadVersion === null) {
    return null;
  }

  return {
    payloadFormat,
    payloadVersion,
    title: asNullableString(record.title),
    messages: Array.isArray(record.messages)
      ? record.messages.map(normalizeSharedMessage).filter((message): message is SharedMessageDto => message !== null)
      : [],
    searchBundles: asJsonRecordOrNull(record.searchBundles)
  };
}

function normalizePublicChatShare(value: unknown): PublicChatShareDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const publicId = asString(record.publicId);
  const scopeType = asChatShareScopeType(record.scopeType);
  const status = asPublicChatShareStatus(record.status);
  const createdAt = asString(record.createdAt);
  const snapshot = normalizeSharedThreadSnapshot(record.snapshot);

  if (!publicId || !scopeType || !status || !createdAt || !snapshot) {
    return null;
  }

  return {
    publicId,
    scopeType,
    status,
    createdAt,
    snapshot
  };
}

export function normalizeCreateThreadShareResponse(value: unknown): CreateThreadShareResponseDto {
  const record = asRecord(value) ?? {};

  return {
    share: normalizeChatShare(record.share) ?? undefined,
    error: readApiError(record) ?? undefined
  };
}

export function normalizeThreadShareStateResponse(value: unknown): ThreadShareStateResponseDto {
  const record = asRecord(value) ?? {};
  const share = record.share === null ? null : normalizeChatShare(record.share);

  return {
    share: share ?? (record.share === null ? null : undefined),
    error: readApiError(record) ?? undefined
  };
}

export function normalizePublicChatShareResponse(value: unknown): PublicChatShareResponseDto {
  const record = asRecord(value) ?? {};

  return {
    share: normalizePublicChatShare(record.share) ?? undefined,
    error: readApiError(record) ?? undefined
  };
}

export function normalizeRevokeChatShareResponse(value: unknown): RevokeChatShareResponseDto {
  const record = asRecord(value) ?? {};

  return {
    share: normalizeChatShare(record.share) ?? undefined,
    error: readApiError(record) ?? undefined
  };
}
