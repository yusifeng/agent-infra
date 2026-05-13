import {
  buildPublicChatShareErrorResponse,
  buildPublicChatShareResponse,
  getRouteErrorStatus
} from '@agent-infra/durable-chat-server';

import { sanitizePublicShareForUi } from '@/lib/playground-share-sanitize';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { publicId } = await params;

  try {
    const services = await getPlaygroundAppServices();
    const share = await services.app.shares.getPublic({ publicId });
    return Response.json(buildPublicChatShareResponse(sanitizePublicShareForUi(share)));
  } catch (error) {
    return Response.json(buildPublicChatShareErrorResponse(error, 'failed to load public share'), {
      status: getRouteErrorStatus(error)
    });
  }
}
