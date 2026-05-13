import {
  buildCreateThreadShareErrorResponse,
  buildCreateThreadShareResponse,
  getRouteErrorStatus
} from '@agent-infra/durable-chat-server';

import { loadAccessibleThread, requirePlaygroundUser } from '@/lib/playground-thread-access';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { threadId } = await params;
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const services = await getPlaygroundAppServices();
    await loadAccessibleThread(services, threadId, auth.user.id);
    const share = await services.app.shares.createThreadSnapshot({ threadId });
    return Response.json(buildCreateThreadShareResponse(share));
  } catch (error) {
    return Response.json(buildCreateThreadShareErrorResponse(error, 'failed to create thread share'), {
      status: getRouteErrorStatus(error)
    });
  }
}
