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
} from '../schema/api';

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
};

async function fetchJson<T>(
  input: RequestInfo | URL,
  normalize: (value: unknown) => T,
  init?: RequestInit
): Promise<ApiResult<T>> {
  const response = await fetch(input, init);
  const raw = await readJsonRecordOrEmpty(response);

  return {
    ok: response.ok,
    status: response.status,
    error: readApiError(raw),
    data: normalize(raw)
  };
}

export async function fetchThreadsResponse() {
  return fetchJson<ThreadsResponseDto>('/api/threads', normalizeThreadsResponse);
}

export async function fetchRuntimeMetaResponse() {
  return fetchJson<Partial<RuntimePiMetaDto>>('/api/meta', normalizeRuntimeMetaResponse);
}

export async function fetchRunTimelineResponse(runId: string, signal?: AbortSignal) {
  return fetchJson<RunTimelineResponseDto>(`/api/runs/${runId}/timeline`, normalizeRunTimelineResponse, { signal });
}

export async function fetchThreadMessagesResponse(threadId: string, signal?: AbortSignal) {
  return fetchJson<ThreadMessagesResponseDto>(`/api/threads/${threadId}/messages`, normalizeThreadMessagesResponse, { signal });
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
  const response = await fetch(`/api/threads/${threadId}/runs/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });

  if (response.ok) {
    return {
      ok: true,
      status: response.status,
      error: null,
      body: response.body
    };
  }

  const raw = await readJsonRecordOrEmpty(response);
  return {
    ok: false,
    status: response.status,
    error: readApiError(raw),
    body: null
  };
}
