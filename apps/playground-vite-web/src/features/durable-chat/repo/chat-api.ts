import {
  fetchRunTimelineResponse,
  fetchThreadMessagesResponse,
  fetchThreadRunsResponse,
  type FetchThreadMessagesOptions
} from '@agent-infra/durable-chat-client';
import type { ToolInvocationDto } from '@agent-infra/contracts';

export type { FetchThreadMessagesOptions };

export async function fetchThreadMessages(threadId: string, options?: AbortSignal | FetchThreadMessagesOptions) {
  return fetchThreadMessagesResponse(threadId, options);
}

export async function fetchRunTimeline(runId: string, signal?: AbortSignal) {
  return fetchRunTimelineResponse(runId, signal);
}

export async function fetchThreadRuns(threadId: string, limit: number, signal?: AbortSignal) {
  return fetchThreadRunsResponse(threadId, limit, signal);
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
