import type { RuntimePiMessagesResponseDto } from '@agent-infra/contracts';

import { toMessageDto } from '@/lib/runtime-pi-dto';
import { dbReady, runtimePiRepos } from '@/lib/runtime-pi-repo';

export async function GET(_req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  await dbReady;
  const { threadId } = await params;

  const thread = await runtimePiRepos.threadRepo.findById(threadId);
  if (!thread) {
    const response: RuntimePiMessagesResponseDto = { error: 'thread not found' };
    return Response.json(response, { status: 404 });
  }

  const messages = await runtimePiRepos.messageRepo.listByThread(threadId);
  const response: RuntimePiMessagesResponseDto = {
    messages: messages.map(toMessageDto)
  };

  return Response.json(response);
}
