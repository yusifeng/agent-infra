import { buildEvalRunErrorResponse, buildEvalRunResponse, getRouteErrorStatus } from '@agent-infra/durable-chat-server';

import { APP_ID } from '@/constants';
import { requirePlaygroundUser } from '@/lib/playground-thread-access';

export async function GET(req: Request, { params }: { params: Promise<{ evalRunId: string }> }) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { evalRunId } = await params;
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const services = await getPlaygroundAppServices();
    const evalRun = await services.app.evals.get({
      appId: APP_ID,
      evalRunId,
      actorId: auth.user.id
    });
    return Response.json(buildEvalRunResponse(evalRun));
  } catch (error) {
    return Response.json(buildEvalRunErrorResponse(error, 'failed to load eval run'), {
      status: getRouteErrorStatus(error)
    });
  }
}
