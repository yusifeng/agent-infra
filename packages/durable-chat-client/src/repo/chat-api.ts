import type {
  CreateThreadResponseDto,
  RunTextTurnRequestDto,
  RunTimelineResponseDto,
  RuntimePiMetaDto,
  ThreadMessagesResponseDto,
  ThreadRunsResponseDto,
  ThreadsResponseDto
} from '@agent-infra/contracts';

import {
  normalizeCreateThreadResponse,
  normalizeRunTimelineResponse,
  normalizeRuntimeMetaResponse,
  normalizeThreadMessagesResponse,
  normalizeThreadRunsResponse,
  normalizeThreadsResponse,
  readApiError,
  readJsonRecordOrEmpty
} from '../schema/api.js';
import { emitApiDiagnostic, readResponseDiagnostics } from '../service/api-diagnostics.js';

export type ApiResult<T> = {
  ok: boolean;
  status: number;
  error: string | null;
  data: T;
};

export type RunStreamOpenResult = {
  ok: boolean;
  status: number;
  error: string | null;
  body: ReadableStream<Uint8Array> | null;
  requestId: string | null;
};

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

export type FetchThreadMessagesOptions = {
  before?: string | null;
  after?: string | null;
  limit?: number;
  signal?: AbortSignal;
};

export async function fetchThreadsResponse() {
  return fetchJson<ThreadsResponseDto>('/api/threads', normalizeThreadsResponse);
}

export async function fetchRuntimeMetaResponse() {
  return fetchJson<Partial<RuntimePiMetaDto>>('/api/meta', normalizeRuntimeMetaResponse);
}

export async function fetchRunTimelineResponse(runId: string, signal?: AbortSignal) {
  return fetchJson<RunTimelineResponseDto>(`/api/runs/${runId}/timeline`, normalizeRunTimelineResponse, { signal });
}

export async function fetchThreadMessagesResponse(threadId: string, options?: AbortSignal | FetchThreadMessagesOptions) {
  const resolvedOptions =
    options instanceof AbortSignal || options === undefined
      ? { signal: options }
      : options;

  const searchParams = new URLSearchParams();
  if (resolvedOptions.limit && resolvedOptions.limit > 0) {
    searchParams.set('limit', String(resolvedOptions.limit));
  }
  if (resolvedOptions.before) {
    searchParams.set('before', resolvedOptions.before);
  }
  if (resolvedOptions.after) {
    searchParams.set('after', resolvedOptions.after);
  }

  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : '';

  return fetchJson<ThreadMessagesResponseDto>(`/api/threads/${threadId}/messages${suffix}`, normalizeThreadMessagesResponse, {
    signal: resolvedOptions.signal
  });
}

export async function fetchThreadRunsResponse(threadId: string, limit: number, signal?: AbortSignal) {
  return fetchJson<ThreadRunsResponseDto>(`/api/threads/${threadId}/runs?limit=${limit}`, normalizeThreadRunsResponse, { signal });
}

export async function createThreadResponse(body: Record<string, unknown> = {}) {
  return fetchJson<CreateThreadResponseDto>('/api/threads', normalizeCreateThreadResponse, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

export async function openThreadRunStream(
  threadId: string,
  body: RunTextTurnRequestDto,
  signal: AbortSignal
): Promise<RunStreamOpenResult> {
  const startedAt = performance.now();
  const response = await fetch(`/api/threads/${threadId}/runs/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });
  const headersDurationMs = Number((performance.now() - startedAt).toFixed(1));
  const diagnostics = readResponseDiagnostics(response);

  emitApiDiagnostic({
    durationMs: headersDurationMs,
    headersDurationMs,
    kind: 'stream-open',
    method: 'POST',
    ok: response.ok,
    requestId: diagnostics.requestId,
    serverTiming: diagnostics.serverTiming,
    serverTimingEntries: diagnostics.serverTimingEntries,
    status: response.status,
    url: `/api/threads/${threadId}/runs/stream`
  });

  if (response.ok) {
    return {
      ok: true,
      status: response.status,
      error: null,
      body: response.body,
      requestId: diagnostics.requestId
    };
  }

  const raw = await readJsonRecordOrEmpty(response);
  return {
    ok: false,
    status: response.status,
    error: readApiError(raw),
    body: null,
    requestId: diagnostics.requestId
  };
}
