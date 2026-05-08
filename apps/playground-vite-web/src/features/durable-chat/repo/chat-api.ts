import {
  fetchRunTimelineResponse,
  fetchThreadMessagesResponse,
  fetchThreadRunsResponse,
  type FetchThreadMessagesOptions
} from '@agent-infra/durable-chat-client';
import type { ToolInvocationDto, UpdateThreadResponseDto } from '@agent-infra/contracts';

import { normalizeUpdateThreadResponse } from '@/features/durable-chat/schema/thread-management';

export type { FetchThreadMessagesOptions };

type UpdateThreadResult = {
  ok: boolean;
  status: number;
  error: string | null;
  data: UpdateThreadResponseDto;
};

async function fetchThreadMutation(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<UpdateThreadResult> {
  const response = await fetch(input, init);
  const raw = await response.json().catch(() => ({}));
  const data = normalizeUpdateThreadResponse(raw);

  return {
    ok: response.ok,
    status: response.status,
    error: data.error ?? null,
    data
  };
}

export async function fetchThreadMessages(threadId: string, options?: AbortSignal | FetchThreadMessagesOptions) {
  return fetchThreadMessagesResponse(threadId, options);
}

export async function fetchRunTimeline(runId: string, signal?: AbortSignal) {
  return fetchRunTimelineResponse(runId, signal);
}

export async function fetchThreadRuns(threadId: string, limit: number, signal?: AbortSignal) {
  return fetchThreadRunsResponse(threadId, limit, signal);
}

export async function renameThread(threadId: string, title: string, signal?: AbortSignal) {
  return fetchThreadMutation(`/api/threads/${threadId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
    signal
  });
}

export async function archiveThread(threadId: string, signal?: AbortSignal) {
  return fetchThreadMutation(`/api/threads/${threadId}/archive`, {
    method: 'POST',
    signal
  });
}

export async function fetchSearchToolInvocations(
  runId: string,
  toolCallIds: string[],
  signal?: AbortSignal
) {
  const result = await fetchRunTimeline(runId, signal);
  if (!result.ok) {
    return result;
  }

  const normalizedToolCallIds = new Set(toolCallIds);
  const toolInvocations = result.data.toolInvocations.filter(
    (candidate: ToolInvocationDto) =>
      candidate.toolName === 'searchWeb' && normalizedToolCallIds.has(candidate.toolCallId)
  );

  return {
    ...result,
    data: {
      ...result.data,
      toolInvocations
    }
  };
}
