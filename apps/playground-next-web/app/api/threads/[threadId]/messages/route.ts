import type { MessagePageResult, Run } from '@agent-infra/core';

import {
  buildThreadMessagesErrorResponse,
  buildThreadMessagesResponse,
  decodeThreadMessageCursor,
  getRouteErrorStatus,
  parseThreadMessagesQuery
} from '@agent-infra/durable-chat-server';

import { sanitizeMessagesForUi } from '@/lib/playground-share-sanitize';
import { loadAccessibleThread, requirePlaygroundUser } from '@/lib/playground-thread-access';

function buildSanitizedPaginatedThreadMessagesResponse(
  input: MessagePageResult & {
    activeRun?: Run | null;
  }
) {
  const response = buildThreadMessagesResponse(input);
  const sanitizedResponse = buildThreadMessagesResponse({
    messages: sanitizeMessagesForUi(input.messages),
    activeRun: 'activeRun' in input ? input.activeRun : undefined
  });

  return {
    ...response,
    messages: sanitizedResponse.messages
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { threadId } = await params;
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const services = await getPlaygroundAppServices();
    const { app } = services;
    await loadAccessibleThread(services, threadId, auth.user.id);
    const { searchParams } = new URL(req.url);
    const query = parseThreadMessagesQuery(searchParams);
    const hasPaginationParams = query.limit !== undefined || query.before !== undefined || query.after !== undefined;

    if (!hasPaginationParams) {
      const activeRunPromise = app.runs.getActiveByThread({ threadId });
      const [canonicalMessages, activeRun] = await Promise.all([app.threads.getCanonicalMessages({ threadId }), activeRunPromise]);
      return Response.json(buildThreadMessagesResponse({ messages: sanitizeMessagesForUi(canonicalMessages.messages), activeRun }));
    }

    const beforeSeq = query.before ? decodeThreadMessageCursor(query.before, threadId) : undefined;
    const afterSeq = query.after ? decodeThreadMessageCursor(query.after, threadId) : undefined;
    const activeRunPromise = app.runs.getActiveByThread({ threadId });

    const [page, activeRun] = await Promise.all([
      app.threads.getCanonicalMessagesPage({
        threadId,
        limit: query.limit,
        beforeSeq,
        afterSeq
      }),
      activeRunPromise
    ]);
    return Response.json(buildSanitizedPaginatedThreadMessagesResponse({ ...page, activeRun }));
  } catch (error) {
    return Response.json(buildThreadMessagesErrorResponse(error, 'failed to load thread messages'), {
      status: getRouteErrorStatus(error)
    });
  }
}
