import type { CreateThreadRequestDto, CreateThreadResponseDto, ThreadsResponseDto } from '@agent-infra/contracts';

import { toThreadDto } from '@/lib/runtime-pi-dto';
import { getRouteErrorMessage, getRouteErrorStatus } from '@/lib/runtime-pi-route-errors';

const APP_ID = 'playground-runtime-pi';

export async function GET() {
  const { dbReady, runtimePiApp } = await import('@/lib/runtime-pi-repo');
  await dbReady;

  try {
    const threads = await runtimePiApp.threads.list({ appId: APP_ID });
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
  const { dbReady, runtimePiApp } = await import('@/lib/runtime-pi-repo');
  await dbReady;

  const body = (await req.json().catch(() => ({}))) as CreateThreadRequestDto;
  const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : 'Runtime PI Thread';

  try {
    const thread = await runtimePiApp.threads.create({
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
