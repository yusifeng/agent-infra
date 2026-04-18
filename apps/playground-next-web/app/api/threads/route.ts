import {
  buildCreateThreadErrorResponse,
  buildCreateThreadResponse,
  buildThreadsErrorResponse,
  buildThreadsResponse,
  getRouteErrorStatus,
  parseCreateThreadTitle
} from '@agent-infra/durable-chat-server';

const APP_ID = 'playground-runtime-pi';

export async function GET() {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');

  try {
    const { app } = await getPlaygroundAppServices();
    const threads = await app.threads.list({ appId: APP_ID });
    return Response.json(buildThreadsResponse(threads));
  } catch (error) {
    return Response.json(buildThreadsErrorResponse(error, 'failed to list threads'), { status: getRouteErrorStatus(error) });
  }
}

export async function POST(req: Request) {
  const { getPlaygroundAppServices } = await import('@/lib/playground-app-services');

  const body = await req.json().catch(() => ({}));
  const title = parseCreateThreadTitle(body);

  try {
    const { app } = await getPlaygroundAppServices();
    const thread = await app.threads.create({
      appId: APP_ID,
      title,
      metadata: {
        source: 'playground-next-web',
        runtime: 'pi'
      }
    });
    return Response.json(buildCreateThreadResponse(thread));
  } catch (error) {
    return Response.json(buildCreateThreadErrorResponse(error, 'failed to create thread'), { status: getRouteErrorStatus(error) });
  }
}
