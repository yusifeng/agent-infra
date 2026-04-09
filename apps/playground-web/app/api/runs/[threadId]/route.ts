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

  // Deterministic ReAct test:
  // When user sends exactly "1" (and mock mode), run performs:
  // text → tool → text → tool → text (multi-request within a single runId).
  if (runtimeInfo.ai.mode === 'mock' && text.trim() === '1') {
    await repos.runRepo.updateStatus(run.id, 'running', { startedAt: new Date() });

    const assistantMessage = await repos.messageRepo.create({
      id: crypto.randomUUID(),
      threadId,
      runId: run.id,
      role: 'assistant',
      seq: await repos.messageRepo.nextSeq(threadId),
      status: 'created',
      metadata: { provider: runtimeInfo.ai.provider, model: runtimeInfo.ai.model, aiMode: runtimeInfo.ai.mode }
    });

    await repos.messageRepo.createPart({
      id: crypto.randomUUID(),
      messageId: assistantMessage.id,
      partIndex: 0,
      type: 'text',
      textValue: '（step 1/5）文字：我先调用一次工具来继续。'
    });

    const toolCallId = crypto.randomUUID();
    const toolInvocation = await repos.toolRepo.create({
      id: crypto.randomUUID(),
      threadId,
      runId: run.id,
      messageId: assistantMessage.id,
      toolName: 'getCurrentTime',
      toolCallId,
      status: 'pending',
      input: { timezone: 'UTC' }
    });

    await repos.messageRepo.createPart({
      id: crypto.randomUUID(),
      messageId: assistantMessage.id,
      partIndex: 1,
      type: 'tool-call',
      jsonValue: { toolName: toolInvocation.toolName, toolCallId: toolInvocation.toolCallId, input: toolInvocation.input }
    });

    await repos.messageRepo.updateStatus(assistantMessage.id, 'completed');

    const messages = await repos.messageRepo.listByThread(threadId);
    return Response.json({
      runId: run.id,
      messages,
      nextAction: {
        kind: 'tool',
        toolInvocationId: toolInvocation.id,
        toolCallId: toolInvocation.toolCallId,
        toolName: toolInvocation.toolName,
        input: toolInvocation.input
      }
    });
  }

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
