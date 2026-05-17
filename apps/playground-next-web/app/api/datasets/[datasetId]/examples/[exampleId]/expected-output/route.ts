import {
  buildDatasetExampleErrorResponse,
  buildDatasetExampleResponse,
  getRouteErrorStatus,
  parseUpdateDatasetExampleExpectedOutputInput
} from '@agent-infra/durable-chat-server';

import { APP_ID } from '@/constants';
import { requirePlaygroundUser } from '@/lib/playground-thread-access';

export async function PATCH(
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
    const input = parseUpdateDatasetExampleExpectedOutputInput(await req.json().catch(() => ({})));
    const services = await getPlaygroundAppServices();
    const example = await services.app.datasets.updateExampleExpectedOutput({
      appId: APP_ID,
      datasetId,
      exampleId,
      actorId: auth.user.id,
      expectedOutputJson: input.expectedOutputJson,
      metadataJson: input.metadataJson
    });
    return Response.json(buildDatasetExampleResponse(example));
  } catch (error) {
    return Response.json(buildDatasetExampleErrorResponse(error, 'failed to update dataset example'), {
      status: getRouteErrorStatus(error)
    });
  }
}
