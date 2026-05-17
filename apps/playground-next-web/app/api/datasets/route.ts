import {
  buildDatasetErrorResponse,
  buildDatasetResponse,
  buildDatasetsErrorResponse,
  buildDatasetsResponse,
  getRouteErrorStatus,
  parseCreateDatasetInput
} from '@agent-infra/durable-chat-server';

import { APP_ID } from '@/constants';
import { requirePlaygroundUser } from '@/lib/playground-thread-access';

export async function GET(req: Request) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const services = await getPlaygroundAppServices();
    const datasets = await services.app.datasets.list({
      appId: APP_ID,
      actorId: auth.user.id
    });
    return Response.json(buildDatasetsResponse(datasets));
  } catch (error) {
    return Response.json(buildDatasetsErrorResponse(error, 'failed to list datasets'), {
      status: getRouteErrorStatus(error)
    });
  }
}

export async function POST(req: Request) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const input = parseCreateDatasetInput(await req.json().catch(() => ({})));
    const services = await getPlaygroundAppServices();
    const dataset = await services.app.datasets.create({
      appId: APP_ID,
      name: input.name,
      description: input.description,
      visibility: input.visibility,
      metadata: input.metadata,
      createdByActorId: auth.user.id
    });
    return Response.json(buildDatasetResponse(dataset));
  } catch (error) {
    return Response.json(buildDatasetErrorResponse(error, 'failed to create dataset'), {
      status: getRouteErrorStatus(error)
    });
  }
}
