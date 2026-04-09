import crypto from 'node:crypto';
import { dbReady, repos, runtimeInfo } from '@/lib/repo';

type ToolResultBody = {
  toolInvocationId: string;
  toolCallId: string;
  toolName: string;
  output?: Record<string, unknown> | null;
  error?: string | null;
};

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string; runId: string }> }) {
  await dbReady;
  const { threadId, runId } = await params;

  const run = await repos.runRepo.findById(runId);
  if (!run || run.threadId !== threadId) {
    return Response.json({ error: 'run not found' }, { status: 404 });
  }

  const body = (await req.json()) as ToolResultBody;
  if (!body?.toolInvocationId || !body?.toolCallId || !body?.toolName) {
    return Response.json({ error: 'missing toolInvocationId/toolCallId/toolName' }, { status: 400 });
  }

  // Mark tool invocation complete in DB and append tool-result part.
  await repos.toolRepo.updateStatus(body.toolInvocationId, body.error ? 'failed' : 'completed', {
    output: body.output ?? null,
    error: body.error ?? null,
    finishedAt: new Date()
  });

  // Create a new assistant message that consumes the tool result and responds.
  const assistantMessage = await repos.messageRepo.create({
    id: crypto.randomUUID(),
    threadId,
    runId,
    role: 'assistant',
    seq: await repos.messageRepo.nextSeq(threadId),
    status: 'created',
    metadata: { provider: runtimeInfo.ai.provider, model: runtimeInfo.ai.model, aiMode: runtimeInfo.ai.mode }
  });

  await repos.messageRepo.createPart({
    id: crypto.randomUUID(),
    messageId: assistantMessage.id,
    partIndex: 0,
    type: 'tool-result',
    jsonValue: {
      toolName: body.toolName,
      toolCallId: body.toolCallId,
      output: body.output ?? null,
      error: body.error ?? null
    }
  });

  // ReAct continuation for the deterministic "1" test:
  // If this run has seen fewer than 2 tool-calls so far, emit another text+tool-call.
  // Otherwise emit final text and complete the run.
  const threadMessages = await repos.messageRepo.listByThread(threadId);
  const toolCallCountForRun = threadMessages.reduce((acc, m) => {
    if (m.runId !== runId) return acc;
    return acc + m.parts.filter((p) => p.type === 'tool-call').length;
  }, 0);

  const now = body.output?.now ?? null;
  if (runtimeInfo.ai.mode === 'mock' && toolCallCountForRun < 2) {
    await repos.messageRepo.createPart({
      id: crypto.randomUUID(),
      messageId: assistantMessage.id,
      partIndex: 1,
      type: 'text',
      textValue: `（step 3/5）文字：收到工具结果 now=${String(now)}，我再调用一次工具。`
    });

    const toolCallId2 = crypto.randomUUID();
    const toolInvocation2 = await repos.toolRepo.create({
      id: crypto.randomUUID(),
      threadId,
      runId,
      messageId: assistantMessage.id,
      toolName: 'getCurrentTime',
      toolCallId: toolCallId2,
      status: 'pending',
      input: { timezone: 'UTC' }
    });

    await repos.messageRepo.createPart({
      id: crypto.randomUUID(),
      messageId: assistantMessage.id,
      partIndex: 2,
      type: 'tool-call',
      jsonValue: { toolName: toolInvocation2.toolName, toolCallId: toolInvocation2.toolCallId, input: toolInvocation2.input }
    });

    await repos.messageRepo.updateStatus(assistantMessage.id, 'completed');
    const updated = await repos.messageRepo.listByThread(threadId);
    return Response.json({
      runId,
      messages: updated,
      nextAction: {
        kind: 'tool',
        toolInvocationId: toolInvocation2.id,
        toolCallId: toolInvocation2.toolCallId,
        toolName: toolInvocation2.toolName,
        input: toolInvocation2.input
      }
    });
  }

  await repos.messageRepo.createPart({
    id: crypto.randomUUID(),
    messageId: assistantMessage.id,
    partIndex: 1,
    type: 'text',
    textValue: `（step 5/5）文字：第二次工具结果已收到 now=${String(now)}。流程结束。`
  });

  await repos.messageRepo.updateStatus(assistantMessage.id, 'completed');
  await repos.runRepo.updateStatus(runId, 'completed', { finishedAt: new Date(), usage: null });

  const updated = await repos.messageRepo.listByThread(threadId);
  return Response.json({ runId, messages: updated, nextAction: null });
}

