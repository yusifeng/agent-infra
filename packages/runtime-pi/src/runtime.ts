import crypto from 'node:crypto';

import type { Message as StoredMessage } from '@agent-infra/core';
import type { AgentEvent, AgentTool } from '@mariozechner/pi-agent-core';
import { Agent } from '@mariozechner/pi-agent-core';
import { getModels, type AssistantMessage, type Message as PiMessage, type Model, type ToolResultMessage } from '@mariozechner/pi-ai';

import { buildInitialAgentState, convertToLlm } from './messages';
import { createDemoTools } from './tools';
import type { RuntimePiConfig, RuntimePiContext, RuntimePiInput, RuntimePiModelOption, RuntimePiProvider } from './types';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant.';

const RUNTIME_PI_MODEL_OPTIONS: RuntimePiModelOption[] = [
  {
    key: 'deepseek:deepseek-chat',
    provider: 'deepseek',
    model: 'deepseek-chat',
    label: 'DeepSeek · deepseek-chat',
    description: 'DeepSeek chat model via the official OpenAI-compatible endpoint.'
  },
  {
    key: 'deepseek:deepseek-reasoner',
    provider: 'deepseek',
    model: 'deepseek-reasoner',
    label: 'DeepSeek · deepseek-reasoner',
    description: 'DeepSeek reasoning model via the official OpenAI-compatible endpoint.'
  },
  {
    key: 'openai:gpt-4o-mini',
    provider: 'openai',
    model: 'gpt-4o-mini',
    label: 'OpenAI · gpt-4o-mini',
    description: 'Fast OpenAI baseline for durable runtime smoke tests.'
  }
];

type RuntimePiState = {
  nextMessageSeq: number;
  nextRunEventSeq: number;
  currentAssistantMessageId: string | null;
  nextPartIndexByMessageId: Map<string, number>;
  toolInvocationByCallId: Map<string, { id: string; messageId: string }>;
  persistedToolCallIds: Set<string>;
};

export type RuntimePiInternalOptions = {
  model?: Model<any>;
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
  systemPrompt?: string;
  tools?: AgentTool[];
};

function createDeepseekModel(modelId: string): Model<any> {
  if (modelId !== 'deepseek-chat' && modelId !== 'deepseek-reasoner') {
    throw new Error(`Unknown DeepSeek model: ${modelId}`);
  }

  return {
    id: modelId,
    name: modelId === 'deepseek-reasoner' ? 'DeepSeek Reasoner' : 'DeepSeek Chat',
    api: 'openai-completions',
    provider: 'deepseek',
    baseUrl: DEEPSEEK_BASE_URL,
    reasoning: modelId === 'deepseek-reasoner',
    input: ['text'],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0
    },
    contextWindow: 128_000,
    maxTokens: 8_192
  };
}

function findModelOption(provider: RuntimePiProvider, model: string) {
  return RUNTIME_PI_MODEL_OPTIONS.find((option) => option.provider === provider && option.model === model);
}

function resolvePreferredOption(preferred: Pick<RuntimePiInput, 'provider' | 'model'> = {}) {
  if (!preferred.provider && !preferred.model) {
    return null;
  }

  if (preferred.provider && preferred.model) {
    const option = findModelOption(preferred.provider as RuntimePiProvider, preferred.model);
    if (option) {
      return option;
    }

    if (preferred.provider === 'openai') {
      return {
        key: `openai:${preferred.model}`,
        provider: 'openai',
        model: preferred.model,
        label: `OpenAI · ${preferred.model}`,
        description: 'OpenAI model provided explicitly.'
      };
    }

    throw new Error(`Unsupported runtime-pi model selection: ${preferred.provider}:${preferred.model}`);
  }

  if (preferred.model) {
    const matches = RUNTIME_PI_MODEL_OPTIONS.filter((option) => option.model === preferred.model);
    if (matches.length === 1) {
      return matches[0];
    }

    throw new Error(`runtime-pi could not infer a provider for model ${preferred.model}.`);
  }

  throw new Error('runtime-pi requires both provider and model when selecting a provider explicitly.');
}

export function listRuntimePiModelOptions(): RuntimePiModelOption[] {
  return RUNTIME_PI_MODEL_OPTIONS.map((option) => ({ ...option }));
}

export function listAvailableRuntimePiModelOptionsFromEnv(): RuntimePiModelOption[] {
  const hasDeepseek = Boolean(process.env.DEEPSEEK_API_KEY?.trim());
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY?.trim());
  const openAiEnvModel = process.env.OPENAI_MODEL?.trim();

  const options = RUNTIME_PI_MODEL_OPTIONS.filter((option) => {
    if (option.provider === 'deepseek') {
      return hasDeepseek;
    }

    return hasOpenAi;
  }).map((option) => ({ ...option }));

  if (hasOpenAi && openAiEnvModel && !options.some((option) => option.provider === 'openai' && option.model === openAiEnvModel)) {
    options.unshift({
      key: `openai:${openAiEnvModel}`,
      provider: 'openai',
      model: openAiEnvModel,
      label: `OpenAI · ${openAiEnvModel}`,
      description: 'OpenAI model selected from OPENAI_MODEL.'
    });
  }

  return options;
}

export function resolveRuntimePiConfigFromEnv(preferred: Pick<RuntimePiInput, 'provider' | 'model'> = {}): RuntimePiConfig {
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const preferredOption = resolvePreferredOption(preferred);

  if (preferredOption) {
    if (preferredOption.provider === 'deepseek') {
      if (!deepseekKey) {
        throw new Error(`runtime-pi requires DEEPSEEK_API_KEY for ${preferredOption.model}.`);
      }

      return {
        provider: 'deepseek',
        model: preferredOption.model,
        apiKey: deepseekKey
      };
    }

    if (!openAiKey) {
      throw new Error(`runtime-pi requires OPENAI_API_KEY for ${preferredOption.model}.`);
    }

    return {
      provider: 'openai',
      model: preferredOption.model,
      apiKey: openAiKey
    };
  }

  if (deepseekKey) {
    return {
      provider: 'deepseek',
      model: DEFAULT_DEEPSEEK_MODEL,
      apiKey: deepseekKey
    };
  }

  if (openAiKey) {
    return {
      provider: 'openai',
      model: process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
      apiKey: openAiKey
    };
  }

  throw new Error('runtime-pi requires DEEPSEEK_API_KEY or OPENAI_API_KEY.');
}

function resolveOpenAiModel(modelId: string): Model<any> {
  const model = getModels('openai').find((candidate) => candidate.id === modelId);
  if (!model) {
    throw new Error(`Unknown OpenAI model: ${modelId}`);
  }

  return model;
}

function resolveConfiguredModel(config: RuntimePiConfig): Model<any> {
  if (config.provider === 'deepseek') {
    return createDeepseekModel(config.model);
  }

  return resolveOpenAiModel(config.model);
}

function createUsageSummary(messages: PiMessage[]) {
  return messages.reduce(
    (usage, message) => {
      if (message.role !== 'assistant') {
        return usage;
      }

      usage.input += message.usage.input;
      usage.output += message.usage.output;
      usage.cacheRead += message.usage.cacheRead;
      usage.cacheWrite += message.usage.cacheWrite;
      usage.totalTokens += message.usage.totalTokens;
      usage.cost.input += message.usage.cost.input;
      usage.cost.output += message.usage.cost.output;
      usage.cost.cacheRead += message.usage.cost.cacheRead;
      usage.cost.cacheWrite += message.usage.cost.cacheWrite;
      usage.cost.total += message.usage.cost.total;
      return usage;
    },
    {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0
      }
    }
  );
}

function asRecordOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function extractTextContent(content: ToolResultMessage['content']) {
  return content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function serializeEventPayload(event: AgentEvent): Record<string, unknown> | null {
  return JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
}

async function appendRunEvent(ctx: RuntimePiContext, state: RuntimePiState, input: RuntimePiInput, event: AgentEvent) {
  await ctx.runEventRepo.append({
    id: crypto.randomUUID(),
    threadId: input.threadId,
    runId: input.runId,
    seq: state.nextRunEventSeq++,
    type: event.type,
    payload: serializeEventPayload(event)
  });
}

async function createPersistedMessage(
  ctx: RuntimePiContext,
  state: RuntimePiState,
  input: RuntimePiInput,
  role: StoredMessage['role'],
  status: StoredMessage['status'],
  metadata: Record<string, unknown> | null = null
) {
  const message = await ctx.messageRepo.create({
    id: crypto.randomUUID(),
    threadId: input.threadId,
    runId: input.runId,
    role,
    seq: state.nextMessageSeq++,
    status,
    metadata
  });

  state.nextPartIndexByMessageId.set(message.id, 0);
  return message;
}

async function appendMessagePart(
  ctx: RuntimePiContext,
  state: RuntimePiState,
  messageId: string,
  type: 'text' | 'tool-call' | 'tool-result' | 'reasoning' | 'data',
  options: {
    textValue?: string | null;
    jsonValue?: Record<string, unknown> | null;
  }
) {
  const nextPartIndex = state.nextPartIndexByMessageId.get(messageId) ?? 0;
  state.nextPartIndexByMessageId.set(messageId, nextPartIndex + 1);

  await ctx.messageRepo.createPart({
    id: crypto.randomUUID(),
    messageId,
    partIndex: nextPartIndex,
    type,
    textValue: options.textValue ?? null,
    jsonValue: options.jsonValue ?? null
  });
}

async function persistAssistantMessage(
  ctx: RuntimePiContext,
  state: RuntimePiState,
  assistantMessage: AssistantMessage
) {
  const messageId = state.currentAssistantMessageId;
  if (!messageId) {
    throw new Error('Assistant message was not initialized before completion.');
  }

  let wroteContent = false;

  for (const block of assistantMessage.content) {
    if (block.type === 'text') {
      wroteContent = true;
      await appendMessagePart(ctx, state, messageId, 'text', {
        textValue: block.text
      });
      continue;
    }

    if (block.type === 'thinking') {
      wroteContent = true;
      await appendMessagePart(ctx, state, messageId, 'reasoning', {
        textValue: block.thinking
      });
      continue;
    }

  }

  if (!wroteContent && assistantMessage.stopReason === 'error' && assistantMessage.errorMessage) {
    await appendMessagePart(ctx, state, messageId, 'text', {
      textValue: assistantMessage.errorMessage
    });
  }

  await ctx.messageRepo.updateStatus(messageId, assistantMessage.stopReason === 'error' || assistantMessage.stopReason === 'aborted' ? 'failed' : 'completed');
}

async function persistToolResultMessage(
  ctx: RuntimePiContext,
  state: RuntimePiState,
  input: RuntimePiInput,
  event: Extract<AgentEvent, { type: 'tool_execution_end' }>
) {
  const message = await createPersistedMessage(ctx, state, input, 'tool', event.isError ? 'failed' : 'completed', {
    toolName: event.toolName,
    toolCallId: event.toolCallId
  });

  const content = Array.isArray(event.result?.content) ? event.result.content : [];
  await appendMessagePart(ctx, state, message.id, 'tool-result', {
    textValue: extractTextContent(content),
    jsonValue: {
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      content,
      details: event.result?.details ?? null,
      isError: event.isError
    }
  });
}

async function handleAgentEvent(ctx: RuntimePiContext, state: RuntimePiState, input: RuntimePiInput, model: Model<any>, event: AgentEvent) {
  if (event.type === 'agent_start') {
    await ctx.runRepo.updateStatus(input.runId, 'running', { startedAt: new Date() });
    await appendRunEvent(ctx, state, input, event);
    return;
  }

  if (event.type === 'message_start' && event.message.role === 'assistant') {
    const message = await createPersistedMessage(ctx, state, input, 'assistant', 'created', {
      api: model.api,
      provider: model.provider,
      model: model.id
    });

    state.currentAssistantMessageId = message.id;
    await appendRunEvent(ctx, state, input, event);
    return;
  }

  if (event.type === 'message_end' && event.message.role === 'assistant') {
    await persistAssistantMessage(ctx, state, event.message);
    await appendRunEvent(ctx, state, input, event);
    return;
  }

  if (event.type === 'tool_execution_start') {
    const assistantMessageId = state.currentAssistantMessageId;
    if (!assistantMessageId) {
      throw new Error('Tool execution started before an assistant message was persisted.');
    }

    const invocation = await ctx.toolRepo.create({
      id: crypto.randomUUID(),
      threadId: input.threadId,
      runId: input.runId,
      messageId: assistantMessageId,
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      status: 'running',
      input: asRecordOrNull(event.args),
      output: null,
      error: null,
      startedAt: new Date(),
      finishedAt: null
    });

    state.toolInvocationByCallId.set(event.toolCallId, { id: invocation.id, messageId: assistantMessageId });
    state.persistedToolCallIds.add(event.toolCallId);

    await appendMessagePart(ctx, state, assistantMessageId, 'tool-call', {
      jsonValue: {
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        input: asRecordOrNull(event.args)
      }
    });

    await appendRunEvent(ctx, state, input, event);
    return;
  }

  if (event.type === 'tool_execution_end') {
    const invocation = state.toolInvocationByCallId.get(event.toolCallId);
    if (!invocation) {
      throw new Error(`Tool invocation not found for ${event.toolCallId}`);
    }

    await ctx.toolRepo.updateStatus(invocation.id, event.isError ? 'failed' : 'completed', {
      output: {
        content: Array.isArray(event.result?.content) ? event.result.content : [],
        details: event.result?.details ?? null,
        isError: event.isError
      },
      error: event.isError ? extractTextContent(Array.isArray(event.result?.content) ? event.result.content : []) || event.toolName : null,
      finishedAt: new Date()
    });

    await persistToolResultMessage(ctx, state, input, event);
    await appendRunEvent(ctx, state, input, event);
    return;
  }

  if (event.type === 'agent_end') {
    const status = event.messages.some((message) => message.role === 'assistant' && (message.stopReason === 'error' || message.stopReason === 'aborted'))
      ? 'failed'
      : 'completed';

    await ctx.runRepo.updateStatus(input.runId, status, {
      finishedAt: new Date(),
      usage: createUsageSummary(
        event.messages.filter(
          (message): message is PiMessage => message.role === 'assistant' || message.role === 'toolResult' || message.role === 'user'
        )
      )
    });

    await appendRunEvent(ctx, state, input, event);
    return;
  }

  await appendRunEvent(ctx, state, input, event);
}

export async function runAssistantTurnWithPiInternal(
  ctx: RuntimePiContext,
  input: RuntimePiInput,
  options: RuntimePiInternalOptions = {}
) {
  const config = options.model ? null : resolveRuntimePiConfigFromEnv({ provider: input.provider, model: input.model });

  const model = options.model ?? resolveConfiguredModel(config as RuntimePiConfig);
  const history = await ctx.messageRepo.listByThread(input.threadId);
  const { systemPrompt, messages } = buildInitialAgentState(history, model, options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT);
  const lastMessage = messages.at(-1);

  if (!lastMessage || (lastMessage.role !== 'user' && lastMessage.role !== 'toolResult')) {
    throw new Error('runtime-pi requires the latest persisted thread message to be a user or tool result message.');
  }

  const state: RuntimePiState = {
    nextMessageSeq: await ctx.messageRepo.nextSeq(input.threadId),
    nextRunEventSeq: await ctx.runEventRepo.nextSeq(input.runId),
    currentAssistantMessageId: null,
    nextPartIndexByMessageId: new Map(),
    toolInvocationByCallId: new Map(),
    persistedToolCallIds: new Set()
  };

  const tools = options.tools ?? createDemoTools({
    threadId: input.threadId,
    runId: input.runId,
    provider: config?.provider ?? (model.provider as string),
    model: config?.model ?? model.id
  });

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      thinkingLevel: 'off',
      tools,
      messages
    },
    convertToLlm,
    getApiKey: options.getApiKey ?? ((provider) => (provider === config?.provider ? config.apiKey : undefined)),
    toolExecution: 'parallel'
  });

  const unsubscribe = agent.subscribe(async (event) => {
    await handleAgentEvent(ctx, state, input, model, event);
  });

  try {
    await agent.continue();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown runtime-pi failure';
    await ctx.runRepo.updateStatus(input.runId, 'failed', {
      finishedAt: new Date(),
      error: message
    });

    await ctx.runEventRepo.append({
      id: crypto.randomUUID(),
      threadId: input.threadId,
      runId: input.runId,
      seq: state.nextRunEventSeq++,
      type: 'runtime_error',
      payload: { message }
    });

    throw error;
  } finally {
    unsubscribe();
  }
}

export async function runAssistantTurnWithPi(ctx: RuntimePiContext, input: RuntimePiInput): Promise<void> {
  await runAssistantTurnWithPiInternal(ctx, input);
}
