import { buildRunTimelineErrorResponse, buildRunTimelineResponse, getRouteErrorStatus } from '@agent-infra/durable-chat-server';

import { loadAccessibleRun, requirePlaygroundUser } from '@/lib/playground-thread-access';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { id: runId } = await params;
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const services = await getPlaygroundAppServices();
    const { app } = services;
    await loadAccessibleRun(services, runId, auth.user.id);
    const timeline = await app.runs.getTimeline({ runId });
    return Response.json(buildRunTimelineResponse(timeline));
  } catch (error) {
    return Response.json(buildRunTimelineErrorResponse(error, 'failed to load run timeline'), {
      status: getRouteErrorStatus(error)
    });
  }
}
