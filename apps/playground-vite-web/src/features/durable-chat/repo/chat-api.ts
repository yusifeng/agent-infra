import {
  fetchRunTimelineResponse,
  fetchThreadMessagesResponse,
  fetchThreadRunsResponse,
  type FetchThreadMessagesOptions
} from '@agent-infra/durable-chat-client';

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
