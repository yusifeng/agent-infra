import {
  buildEvalExampleResultsErrorResponse,
  buildEvalExampleResultsResponse,
  getRouteErrorStatus
} from '@agent-infra/durable-chat-server';

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
    const results = await services.app.evals.listResults({
      appId: APP_ID,
      evalRunId,
      actorId: auth.user.id
    });
    return Response.json(buildEvalExampleResultsResponse(results));
  } catch (error) {
    return Response.json(buildEvalExampleResultsErrorResponse(error, 'failed to list eval results'), {
      status: getRouteErrorStatus(error)
    });
  }
}
