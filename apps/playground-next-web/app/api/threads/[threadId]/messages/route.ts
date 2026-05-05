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
      const messages = await app.threads.getMessages({ threadId });
      return Response.json(buildThreadMessagesResponse(messages));
    }

    const page = await app.threads.getMessagesPage({
      threadId,
      limit: query.limit,
      beforeSeq: query.before ? decodeThreadMessageCursor(query.before, threadId) : undefined,
      afterSeq: query.after ? decodeThreadMessageCursor(query.after, threadId) : undefined
    });
    return Response.json(buildThreadMessagesResponse(page));
  } catch (error) {
    return Response.json(buildThreadMessagesErrorResponse(error, 'failed to load thread messages'), {
      status: getRouteErrorStatus(error)
    });
  }
}
