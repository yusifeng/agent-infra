import {
  buildEvalRunCompareTriageErrorResponse,
  buildEvalRunCompareTriageResponse,
  getRouteErrorStatus,
  parseUpdateEvalRunCompareTriageInput
} from '@agent-infra/durable-chat-server';

import { APP_ID } from '@/constants';
import { requirePlaygroundUser } from '@/lib/playground-thread-access';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ evalRunId: string; candidateEvalRunId: string; datasetExampleId: string }> }
) {
  const { evalRunId: baselineEvalRunId, candidateEvalRunId, datasetExampleId } = await params;
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const triage = parseUpdateEvalRunCompareTriageInput(await req.json().catch(() => ({})));
    const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
    const services = await getPlaygroundAppServices();
    const result = await services.app.evals.updateCompareTriage({
      appId: APP_ID,
      baselineEvalRunId,
      candidateEvalRunId,
      datasetExampleId,
      actorId: auth.user.id,
      triage
    });
    return Response.json(buildEvalRunCompareTriageResponse(result));
  } catch (error) {
    return Response.json(buildEvalRunCompareTriageErrorResponse(error, 'failed to update eval run compare triage'), {
      status: getRouteErrorStatus(error)
    });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ evalRunId: string; candidateEvalRunId: string; datasetExampleId: string }> }
) {
  const { evalRunId: baselineEvalRunId, candidateEvalRunId, datasetExampleId } = await params;
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
    const services = await getPlaygroundAppServices();
    await services.app.evals.deleteCompareTriage({
      appId: APP_ID,
      baselineEvalRunId,
      candidateEvalRunId,
      datasetExampleId,
      actorId: auth.user.id
    });
    return Response.json(buildEvalRunCompareTriageResponse(null));
  } catch (error) {
    return Response.json(buildEvalRunCompareTriageErrorResponse(error, 'failed to delete eval run compare triage'), {
      status: getRouteErrorStatus(error)
    });
  }
}
