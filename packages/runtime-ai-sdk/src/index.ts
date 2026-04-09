import crypto from 'node:crypto';
import { createOpenAI } from '@ai-sdk/openai';
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
  provider?: string;
  model?: string;
}

export type AiMode = 'mock' | 'real';

export interface RuntimeAiConfig {
  mode: AiMode;
  provider: string;
  model: string;
}

const mockModel = {
  // AI SDK 4 expects LanguageModelV1-compatible models.
  specificationVersion: 'v1',
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

export function resolveRuntimeAiConfigFromEnv(): RuntimeAiConfig {
  const mode = (process.env.AI_MODE ?? 'mock') as AiMode;
  if (mode === 'mock') {
    return {
      mode,
      provider: 'mock',
      model: 'mock-model'
    };
  }

  if (mode !== 'real') {
    throw new Error(`Invalid AI_MODE: ${mode}. Expected "mock" or "real".`);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('AI_MODE=real requires OPENAI_API_KEY. Set OPENAI_API_KEY or switch AI_MODE=mock.');
  }

  return {
    mode,
    provider: 'openai',
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
  };
}

function resolveModel(config: RuntimeAiConfig) {
  if (config.mode === 'mock') return mockModel as any;
  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai(config.model);
}

export async function runAssistantTurn(ctx: RuntimeContext, input: RuntimeInput) {
  let currentToolInvocation: { id: string; toolName: string; toolCallId: string; input: Record<string, unknown> } | null = null;
  let toolCreated = false;
  let currentToolCompleted = false;
  let assistantMessageId: string | null = null;
  let assistantPartIndex = 0;

  try {
    const runtimeAiConfig = resolveRuntimeAiConfigFromEnv();

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
      metadata: {
        provider: input.provider ?? runtimeAiConfig.provider,
        model: input.model ?? runtimeAiConfig.model,
        aiMode: runtimeAiConfig.mode
      }
    });
    assistantMessageId = assistantMessage.id;

    // In mock mode we intentionally vary the "shape" of the assistant response
    // to exercise UI + storage paths (tool parts vs pure text).
    const mockVariant =
      runtimeAiConfig.mode === 'mock'
        ? (['text-only', 'tool-then-text', 'structured-text'] as const)[crypto.randomInt(0, 3)]
        : null;

    let toolOutput: { now: string } | null = null;
    if (mockVariant === 'tool-then-text' || runtimeAiConfig.mode !== 'mock') {
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

      toolOutput = { now: new Date().toISOString() };
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
    }

    const promptSuffix =
      runtimeAiConfig.mode !== 'mock'
        ? '\nTool[getCurrentTime] executed.'
        : mockVariant === 'tool-then-text'
          ? `\nTool[getCurrentTime] executed. now=${toolOutput?.now ?? ''}`
          : mockVariant === 'structured-text'
            ? '\nPlease respond in 3 short bullet points and include an explicit "mock" marker.'
            : '\nPlease respond with a single short sentence.';

    const result = await generateText({
      model: resolveModel(runtimeAiConfig),
      prompt: `${promptText}${promptSuffix}`
    });

    await ctx.messageRepo.createPart({
      id: crypto.randomUUID(),
      messageId: assistantMessage.id,
      partIndex: assistantPartIndex,
      type: 'text',
      textValue: result.text
    });

    const completedMessage = await ctx.messageRepo.updateStatus(assistantMessage.id, 'completed');
    await ctx.runRepo.updateStatus(input.runId, 'completed', {
      finishedAt: new Date(),
      usage: result.usage as Record<string, unknown>
    });

    return completedMessage;
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
