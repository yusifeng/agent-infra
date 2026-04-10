import crypto from 'node:crypto';

import type { RuntimePiCreateThreadResponseDto, RuntimePiThreadsResponseDto } from '@agent-infra/contracts';

import { toThreadDto } from '@/lib/runtime-pi-dto';
import { dbReady, runtimePiRepos } from '@/lib/runtime-pi-repo';

const APP_ID = 'playground-runtime-pi';

export async function GET() {
  await dbReady;
  const threads = await runtimePiRepos.threadRepo.listByApp(APP_ID);
  const response: RuntimePiThreadsResponseDto = {
    threads: threads.map(toThreadDto)
  };
  return Response.json(response);
}

export async function POST(req: Request) {
  await dbReady;

  const body = await req.json().catch(() => ({}));
  const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : 'Runtime PI Thread';

  const thread = await runtimePiRepos.threadRepo.create({
    id: crypto.randomUUID(),
    appId: APP_ID,
    userId: null,
    title,
    status: 'active',
    metadata: {
      source: 'playground-web',
      runtime: 'pi'
    },
    archivedAt: null
  });

  const response: RuntimePiCreateThreadResponseDto = {
    thread: toThreadDto(thread)
  };

  return Response.json(response);
}
