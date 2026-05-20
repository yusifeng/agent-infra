import {
  buildEvalRunCompareTriageListErrorResponse,
  buildEvalRunCompareTriageListResponse,
  getRouteErrorStatus
} from '@agent-infra/durable-chat-server';

import { APP_ID } from '@/constants';
import { requirePlaygroundUser } from '@/lib/playground-thread-access';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ evalRunId: string; candidateEvalRunId: string }> }
) {
  const { evalRunId: baselineEvalRunId, candidateEvalRunId } = await params;
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
    const services = await getPlaygroundAppServices();
    const triageRows = await services.app.evals.listCompareTriage({
      appId: APP_ID,
      baselineEvalRunId,
      candidateEvalRunId,
      actorId: auth.user.id
    });
    return Response.json(buildEvalRunCompareTriageListResponse(triageRows));
  } catch (error) {
    return Response.json(buildEvalRunCompareTriageListErrorResponse(error, 'failed to load eval run compare triage'), {
      status: getRouteErrorStatus(error)
    });
  }
}
