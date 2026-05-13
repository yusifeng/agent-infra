export {
  createThreadResponse,
  fetchRunTimelineResponse,
  fetchRuntimeMetaResponse,
  fetchThreadMessagesResponse,
  fetchThreadRunsResponse,
  fetchThreadsResponse,
  openThreadRunAttachStream,
  openThreadRunStream,
  type ApiResult,
  type RunStreamOpenResult
} from '@agent-infra/durable-chat-client';

import type {
  CreateThreadShareResponseDto,
  RevokeChatShareResponseDto,
  ThreadDto,
  ThreadShareStateResponseDto,
  ToolInvocationDto,
  UpdateThreadResponseDto
} from '@agent-infra/contracts';
import { fetchRunTimelineResponse } from '@agent-infra/durable-chat-client';
import { readApiError, readJsonRecordOrEmpty, type ApiResult } from '@agent-infra/durable-chat-client';

export type PlaygroundThreadDto = ThreadDto & {
  pinned?: boolean;
  pinnedAt?: string | null;
  runtimeProvider?: string | null;
  runtimeModel?: string | null;
};

type PlaygroundUpdateThreadResponseDto = Omit<UpdateThreadResponseDto, 'thread'> & {
  thread?: PlaygroundThreadDto;
};

type PlaygroundThreadsResponseDto = {
  threads: PlaygroundThreadDto[];
  error?: string;
};

async function fetchJson<TData>(input: RequestInfo | URL, init?: RequestInit): Promise<ApiResult<TData>> {
  const response = await fetch(input, init);
  const raw = await readJsonRecordOrEmpty(response);

  return {
    ok: response.ok,
    status: response.status,
    error: readApiError(raw),
    data: raw as TData
  };
}

export async function fetchPlaygroundThreads(signal?: AbortSignal) {
  return fetchJson<PlaygroundThreadsResponseDto>('/api/threads', {
    signal
  });
}

export async function renameThread(threadId: string, title: string, signal?: AbortSignal) {
  return fetchJson<PlaygroundUpdateThreadResponseDto>(`/api/threads/${threadId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
    signal
  });
}

export async function archiveThread(threadId: string, signal?: AbortSignal) {
  return fetchJson<PlaygroundUpdateThreadResponseDto>(`/api/threads/${threadId}/archive`, {
    method: 'POST',
    signal
  });
}

export async function pinThread(threadId: string, signal?: AbortSignal) {
  return fetchJson<PlaygroundUpdateThreadResponseDto>(`/api/threads/${threadId}/pin`, {
    method: 'POST',
    signal
  });
}

export async function unpinThread(threadId: string, signal?: AbortSignal) {
  return fetchJson<PlaygroundUpdateThreadResponseDto>(`/api/threads/${threadId}/pin`, {
    method: 'DELETE',
    signal
  });
}

export async function createThreadSnapshotShare(threadId: string, signal?: AbortSignal) {
  return fetchJson<CreateThreadShareResponseDto>(`/api/threads/${threadId}/shares`, {
    method: 'POST',
    signal
  });
}

export async function fetchCurrentThreadShare(threadId: string, signal?: AbortSignal) {
  return fetchJson<ThreadShareStateResponseDto>(`/api/threads/${threadId}/shares/current`, {
    signal
  });
}

export async function revokeThreadSnapshotShare(publicId: string, signal?: AbortSignal) {
  return fetchJson<RevokeChatShareResponseDto>(`/api/shares/${publicId}/revoke`, {
    method: 'POST',
    signal
  });
}

export async function fetchSearchToolInvocations(runId: string, toolCallIds: string[], signal?: AbortSignal) {
  const result = await fetchRunTimelineResponse(runId, signal);
  if (!result.ok) {
    return result;
  }

  const normalizedToolCallIds = new Set(toolCallIds);
  const toolInvocations = result.data.toolInvocations.filter(
    (candidate: ToolInvocationDto) => candidate.toolName === 'searchWeb' && normalizedToolCallIds.has(candidate.toolCallId)
  );

  return {
    ...result,
    data: {
      ...result.data,
      toolInvocations
    }
  };
}
