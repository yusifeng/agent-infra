import {
  buildThreadsErrorResponse,
  getRouteErrorStatus,
  parseCreateThreadTitle
} from '@agent-infra/durable-chat-server';

import { APP_ID } from '@/constants';
import { projectPlaygroundThreadList } from '@/features/thread-catalog/service/project-playground-thread-dto';
import {
  buildThreadErrorResponse,
  createThreadCatalogService,
  projectAccessibleThread,
  requirePlaygroundUser
} from '@/lib/playground-thread-access';

export async function GET(request: Request) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');

  const auth = await requirePlaygroundUser(request);
  if (auth.response) {
    return auth.response;
  }

  try {
    const services = await getPlaygroundAppServices();
    const catalogService = createThreadCatalogService(services);
    const [catalogRows, threads] = await Promise.all([
      catalogService.listVisibleCatalogRows(auth.user.id),
      services.app.threads.list({ appId: APP_ID })
    ]);
    return Response.json({ threads: projectPlaygroundThreadList(threads, catalogRows) });
  } catch (error) {
    return Response.json(buildThreadsErrorResponse(error, 'failed to list threads'), { status: getRouteErrorStatus(error) });
  }
}

export async function POST(req: Request) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');

  const body = await req.json().catch(() => ({}));
  const title = parseCreateThreadTitle(body);
  const auth = await requirePlaygroundUser(req);
  if (auth.response) {
    return auth.response;
  }

  try {
    const services = await getPlaygroundAppServices();
    const catalogService = createThreadCatalogService(services);
    const { thread, catalogRow } = await catalogService.createThreadWithCatalog({
      ownerUserId: auth.user.id,
      title,
      metadata: {
        source: 'playground-next-web',
        runtime: 'pi'
      }
    });
    return Response.json({
      thread: projectAccessibleThread({ thread, catalogRow })
    });
  } catch (error) {
    return Response.json(buildThreadErrorResponse(error, 'failed to create thread'), { status: getRouteErrorStatus(error) });
  }
}
