import { buildThreadMessagesErrorResponse, buildThreadMessagesResponse, getRouteErrorStatus } from '@agent-infra/durable-chat-server';

export async function GET(_req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { threadId } = await params;

  try {
    const { app } = await getPlaygroundAppServices();
    const messages = await app.threads.getMessages({ threadId });
    return Response.json(buildThreadMessagesResponse(messages));
  } catch (error) {
    return Response.json(buildThreadMessagesErrorResponse(error, 'failed to load thread messages'), {
      status: getRouteErrorStatus(error)
    });
  }
}
