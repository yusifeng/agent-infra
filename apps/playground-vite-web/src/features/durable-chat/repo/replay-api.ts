import type { MessageDto, RunDto, ThreadMessagesPageInfoDto } from '@agent-infra/contracts';

import { fetchThreadMessages, fetchThreadRuns, fetchThreads } from '@/features/durable-chat/repo/chat-api';
import type { DurableThreadDto } from '@/features/durable-chat/types/thread';

const REPLAY_MESSAGE_PAGE_LIMIT = 100;

export async function fetchReplayThreads(signal?: AbortSignal) {
  const result = await fetchThreads(signal);
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }

  return result;
}

export async function fetchReplayThreadMessages(threadId: string, signal?: AbortSignal) {
  const messages: MessageDto[] = [];
  let pageInfo: ThreadMessagesPageInfoDto | null = null;
  let activeRun: RunDto | null = null;
  let beforeCursor: string | null = null;

  for (;;) {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    const result = await fetchThreadMessages(threadId, {
      signal,
      limit: REPLAY_MESSAGE_PAGE_LIMIT,
      before: beforeCursor
    });
    if (!result.ok) {
      return result;
    }

    messages.unshift(...(result.data.messages ?? []));
    pageInfo = result.data.pageInfo ?? null;
    activeRun = activeRun ?? result.data.activeRun ?? null;

    if (!pageInfo?.hasOlder || !pageInfo.startCursor) {
      return {
        ...result,
        data: {
          ...result.data,
          messages,
          pageInfo,
          activeRun
        }
      };
    }

    beforeCursor = pageInfo.startCursor;
  }
}

export async function fetchReplayThreadBasis(threadId: string, signal?: AbortSignal) {
  const [threadsResult, messagesResult, runsResult] = await Promise.all([
    fetchReplayThreads(signal),
    fetchReplayThreadMessages(threadId, signal),
    fetchThreadRuns(threadId, 20, signal)
  ]);

  if (!threadsResult.ok) {
    return {
      ok: false as const,
      status: threadsResult.status,
      error: threadsResult.error,
      data: null
    };
  }

  if (!messagesResult.ok) {
    return {
      ok: false as const,
      status: messagesResult.status,
      error: messagesResult.error,
      data: null
    };
  }

  if (!runsResult.ok) {
    return {
      ok: false as const,
      status: runsResult.status,
      error: runsResult.error,
      data: null
    };
  }

  return {
      ok: true as const,
      status: 200,
      error: null,
      data: {
        threads: threadsResult.data.threads as DurableThreadDto[],
        messages: messagesResult.data.messages ?? [],
        pageInfo: messagesResult.data.pageInfo ?? null,
        activeRun: messagesResult.data.activeRun ?? null,
      runs: runsResult.data.runs
    }
  };
}
