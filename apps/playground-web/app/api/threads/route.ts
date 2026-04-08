import crypto from 'node:crypto';
import { repos } from '@/lib/repo';

export async function GET() {
  const threads = await repos.threadRepo.listByApp('playground-web');
  return Response.json({ threads });
}

export async function POST() {
  const thread = await repos.threadRepo.create({
    id: crypto.randomUUID(),
    appId: 'playground-web',
    userId: 'demo-user',
    title: 'Demo Thread',
    status: 'active',
    metadata: {}
  });
  return Response.json({ thread });
}
