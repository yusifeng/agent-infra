import {
  buildEvalRunErrorResponse,
  buildEvalRunResponse,
  buildEvalRunsErrorResponse,
  buildEvalRunsResponse,
  getRouteErrorStatus,
  parseCreateEvalRunInput
} from '@agent-infra/durable-chat-server';

import { APP_ID } from '@/constants';
import { requirePlaygroundUser } from '@/lib/playground-thread-access';

export async function GET(req: Request, { params }: { params: Promise<{ datasetId: string }> }) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { datasetId } = await params;
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const services = await getPlaygroundAppServices();
    const evalRuns = await services.app.evals.listByDataset({
      appId: APP_ID,
      datasetId,
      actorId: auth.user.id
    });
    return Response.json(buildEvalRunsResponse(evalRuns));
  } catch (error) {
    return Response.json(buildEvalRunsErrorResponse(error, 'failed to list eval runs'), {
      status: getRouteErrorStatus(error)
    });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ datasetId: string }> }) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { datasetId } = await params;
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const input = parseCreateEvalRunInput(await req.json().catch(() => ({})));
    const services = await getPlaygroundAppServices();
    const evalRun = await services.app.evals.create({
      appId: APP_ID,
      datasetId,
      actorId: auth.user.id,
      createdByActorId: auth.user.id,
      name: input.name,
      provider: input.provider,
      model: input.model,
      runtimeOptions: input.runtimeOptions
    });
    return Response.json(buildEvalRunResponse(evalRun));
  } catch (error) {
    return Response.json(buildEvalRunErrorResponse(error, 'failed to create eval run'), {
      status: getRouteErrorStatus(error)
    });
  }
}
