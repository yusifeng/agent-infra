import crypto from 'node:crypto';

import type { RuntimePiMessagesResponseDto, RuntimePiRunResponseDto } from '@agent-infra/contracts';
import { runAssistantTurnWithPi } from '@agent-infra/runtime-pi';

import { toMessageDto, toRunDto, toRunEventSummaryDto, toToolInvocationSummaryDto } from '@/lib/runtime-pi-dto';
import { dbReady, getRuntimePiMeta, runtimePiRepos } from '@/lib/runtime-pi-repo';

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  await dbReady;
  const { threadId } = await params;

  const thread = await runtimePiRepos.threadRepo.findById(threadId);
  if (!thread) {
    const response: RuntimePiMessagesResponseDto = { error: 'thread not found' };
    return Response.json(response, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  const provider = typeof body?.provider === 'string' ? body.provider.trim() : undefined;
  const model = typeof body?.model === 'string' ? body.model.trim() : undefined;
  if (!text) {
    const response: RuntimePiMessagesResponseDto = { error: 'text is required' };
    return Response.json(response, { status: 400 });
  }

  const runtime = getRuntimePiMeta({ provider, model });
  if (!runtime.configured) {
    const response: RuntimePiMessagesResponseDto = { error: runtime.configError ?? 'runtime-pi is not configured' };
    return Response.json(response, { status: 400 });
  }

  const userMessage = await runtimePiRepos.messageRepo.create({
    id: crypto.randomUUID(),
    threadId,
    runId: null,
    role: 'user',
    seq: await runtimePiRepos.messageRepo.nextSeq(threadId),
    status: 'completed',
    metadata: {
      source: 'playground-web',
      runtime: 'pi'
    }
  });

  await runtimePiRepos.messageRepo.createPart({
    id: crypto.randomUUID(),
    messageId: userMessage.id,
    partIndex: 0,
    type: 'text',
    textValue: text,
    jsonValue: null
  });

  const run = await runtimePiRepos.runRepo.create({
    id: crypto.randomUUID(),
    threadId,
    triggerMessageId: userMessage.id,
    provider: runtime.provider,
    model: runtime.model,
    status: 'queued',
    usage: null,
    error: null,
    startedAt: null,
    finishedAt: null
  });

  try {
    await runAssistantTurnWithPi(
      {
        runRepo: runtimePiRepos.runRepo,
        messageRepo: runtimePiRepos.messageRepo,
        toolRepo: runtimePiRepos.toolRepo,
        runEventRepo: runtimePiRepos.runEventRepo
      },
      {
        threadId,
        runId: run.id,
        provider,
        model
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'runtime-pi request failed';
    const messages = await runtimePiRepos.messageRepo.listByThread(threadId);
    const finalRun = await runtimePiRepos.runRepo.findById(run.id);
    const response: RuntimePiRunResponseDto = {
      error: message,
      run: toRunDto(finalRun),
      messages: messages.map(toMessageDto)
    };
    return Response.json(response, { status: 500 });
  }

  const messages = await runtimePiRepos.messageRepo.listByThread(threadId);
  const finalRun = await runtimePiRepos.runRepo.findById(run.id);
  const runEvents = await runtimePiRepos.runEventRepo.listByRun(run.id);
  const toolInvocations = await runtimePiRepos.toolRepo.listByRun(run.id);

  const response: RuntimePiRunResponseDto = {
    run: toRunDto(finalRun),
    messages: messages.map(toMessageDto),
    runEvents: runEvents.map(toRunEventSummaryDto),
    toolInvocations: toolInvocations.map(toToolInvocationSummaryDto)
  };

  return Response.json(response);
}
