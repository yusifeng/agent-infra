import {
  buildAnswerSelectionErrorResponse,
  buildAnswerSelectionResponse,
  getRouteErrorStatus,
  parseSelectAnswerCandidateInput
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
    const input = parseSelectAnswerCandidateInput(await req.json().catch(() => ({})));
    const answerSelection = await services.app.turns.selectAnswerCandidate({
      threadId,
      triggerMessageId: input.triggerMessageId,
      runId,
      selectedByUserId: auth.user.id
    });

    return Response.json(buildAnswerSelectionResponse(answerSelection));
  } catch (error) {
    return Response.json(buildAnswerSelectionErrorResponse(error, 'failed to select answer candidate'), {
      status: getRouteErrorStatus(error)
    });
  }
}
