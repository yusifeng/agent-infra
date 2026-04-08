import crypto from 'node:crypto';
import { runAssistantTurn } from '@agent-infra/runtime-ai-sdk';
import { dbReady, repos, runtimeInfo } from '@/lib/repo';

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  await dbReady;
  const { threadId } = await params;
  const body = await req.json();
  const text: string = body.text;

  const userMessage = await repos.messageRepo.create({
    id: crypto.randomUUID(),
    threadId,
    runId: null,
    role: 'user',
    seq: await repos.messageRepo.nextSeq(threadId),
    status: 'completed',
    metadata: null
  });

  await repos.messageRepo.createPart({
    id: crypto.randomUUID(),
    messageId: userMessage.id,
    partIndex: 0,
    type: 'text',
    textValue: text
  });

  const run = await repos.runRepo.create({
    id: crypto.randomUUID(),
    threadId,
    triggerMessageId: userMessage.id,
    provider: runtimeInfo.ai.provider,
    model: runtimeInfo.ai.model,
    status: 'queued'
  });

  await runAssistantTurn(
    {
      runRepo: repos.runRepo,
      messageRepo: repos.messageRepo,
      toolRepo: repos.toolRepo
    },
    {
      threadId,
      runId: run.id,
      provider: runtimeInfo.ai.provider,
      model: runtimeInfo.ai.model
    }
  );

  const messages = await repos.messageRepo.listByThread(threadId);
  return Response.json({ runId: run.id, messages });
}
