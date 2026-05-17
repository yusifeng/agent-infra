import {
  buildDatasetExamplesErrorResponse,
  buildDatasetExamplesResponse,
  getRouteErrorStatus
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
    const examples = await services.app.datasets.listExamples({
      appId: APP_ID,
      datasetId,
      actorId: auth.user.id
    });
    return Response.json(buildDatasetExamplesResponse(examples));
  } catch (error) {
    return Response.json(buildDatasetExamplesErrorResponse(error, 'failed to list dataset examples'), {
      status: getRouteErrorStatus(error)
    });
  }
}
