import {
  buildRunFeedbackErrorResponse,
  buildRunFeedbackResponse,
  getRouteErrorStatus,
} from '@agent-infra/durable-chat-server';

import { parsePlaygroundSetRunFeedbackRequest } from '@/features/run-feedback/schema/playground-run-feedback-request';
import { PlaygroundRunFeedbackService } from '@/features/run-feedback/service/playground-run-feedback-service';
import { loadAccessibleThread, requirePlaygroundUser } from '@/lib/playground-thread-access';

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string; runId: string }> }) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { threadId, runId } = await params;
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const services = await getPlaygroundAppServices();
    await loadAccessibleThread(services, threadId, auth.user.id);
    const input = parsePlaygroundSetRunFeedbackRequest(await req.json().catch(() => ({})));
    const runFeedback = await new PlaygroundRunFeedbackService(services.dbConfig).setRunFeedback({
      threadId,
      runId,
      feedbackActorId: auth.user.id,
      value: input.value,
      details: input.details
    });

    return Response.json(buildRunFeedbackResponse(runFeedback));
  } catch (error) {
    return Response.json(buildRunFeedbackErrorResponse(error, 'failed to set run feedback'), {
      status: getRouteErrorStatus(error)
    });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ threadId: string; runId: string }> }) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { threadId, runId } = await params;
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const services = await getPlaygroundAppServices();
    await loadAccessibleThread(services, threadId, auth.user.id);
    await new PlaygroundRunFeedbackService(services.dbConfig).clearRunFeedback({
      threadId,
      runId,
      feedbackActorId: auth.user.id
    });

    return Response.json(buildRunFeedbackResponse(null));
  } catch (error) {
    return Response.json(buildRunFeedbackErrorResponse(error, 'failed to clear run feedback'), {
      status: getRouteErrorStatus(error)
    });
  }
}
