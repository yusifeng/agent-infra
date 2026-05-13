import {
  getRouteErrorStatus,
  parseRenameThreadTitle
} from '@agent-infra/durable-chat-server';

import {
  buildThreadErrorResponse,
  loadAccessibleThread,
  projectAccessibleThread,
  requirePlaygroundUser
} from '@/lib/playground-thread-access';

export async function GET(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { threadId } = await params;
  const auth = await requirePlaygroundUser(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const services = await getPlaygroundAppServices();
    const threadAccess = await loadAccessibleThread(services, threadId, auth.user.id);
    return Response.json({ thread: projectAccessibleThread(threadAccess) });
  } catch (error) {
    return Response.json(buildThreadErrorResponse(error, 'failed to load thread'), {
      status: getRouteErrorStatus(error)
    });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');
  const { threadId } = await params;
  const body = await request.json().catch(() => ({}));
  const title = parseRenameThreadTitle(body);
  const auth = await requirePlaygroundUser(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const services = await getPlaygroundAppServices();
    const { catalogRow } = await loadAccessibleThread(services, threadId, auth.user.id);
    const thread = await services.app.threads.rename({ threadId, title });
    return Response.json({
      thread: projectAccessibleThread({ thread, catalogRow })
    });
  } catch (error) {
    return Response.json(buildThreadErrorResponse(error, 'failed to rename thread'), {
      status: getRouteErrorStatus(error)
    });
  }
}
