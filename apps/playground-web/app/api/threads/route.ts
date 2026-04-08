import crypto from 'node:crypto';
import { dbReady, repos } from '@/lib/repo';

export async function GET() {
  await dbReady;
  const threads = await repos.threadRepo.listByApp('playground-web');
  return Response.json({ threads });
}

export async function POST(req: Request) {
  await dbReady;
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'Demo Thread';

  const thread = await repos.threadRepo.create({
    id: crypto.randomUUID(),
    appId: 'playground-web',
    userId: 'demo-user',
    title,
    status: 'active',
    metadata: {}
  });
  return Response.json({ thread });
}
