import type { MessageDto, RunDto, ThreadMessagesPageInfoDto } from '@agent-infra/contracts';
import type { ApiResult } from '@agent-infra/durable-chat-client';

import {
  fetchPlaygroundThreads,
  fetchThreadMessagesResponse,
  fetchThreadRunsResponse,
  type PlaygroundThreadDto
} from './chat-api';

const REPLAY_MESSAGE_PAGE_LIMIT = 100;

type ReplayThreadMessagesData = {
  messages: MessageDto[];
  pageInfo: ThreadMessagesPageInfoDto | null;
  activeRun: RunDto | null;
};

type ReplayThreadBasisData = {
  threads: PlaygroundThreadDto[];
  messages: MessageDto[];
  pageInfo: ThreadMessagesPageInfoDto | null;
  activeRun: RunDto | null;
  runs: RunDto[];
};

export async function fetchReplayThreadMessages(threadId: string, signal?: AbortSignal): Promise<ApiResult<ReplayThreadMessagesData>> {
  const messages: MessageDto[] = [];
  let pageInfo: ThreadMessagesPageInfoDto | null = null;
  let activeRun: RunDto | null = null;
  let beforeCursor: string | null = null;

  for (;;) {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    const result = await fetchThreadMessagesResponse(threadId, {
      signal,
      limit: REPLAY_MESSAGE_PAGE_LIMIT,
      before: beforeCursor,
      projection: 'canonical'
    });
    if (!result.ok) {
      return {
        ok: false,
        status: result.status,
        error: result.error,
        data: {
          messages,
          pageInfo,
          activeRun
        }
      };
    }

    messages.unshift(...(result.data.messages ?? []));
    pageInfo = result.data.pageInfo ?? null;
    activeRun = activeRun ?? result.data.activeRun ?? null;

    if (!pageInfo?.hasOlder || !pageInfo.startCursor) {
      return {
        ok: true,
        status: result.status,
        error: null,
        data: {
          messages,
          pageInfo,
          activeRun
        }
      };
    }

    beforeCursor = pageInfo.startCursor;
  }
}

export async function fetchReplayThreadBasis(threadId: string, signal?: AbortSignal): Promise<ApiResult<ReplayThreadBasisData | null>> {
  const [threadsResult, messagesResult, runsResult] = await Promise.all([
    fetchPlaygroundThreads(signal),
    fetchReplayThreadMessages(threadId, signal),
    fetchThreadRunsResponse(threadId, 20, signal)
  ]);

  if (!threadsResult.ok) {
    return {
      ok: false,
      status: threadsResult.status,
      error: threadsResult.error,
      data: null
    };
  }

  if (!messagesResult.ok) {
    return {
      ok: false,
      status: messagesResult.status,
      error: messagesResult.error,
      data: null
    };
  }

  if (!runsResult.ok) {
    return {
      ok: false,
      status: runsResult.status,
      error: runsResult.error,
      data: null
    };
  }

  return {
    ok: true,
    status: 200,
    error: null,
    data: {
      threads: threadsResult.data.threads,
      messages: messagesResult.data.messages,
      pageInfo: messagesResult.data.pageInfo,
      activeRun: messagesResult.data.activeRun,
      runs: runsResult.data.items.map((item) => item.run)
    }
  };
}
