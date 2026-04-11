import type { CreateThreadRequestDto, CreateThreadResponseDto, ThreadsResponseDto } from '@agent-infra/contracts';

import { toThreadDto } from '@/lib/api-dto';
import { getRouteErrorMessage, getRouteErrorStatus } from '@/lib/api-route-errors';

const APP_ID = 'playground-runtime-pi';

export async function GET() {
  const { getPlaygroundReadServices } = await import('@/lib/playground-read-services');

  try {
    const { app } = await getPlaygroundReadServices();
    const threads = await app.threads.list({ appId: APP_ID });
    const response: ThreadsResponseDto = {
      threads: threads.map(toThreadDto)
    };
    return Response.json(response);
  } catch (error) {
    return Response.json(
      {
        threads: [],
        error: getRouteErrorMessage(error, 'failed to list threads')
      },
      { status: getRouteErrorStatus(error) }
    );
  }
}

export async function POST(req: Request) {
  const { getPlaygroundReadServices } = await import('@/lib/playground-read-services');

  const body = (await req.json().catch(() => ({}))) as CreateThreadRequestDto;
  const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : 'New Thread';

  try {
    const { app } = await getPlaygroundReadServices();
    const thread = await app.threads.create({
      appId: APP_ID,
      title,
      metadata: {
        source: 'playground-web',
        runtime: 'pi'
      }
    });

    const response: CreateThreadResponseDto = {
      thread: toThreadDto(thread)
    };

    return Response.json(response);
  } catch (error) {
    return Response.json(
      {
        error: getRouteErrorMessage(error, 'failed to create thread')
      },
      { status: getRouteErrorStatus(error) }
    );
  }
}
