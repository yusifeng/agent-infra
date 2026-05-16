import {
  buildRunFeedbackErrorResponse,
  buildRunFeedbackResponse,
  getRouteErrorStatus,
  parseSetRunFeedbackInput
} from '@agent-infra/durable-chat-server';

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
    const input = parseSetRunFeedbackInput(await req.json().catch(() => ({})));
    const runFeedback = await services.app.turns.setRunFeedback({
      threadId,
      triggerMessageId: input.triggerMessageId,
      runId,
      feedbackActorId: auth.user.id,
      value: input.value
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
    await services.app.turns.clearRunFeedback({
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
