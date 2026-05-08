import type {
  CreateThreadShareResponseDto,
  PublicChatShareResponseDto,
  RevokeChatShareResponseDto,
  ThreadShareStateResponseDto
} from '@agent-infra/contracts';
import {
  emitApiDiagnostic,
  readApiError,
  readJsonRecordOrEmpty,
  readResponseDiagnostics,
  type ApiResult
} from '@agent-infra/durable-chat-client';

import {
  normalizeCreateThreadShareResponse,
  normalizePublicChatShareResponse,
  normalizeRevokeChatShareResponse,
  normalizeThreadShareStateResponse
} from '@/features/durable-chat/schema/share-snapshot';

async function fetchJson<T>(
  input: RequestInfo | URL,
  normalize: (value: unknown) => T,
  init?: RequestInit
): Promise<ApiResult<T>> {
  const startedAt = performance.now();
  const response = await fetch(input, init);
  const headersDurationMs = Number((performance.now() - startedAt).toFixed(1));
  const raw = await readJsonRecordOrEmpty(response);
  const totalDurationMs = Number((performance.now() - startedAt).toFixed(1));
  const diagnostics = readResponseDiagnostics(response);

  emitApiDiagnostic({
    durationMs: totalDurationMs,
    headersDurationMs,
    kind: 'http-json',
    method: init?.method ?? 'GET',
    ok: response.ok,
    requestId: diagnostics.requestId,
    serverTiming: diagnostics.serverTiming,
    serverTimingEntries: diagnostics.serverTimingEntries,
    status: response.status,
    url: typeof input === 'string' ? input : input.toString()
  });

  return {
    ok: response.ok,
    status: response.status,
    error: readApiError(raw),
    data: normalize(raw)
  };
}

export async function createThreadSnapshotShare(threadId: string, signal?: AbortSignal) {
  return fetchJson<CreateThreadShareResponseDto>(
    `/api/threads/${threadId}/shares`,
    normalizeCreateThreadShareResponse,
    {
      method: 'POST',
      signal
    }
  );
}

export async function fetchCurrentThreadShare(threadId: string, signal?: AbortSignal) {
  return fetchJson<ThreadShareStateResponseDto>(
    `/api/threads/${threadId}/shares/current`,
    normalizeThreadShareStateResponse,
    {
      signal
    }
  );
}

export async function fetchThreadSnapshotShare(publicId: string, signal?: AbortSignal) {
  return fetchJson<PublicChatShareResponseDto>(
    `/api/shares/${publicId}`,
    normalizePublicChatShareResponse,
    {
      signal
    }
  );
}

export async function revokeThreadSnapshotShare(publicId: string, signal?: AbortSignal) {
  return fetchJson<RevokeChatShareResponseDto>(
    `/api/shares/${publicId}/revoke`,
    normalizeRevokeChatShareResponse,
    {
      method: 'POST',
      signal
    }
  );
}
