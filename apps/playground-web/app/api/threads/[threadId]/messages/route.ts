import { dbReady, repos } from '@/lib/repo';

export async function GET(_req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  await dbReady;
  const { threadId } = await params;
  const messages = await repos.messageRepo.listByThread(threadId);
  return Response.json({ messages });
}
