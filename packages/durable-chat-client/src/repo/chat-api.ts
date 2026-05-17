import type {
  CaptureDatasetExampleFromRunRequestDto,
  CaptureDatasetExampleResponseDto,
  CreateDatasetRequestDto,
  CreateEvalRunRequestDto,
  CreateThreadResponseDto,
  DatasetExampleResponseDto,
  DatasetExamplesResponseDto,
  DatasetResponseDto,
  DatasetsResponseDto,
  EvalExampleResultResponseDto,
  EvalExampleResultsResponseDto,
  EvalRunResponseDto,
  EvalRunsResponseDto,
  RunTraceResponseDto,
  RunTextTurnRequestDto,
  RunTimelineResponseDto,
  RuntimePiMetaDto,
  ThreadMessagesResponseDto,
  ThreadRunsResponseDto,
  ThreadsResponseDto,
  UpdateDatasetExampleExpectedOutputRequestDto,
  UpdateDatasetExampleReviewRequestDto,
  UpdateEvalExampleResultReviewRequestDto
} from '@agent-infra/contracts';

import {
  normalizeCaptureDatasetExampleResponse,
  normalizeCreateThreadResponse,
  normalizeDatasetExampleResponse,
  normalizeDatasetExamplesResponse,
  normalizeDatasetResponse,
  normalizeDatasetsResponse,
  normalizeEvalExampleResultResponse,
  normalizeEvalExampleResultsResponse,
  normalizeEvalRunResponse,
  normalizeEvalRunsResponse,
  normalizeRunTraceResponse,
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
  projection?: 'chat' | 'canonical';
  signal?: AbortSignal;
};

export async function fetchThreadsResponse() {
  return fetchJson<ThreadsResponseDto>('/api/threads', normalizeThreadsResponse);
}

export async function fetchRuntimeMetaResponse() {
  return fetchJson<Partial<RuntimePiMetaDto>>('/api/meta', normalizeRuntimeMetaResponse);
}

export async function fetchDatasetsResponse(signal?: AbortSignal) {
  return fetchJson<DatasetsResponseDto>('/api/datasets', normalizeDatasetsResponse, { signal });
}

export async function createDatasetResponse(body: CreateDatasetRequestDto, signal?: AbortSignal) {
  return fetchJson<DatasetResponseDto>('/api/datasets', normalizeDatasetResponse, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });
}

export async function fetchDatasetExamplesResponse(datasetId: string, signal?: AbortSignal) {
  return fetchJson<DatasetExamplesResponseDto>(`/api/datasets/${datasetId}/examples`, normalizeDatasetExamplesResponse, { signal });
}

export async function fetchDatasetExampleResponse(datasetId: string, exampleId: string, signal?: AbortSignal) {
  return fetchJson<DatasetExampleResponseDto>(`/api/datasets/${datasetId}/examples/${exampleId}`, normalizeDatasetExampleResponse, { signal });
}

export async function captureDatasetExampleFromRunResponse(
  datasetId: string,
  body: CaptureDatasetExampleFromRunRequestDto,
  signal?: AbortSignal
) {
  return fetchJson<CaptureDatasetExampleResponseDto>(`/api/datasets/${datasetId}/examples/capture-run`, normalizeCaptureDatasetExampleResponse, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });
}

export async function updateDatasetExampleExpectedOutputResponse(
  datasetId: string,
  exampleId: string,
  body: UpdateDatasetExampleExpectedOutputRequestDto,
  signal?: AbortSignal
) {
  return fetchJson<DatasetExampleResponseDto>(`/api/datasets/${datasetId}/examples/${exampleId}/expected-output`, normalizeDatasetExampleResponse, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });
}

export async function updateDatasetExampleReviewResponse(
  datasetId: string,
  exampleId: string,
  body: UpdateDatasetExampleReviewRequestDto,
  signal?: AbortSignal
) {
  return fetchJson<DatasetExampleResponseDto>(`/api/datasets/${datasetId}/examples/${exampleId}/review`, normalizeDatasetExampleResponse, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });
}

export async function fetchDatasetEvalRunsResponse(datasetId: string, signal?: AbortSignal) {
  return fetchJson<EvalRunsResponseDto>(`/api/datasets/${datasetId}/eval-runs`, normalizeEvalRunsResponse, { signal });
}

export async function createEvalRunResponse(datasetId: string, body: CreateEvalRunRequestDto, signal?: AbortSignal) {
  return fetchJson<EvalRunResponseDto>(`/api/datasets/${datasetId}/eval-runs`, normalizeEvalRunResponse, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });
}

export async function runEvalRunResponse(evalRunId: string, signal?: AbortSignal) {
  return fetchJson<EvalRunResponseDto>(`/api/eval-runs/${evalRunId}/run`, normalizeEvalRunResponse, {
    method: 'POST',
    signal
  });
}

export async function fetchEvalRunResponse(evalRunId: string, signal?: AbortSignal) {
  return fetchJson<EvalRunResponseDto>(`/api/eval-runs/${evalRunId}`, normalizeEvalRunResponse, { signal });
}

export async function fetchEvalExampleResultsResponse(evalRunId: string, signal?: AbortSignal) {
  return fetchJson<EvalExampleResultsResponseDto>(`/api/eval-runs/${evalRunId}/results`, normalizeEvalExampleResultsResponse, { signal });
}

export async function updateEvalExampleResultReviewResponse(
  evalRunId: string,
  resultId: string,
  body: UpdateEvalExampleResultReviewRequestDto,
  signal?: AbortSignal
) {
  return fetchJson<EvalExampleResultResponseDto>(
    `/api/eval-runs/${evalRunId}/results/${resultId}/review`,
    normalizeEvalExampleResultResponse,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal
    }
  );
}

export async function fetchRunTimelineResponse(runId: string, signal?: AbortSignal) {
  return fetchJson<RunTimelineResponseDto>(`/api/runs/${runId}/timeline`, normalizeRunTimelineResponse, { signal });
}

export async function fetchRunTraceResponse(runId: string, signal?: AbortSignal) {
  return fetchJson<RunTraceResponseDto>(`/api/runs/${runId}/trace`, normalizeRunTraceResponse, { signal });
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
  if (resolvedOptions.projection) {
    searchParams.set('projection', resolvedOptions.projection);
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

export async function openThreadRunAttachStream(
  threadId: string,
  runId: string,
  signal: AbortSignal
): Promise<RunStreamOpenResult> {
  const url = `/api/threads/${threadId}/runs/${runId}/attach-stream`;
  const startedAt = performance.now();
  const response = await fetch(url, {
    method: 'GET',
    signal
  });
  const headersDurationMs = Number((performance.now() - startedAt).toFixed(1));
  const diagnostics = readResponseDiagnostics(response);

  emitApiDiagnostic({
    durationMs: headersDurationMs,
    headersDurationMs,
    kind: 'stream-open',
    method: 'GET',
    ok: response.ok,
    requestId: diagnostics.requestId,
    serverTiming: diagnostics.serverTiming,
    serverTimingEntries: diagnostics.serverTimingEntries,
    status: response.status,
    url
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
