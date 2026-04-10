import type { CreateThreadRequestDto, CreateThreadResponseDto, ThreadsResponseDto } from '@agent-infra/contracts';

import { toThreadDto } from '@/lib/runtime-pi-dto';
import { getRouteErrorMessage, getRouteErrorStatus } from '@/lib/runtime-pi-route-errors';

const APP_ID = 'playground-runtime-pi';

export async function GET() {
  const { getRuntimePiServices } = await import('@/lib/runtime-pi-repo');

  try {
    const { app } = await getRuntimePiServices();
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
  const { getRuntimePiServices } = await import('@/lib/runtime-pi-repo');

  const body = (await req.json().catch(() => ({}))) as CreateThreadRequestDto;
  const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : 'Runtime PI Thread';

  try {
    const { app } = await getRuntimePiServices();
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
