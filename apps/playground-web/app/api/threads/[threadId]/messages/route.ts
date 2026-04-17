import type { ThreadMessagesResponseDto } from '@agent-infra/contracts';

import { getRouteErrorMessage, getRouteErrorStatus, toMessageDto } from '@agent-infra/durable-chat-server';

export async function GET(_req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { threadId } = await params;

  try {
    const { app } = await getPlaygroundAppServices();
    const messages = await app.threads.getMessages({ threadId });
    const response: ThreadMessagesResponseDto = {
      messages: messages.map(toMessageDto)
    };

    return Response.json(response);
  } catch (error) {
    const response: ThreadMessagesResponseDto = {
      error: getRouteErrorMessage(error, 'failed to load thread messages')
    };
    return Response.json(response, { status: getRouteErrorStatus(error) });
  }
}
