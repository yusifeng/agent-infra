import {
  buildCaptureDatasetExampleErrorResponse,
  buildCaptureDatasetExampleResponse,
  getRouteErrorStatus,
  parseCaptureDatasetExampleFromRunInput
} from '@agent-infra/durable-chat-server';

import { APP_ID } from '@/constants';
import { loadPlaygroundDatasetCaptureMetadata } from '@/lib/playground-dataset-routes';
import { loadAccessibleRun, requirePlaygroundUser } from '@/lib/playground-thread-access';

export async function POST(req: Request, { params }: { params: Promise<{ datasetId: string }> }) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { datasetId } = await params;
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const input = parseCaptureDatasetExampleFromRunInput(await req.json().catch(() => ({})));
    const services = await getPlaygroundAppServices();
    await loadAccessibleRun(services, input.sourceRunId, auth.user.id);
    const metadataJson = await loadPlaygroundDatasetCaptureMetadata(
      services,
      input.sourceRunId,
      auth.user.id,
      input.metadataJson
    );
    const result = await services.app.datasets.captureExampleFromRun({
      appId: APP_ID,
      datasetId,
      sourceRunId: input.sourceRunId,
      actorId: auth.user.id,
      capturedByActorId: auth.user.id,
      expectedOutputJson: input.expectedOutputJson,
      metadataJson,
      omitToolInvocations: input.omitToolInvocations,
      toolInvocationOmissionReason: input.toolInvocationOmissionReason
    });

    return Response.json(buildCaptureDatasetExampleResponse(result));
  } catch (error) {
    return Response.json(buildCaptureDatasetExampleErrorResponse(error, 'failed to capture dataset example'), {
      status: getRouteErrorStatus(error)
    });
  }
}
