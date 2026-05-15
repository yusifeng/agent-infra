import { buildRunTraceErrorResponse, buildRunTraceResponse, getRouteErrorStatus } from '@agent-infra/durable-chat-server';

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
    const trace = await app.runs.getTrace({ runId });
    return Response.json(buildRunTraceResponse(trace));
  } catch (error) {
    return Response.json(buildRunTraceErrorResponse(error, 'failed to load run trace'), {
      status: getRouteErrorStatus(error)
    });
  }
}
