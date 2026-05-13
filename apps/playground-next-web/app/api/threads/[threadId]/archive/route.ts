import { getRouteErrorStatus } from '@agent-infra/durable-chat-server';

import {
  buildThreadErrorResponse,
  createThreadCatalogService,
  loadAccessibleThread,
  projectAccessibleThread,
  requirePlaygroundUser
} from '@/lib/playground-thread-access';

export async function POST(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { threadId } = await params;
  const auth = await requirePlaygroundUser(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const services = await getPlaygroundAppServices();
    await loadAccessibleThread(services, threadId, auth.user.id);
    const thread = await services.app.threads.archive({ threadId });
    const catalogRow = await createThreadCatalogService(services).unpinThread(thread.id, new Date());
    return Response.json({
      thread: projectAccessibleThread({ thread, catalogRow })
    });
  } catch (error) {
    return Response.json(buildThreadErrorResponse(error, 'failed to archive thread'), {
      status: getRouteErrorStatus(error)
    });
  }
}
