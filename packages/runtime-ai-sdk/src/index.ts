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
  let currentToolInvocation: { id: string; toolName: string; toolCallId: string; input: Record<string, unknown> } | null = null;
  let toolCreated = false;
  let currentToolCompleted = false;
  let assistantMessageId: string | null = null;
  let assistantPartIndex = 0;

  try {
    await ctx.runRepo.updateStatus(input.runId, 'running', { startedAt: new Date() });

    const messages = await ctx.messageRepo.listByThread(input.threadId);
    const promptText = messages
      .flatMap((m) => m.parts.filter((p) => p.type === 'text').map((p) => `${m.role}: ${p.textValue ?? ''}`))
      .join('\n');

    const assistantMessage = await ctx.messageRepo.create({
      id: crypto.randomUUID(),
      threadId: input.threadId,
      runId: input.runId,
      role: 'assistant',
      seq: await ctx.messageRepo.nextSeq(input.threadId),
      status: 'created',
      metadata: { provider: input.provider ?? 'mock', model: input.model ?? 'mock-model' }
    });
    assistantMessageId = assistantMessage.id;

    const toolCallId = crypto.randomUUID();
    const toolInput = { timezone: 'UTC' };
    currentToolInvocation = {
      id: crypto.randomUUID(),
      toolName: 'getCurrentTime',
      toolCallId,
      input: toolInput
    };

    await ctx.toolRepo.create({
      id: currentToolInvocation.id,
      threadId: input.threadId,
      runId: input.runId,
      messageId: assistantMessage.id,
      toolName: currentToolInvocation.toolName,
      toolCallId: currentToolInvocation.toolCallId,
      status: 'running',
      input: currentToolInvocation.input
    });
    toolCreated = true;

    await ctx.messageRepo.createPart({
      id: crypto.randomUUID(),
      messageId: assistantMessage.id,
      partIndex: assistantPartIndex++,
      type: 'tool-call',
      jsonValue: {
        toolName: currentToolInvocation.toolName,
        toolCallId: currentToolInvocation.toolCallId,
        input: currentToolInvocation.input
      }
    });

    const toolOutput = { now: new Date().toISOString() };
    await ctx.toolRepo.updateStatus(currentToolInvocation.id, 'completed', {
      output: toolOutput,
      finishedAt: new Date()
    });
    currentToolCompleted = true;

    await ctx.messageRepo.createPart({
      id: crypto.randomUUID(),
      messageId: assistantMessage.id,
      partIndex: assistantPartIndex++,
      type: 'tool-result',
      jsonValue: {
        toolName: currentToolInvocation.toolName,
        toolCallId: currentToolInvocation.toolCallId,
        output: toolOutput
      }
    });

    const result = await generateText({
      model: mockModel as any,
      prompt: `${promptText}\nTool[getCurrentTime] executed.`
    });

    await ctx.messageRepo.createPart({
      id: crypto.randomUUID(),
      messageId: assistantMessage.id,
      partIndex: assistantPartIndex,
      type: 'text',
      textValue: result.text
    });

    await ctx.messageRepo.updateStatus(assistantMessage.id, 'completed');
    await ctx.runRepo.updateStatus(input.runId, 'completed', {
      finishedAt: new Date(),
      usage: result.usage as Record<string, unknown>
    });

    return assistantMessage;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown run failure';
    if (toolCreated && currentToolInvocation && !currentToolCompleted) {
      await ctx.toolRepo.updateStatus(currentToolInvocation.id, 'failed', {
        error: message,
        finishedAt: new Date()
      });
      if (assistantMessageId) {
        await ctx.messageRepo.createPart({
          id: crypto.randomUUID(),
          messageId: assistantMessageId,
          partIndex: assistantPartIndex++,
          type: 'tool-result',
          jsonValue: {
            toolName: currentToolInvocation.toolName,
            toolCallId: currentToolInvocation.toolCallId,
            error: message
          }
        });
      }
    }
    if (assistantMessageId) {
      await ctx.messageRepo.updateStatus(assistantMessageId, 'failed');
    }
    await ctx.runRepo.updateStatus(input.runId, 'failed', {
      finishedAt: new Date(),
      error: message
    });
    throw error;
  }
}
