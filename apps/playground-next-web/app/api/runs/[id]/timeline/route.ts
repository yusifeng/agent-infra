import { buildRunTimelineErrorResponse, buildRunTimelineResponse, getRouteErrorStatus } from '@agent-infra/durable-chat-server';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { id: runId } = await params;

  try {
    const { app } = await getPlaygroundAppServices();
    const timeline = await app.runs.getTimeline({ runId });
    return Response.json(buildRunTimelineResponse(timeline));
  } catch (error) {
    return Response.json(buildRunTimelineErrorResponse(error, 'failed to load run timeline'), {
      status: getRouteErrorStatus(error)
    });
  }
}
