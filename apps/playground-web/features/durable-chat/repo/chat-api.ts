import type {
  CreateThreadResponseDto,
  RunTextTurnRequestDto,
  RunTimelineResponseDto,
  RuntimePiMetaDto,
  ThreadMessagesResponseDto,
  ThreadRunsResponseDto,
  ThreadsResponseDto
} from '@agent-infra/contracts';

type ApiJsonResult<T> = {
  data: T;
  response: Response;
};

async function readJsonOrEmpty<T>(response: Response): Promise<Partial<T>> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Partial<T>;
  } catch {
    return {};
  }
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<ApiJsonResult<T>> {
  const response = await fetch(input, init);
  const data = (await readJsonOrEmpty<T>(response)) as T;
  return { data, response };
}

export async function fetchThreadsResponse() {
  return fetchJson<ThreadsResponseDto>('/api/threads');
}

export async function fetchRuntimeMetaResponse() {
  return fetchJson<RuntimePiMetaDto>('/api/meta');
}

export async function fetchRunTimelineResponse(runId: string, signal?: AbortSignal) {
  return fetchJson<RunTimelineResponseDto>(`/api/runs/${runId}/timeline`, { signal });
}

export async function fetchThreadMessagesResponse(threadId: string, signal?: AbortSignal) {
  return fetchJson<ThreadMessagesResponseDto>(`/api/threads/${threadId}/messages`, { signal });
}

export async function fetchThreadRunsResponse(threadId: string, limit: number, signal?: AbortSignal) {
  return fetchJson<ThreadRunsResponseDto>(`/api/threads/${threadId}/runs?limit=${limit}`, { signal });
}

export async function createThreadResponse(body: Record<string, unknown> = {}) {
  return fetchJson<CreateThreadResponseDto>('/api/threads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

export async function openThreadRunStream(
  threadId: string,
  body: RunTextTurnRequestDto,
  signal: AbortSignal
) {
  return fetch(`/api/threads/${threadId}/runs/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });
}
