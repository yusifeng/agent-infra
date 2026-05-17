import { buildEvalRunErrorResponse, buildEvalRunResponse, getRouteErrorStatus } from '@agent-infra/durable-chat-server';

import { APP_ID } from '@/constants';
import { requirePlaygroundUser } from '@/lib/playground-thread-access';

export async function POST(req: Request, { params }: { params: Promise<{ evalRunId: string }> }) {
  const { getPlaygroundRuntimeServices } = await import('@/lib/playground-services');
  const { evalRunId } = await params;
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const services = await getPlaygroundRuntimeServices();
    const evalRun = await services.app.evals.run({
      appId: APP_ID,
      evalRunId,
      actorId: auth.user.id
    });
    return Response.json(buildEvalRunResponse(evalRun));
  } catch (error) {
    return Response.json(buildEvalRunErrorResponse(error, 'failed to run eval'), {
      status: getRouteErrorStatus(error)
    });
  }
}
