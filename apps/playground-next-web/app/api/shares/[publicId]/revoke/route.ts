import {
  buildRevokeChatShareErrorResponse,
  buildRevokeChatShareResponse,
  getRouteErrorStatus
} from '@agent-infra/durable-chat-server';

import { loadAccessibleShare, requirePlaygroundUser } from '@/lib/playground-thread-access';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { publicId } = await params;
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const services = await getPlaygroundAppServices();
    await loadAccessibleShare(services, publicId, auth.user.id);
    const share = await services.app.shares.revoke({ publicId });
    return Response.json(buildRevokeChatShareResponse(share));
  } catch (error) {
    return Response.json(buildRevokeChatShareErrorResponse(error, 'failed to revoke share'), {
      status: getRouteErrorStatus(error)
    });
  }
}
