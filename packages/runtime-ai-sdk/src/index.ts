import crypto from 'node:crypto';
import { generateText } from 'ai';
import type { MessageRepository, RunRepository, ToolInvocationRepository } from '@agent-infra/core';

export interface RuntimeContext {
  runRepo: RunRepository;
  messageRepo: MessageRepository;
  toolRepo: ToolInvocationRepository;
}

export interface RuntimeInput {
  threadId: string;
  runId: string;
  userMessageId: string;
  provider?: string;
  model?: string;
}

const mockModel = {
  provider: 'mock',
  modelId: 'mock-model',
  async doGenerate(options: any) {
    const prompt = options.prompt?.map((p: any) => p.content).join('\n') ?? '';
    return {
      text: `Mock assistant response: ${prompt.slice(0, 180)}`,
      finishReason: 'stop',
      usage: { promptTokens: 0, completionTokens: 0 }
    };
  }
};

export async function runAssistantTurn(ctx: RuntimeContext, input: RuntimeInput) {
  try {
    await ctx.runRepo.updateStatus(input.runId, 'running', { startedAt: new Date() });

    const messages = await ctx.messageRepo.listByThread(input.threadId);
    const promptText = messages
      .flatMap((m) => m.parts.filter((p) => p.type === 'text').map((p) => `${m.role}: ${p.textValue ?? ''}`))
      .join('\n');

    const toolCallId = crypto.randomUUID();
    const tool = await ctx.toolRepo.create({
      id: crypto.randomUUID(),
      threadId: input.threadId,
      runId: input.runId,
      messageId: input.userMessageId,
      toolName: 'getCurrentTime',
      toolCallId,
      status: 'running',
      input: { timezone: 'UTC' }
    });

    await ctx.toolRepo.updateStatus(tool.id, 'completed', {
      output: { now: new Date().toISOString() },
      finishedAt: new Date()
    });

    const result = await generateText({
      model: mockModel as any,
      prompt: `${promptText}\nTool[getCurrentTime] executed.`
    });

    const assistantMessage = await ctx.messageRepo.create({
      id: crypto.randomUUID(),
      threadId: input.threadId,
      runId: input.runId,
      role: 'assistant',
      seq: await ctx.messageRepo.nextSeq(input.threadId),
      status: 'completed',
      metadata: { provider: input.provider ?? 'mock', model: input.model ?? 'mock-model' }
    });

    await ctx.messageRepo.createPart({
      id: crypto.randomUUID(),
      messageId: assistantMessage.id,
      partIndex: 0,
      type: 'text',
      textValue: result.text
    });

    await ctx.runRepo.updateStatus(input.runId, 'completed', {
      finishedAt: new Date(),
      usage: result.usage as Record<string, unknown>
    });

    return assistantMessage;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown run failure';
    await ctx.runRepo.updateStatus(input.runId, 'failed', {
      finishedAt: new Date(),
      error: message
    });
    throw error;
  }
}
