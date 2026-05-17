import {
  buildEvalExampleResultErrorResponse,
  buildEvalExampleResultResponse,
  getRouteErrorStatus,
  parseUpdateEvalExampleResultReviewInput
} from '@agent-infra/durable-chat-server';

import { APP_ID } from '@/constants';
import { requirePlaygroundUser } from '@/lib/playground-thread-access';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ evalRunId: string; resultId: string }> }
) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { evalRunId, resultId } = await params;
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const review = parseUpdateEvalExampleResultReviewInput(await req.json().catch(() => ({})));
    const services = await getPlaygroundAppServices();
    const result = await services.app.evals.updateResultReview({
      appId: APP_ID,
      evalRunId,
      resultId,
      actorId: auth.user.id,
      review
    });
    return Response.json(buildEvalExampleResultResponse(result));
  } catch (error) {
    return Response.json(buildEvalExampleResultErrorResponse(error, 'failed to update eval result review'), {
      status: getRouteErrorStatus(error)
    });
  }
}
