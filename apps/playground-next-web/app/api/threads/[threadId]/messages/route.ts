import {
  buildThreadMessagesErrorResponse,
  buildThreadMessagesResponse,
  decodeThreadMessageCursor,
  getRouteErrorStatus,
  parseThreadMessagesQuery
} from '@agent-infra/durable-chat-server';

export async function GET(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { threadId } = await params;

  try {
    const { app } = await getPlaygroundAppServices();
    const { searchParams } = new URL(req.url);
    const query = parseThreadMessagesQuery(searchParams);
    const hasPaginationParams = query.limit !== undefined || query.before !== undefined || query.after !== undefined;

    if (!hasPaginationParams) {
      const activeRunPromise = app.runs.getActiveByThread({ threadId });
      const [messages, activeRun] = await Promise.all([app.threads.getMessages({ threadId }), activeRunPromise]);
      return Response.json(buildThreadMessagesResponse({ messages, activeRun }));
    }

    const beforeSeq = query.before ? decodeThreadMessageCursor(query.before, threadId) : undefined;
    const afterSeq = query.after ? decodeThreadMessageCursor(query.after, threadId) : undefined;
    const activeRunPromise = app.runs.getActiveByThread({ threadId });

    const [page, activeRun] = await Promise.all([
      app.threads.getMessagesPage({
        threadId,
        limit: query.limit,
        beforeSeq,
        afterSeq
      }),
      activeRunPromise
    ]);
    return Response.json(buildThreadMessagesResponse({ ...page, activeRun }));
  } catch (error) {
    return Response.json(buildThreadMessagesErrorResponse(error, 'failed to load thread messages'), {
      status: getRouteErrorStatus(error)
    });
  }
}
