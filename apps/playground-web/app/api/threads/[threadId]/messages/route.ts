import type { ThreadMessagesResponseDto } from '@agent-infra/contracts';

import { toMessageDto } from '@/lib/api-dto';
import { getRouteErrorMessage, getRouteErrorStatus } from '@/lib/api-route-errors';

export async function GET(_req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { getPlaygroundReadServices } = await import('@/lib/playground-read-services');
  const { threadId } = await params;

  try {
    const { app } = await getPlaygroundReadServices();
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
