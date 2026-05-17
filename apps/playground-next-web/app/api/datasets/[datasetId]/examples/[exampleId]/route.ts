import {
  buildDatasetExampleErrorResponse,
  buildDatasetExampleResponse,
  getRouteErrorStatus
} from '@agent-infra/durable-chat-server';

import { APP_ID } from '@/constants';
import { requirePlaygroundUser } from '@/lib/playground-thread-access';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ datasetId: string; exampleId: string }> }
) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { datasetId, exampleId } = await params;
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const services = await getPlaygroundAppServices();
    const example = await services.app.datasets.getExample({
      appId: APP_ID,
      datasetId,
      exampleId,
      actorId: auth.user.id
    });
    return Response.json(buildDatasetExampleResponse(example));
  } catch (error) {
    return Response.json(buildDatasetExampleErrorResponse(error, 'failed to load dataset example'), {
      status: getRouteErrorStatus(error)
    });
  }
}
