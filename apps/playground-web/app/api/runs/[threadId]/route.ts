import crypto from 'node:crypto';
import { runAssistantTurn } from '@agent-infra/runtime-ai-sdk';
import { repos } from '@/lib/repo';

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
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
    provider: 'mock',
    model: 'mock-model',
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
      userMessageId: userMessage.id,
      provider: 'mock',
      model: 'mock-model'
    }
  );

  const messages = await repos.messageRepo.listByThread(threadId);
  return Response.json({ runId: run.id, messages });
}
