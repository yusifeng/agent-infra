import type { ThreadMessagesResponseDto } from '@agent-infra/contracts';

import { toMessageDto } from '@/lib/api-dto';
import { getRouteErrorMessage, getRouteErrorStatus } from '@/lib/api-route-errors';

export async function GET(_req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { getPlaygroundServices } = await import('@/lib/playground-services');
  const { threadId } = await params;

  try {
    const { app } = await getPlaygroundServices();
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
