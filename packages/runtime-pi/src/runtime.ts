import crypto from 'node:crypto';

import type { Message as StoredMessage } from '@agent-infra/core';
import type { AgentEvent, AgentTool } from '@mariozechner/pi-agent-core';
import { Agent } from '@mariozechner/pi-agent-core';
import { getModels, type AssistantMessage, type AssistantMessageEvent, type Message as PiMessage, type Model, type ToolResultMessage } from '@mariozechner/pi-ai';

import { resolveRuntimePiConfigFromEnv } from './config.js';
import { buildInitialAgentState, convertToLlm } from './messages.js';
import { createDemoTools } from './tools.js';
import type {
  RuntimePiConfig,
  RuntimePiContext,
  RuntimePiInput,
  RuntimePiPersistedUpdate,
  RuntimePiRunTurnOptions,
  RuntimePiRuntime,
  RuntimePiRuntimeOptions,
  RuntimePiSelection,
  RuntimePiToolProvider
} from './types.js';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant.';

type RuntimePiState = {
  nextMessageSeq: number;
  nextRunEventSeq: number;
  currentAssistantMessageId: string | null;
  openAssistantMessageId: string | null;
  nextPartIndexByMessageId: Map<string, number>;
  toolInvocationByCallId: Map<string, { id: string; messageId: string; status: 'running' | 'completed' | 'failed' }>;
  persistedToolCallIds: Set<string>;
};

export type RuntimePiInternalOptions = RuntimePiRuntimeOptions & {
  resolvedConfig?: RuntimePiConfig | null;
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

function toRuntimeSelection(config: RuntimePiConfig): RuntimePiSelection {
  return {
    provider: config.provider,
    model: config.model
  };
}

async function resolveRuntimeConfig(
  options: RuntimePiRuntimeOptions,
  preferred: Pick<RuntimePiInput, 'provider' | 'model'> = {}
): Promise<RuntimePiConfig | null> {
  if (options.model) {
    return null;
  }

  if (options.resolveConfig) {
    return await options.resolveConfig(preferred);
  }

  return resolveRuntimePiConfigFromEnv(preferred);
}

async function resolveRuntimeSelection(
  options: RuntimePiRuntimeOptions,
  preferred: Pick<RuntimePiInput, 'provider' | 'model'> = {}
): Promise<RuntimePiSelection> {
  if (options.model) {
    return {
      provider: String(options.model.provider),
      model: options.model.id
    };
  }

  const config = await resolveRuntimeConfig(options, preferred);
  return toRuntimeSelection(config as RuntimePiConfig);
}

async function resolveTools(
  tools: RuntimePiToolProvider | undefined,
  context: { threadId: string; runId: string; provider: string; model: string }
) {
  if (!tools) {
    return [] as AgentTool[];
  }

  if (Array.isArray(tools)) {
    return tools;
  }

  return await tools(context);
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

function summarizeUsage(value: unknown) {
  const usage = asRecordOrNull(value);
  if (!usage) {
    return null;
  }

  return {
    input: usage.input ?? 0,
    output: usage.output ?? 0,
    cacheRead: usage.cacheRead ?? 0,
    cacheWrite: usage.cacheWrite ?? 0,
    totalTokens: usage.totalTokens ?? 0
  };
}

function getMessageProvider(message: unknown) {
  return typeof message === 'object' && message !== null && 'provider' in message ? (message as { provider?: unknown }).provider ?? null : null;
}

function getMessageModel(message: unknown) {
  return typeof message === 'object' && message !== null && 'model' in message ? (message as { model?: unknown }).model ?? null : null;
}

function getMessageStopReason(message: unknown) {
  return typeof message === 'object' && message !== null && 'stopReason' in message
    ? (message as { stopReason?: unknown }).stopReason ?? null
    : null;
}

function getMessageUsage(message: unknown) {
  return typeof message === 'object' && message !== null && 'usage' in message ? (message as { usage?: unknown }).usage : null;
}

function summarizeAgentEventPayload(event: AgentEvent): Record<string, unknown> | null {
  switch (event.type) {
    case 'message_start':
      return {
        type: event.type,
        role: event.message.role,
        provider: getMessageProvider(event.message),
        model: getMessageModel(event.message)
      };
    case 'message_update': {
      const assistantMessageEvent = event.assistantMessageEvent;
      const summary: Record<string, unknown> = {
        type: event.type,
        role: event.message.role,
        assistantMessageEvent: {
          type: assistantMessageEvent.type
        }
      };

      if ('contentIndex' in assistantMessageEvent && typeof assistantMessageEvent.contentIndex === 'number') {
        (summary.assistantMessageEvent as Record<string, unknown>).contentIndex = assistantMessageEvent.contentIndex;
      }

      if ('delta' in assistantMessageEvent && typeof assistantMessageEvent.delta === 'string') {
        (summary.assistantMessageEvent as Record<string, unknown>).deltaLength = assistantMessageEvent.delta.length;
      }

      return summary;
    }
    case 'message_end':
      return {
        type: event.type,
        role: event.message.role,
        stopReason: getMessageStopReason(event.message),
        usage: summarizeUsage(getMessageUsage(event.message))
      };
    case 'tool_execution_start':
      return {
        type: event.type,
        toolName: event.toolName,
        toolCallId: event.toolCallId
      };
    case 'tool_execution_end':
      return {
        type: event.type,
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        isError: event.isError,
        outputTextLength: extractTextContent(Array.isArray(event.result?.content) ? event.result.content : []).length
      };
    case 'turn_end':
      return {
        type: event.type,
        role: event.message.role,
        toolResultCount: event.toolResults.length,
        usage: summarizeUsage(getMessageUsage(event.message))
      };
    case 'agent_end':
      return {
        type: event.type,
        messageCount: event.messages.length,
        roles: event.messages.map((message) => message.role),
        assistantMessageCount: event.messages.filter((message) => message.role === 'assistant').length,
        toolResultCount: event.messages.filter((message) => message.role === 'toolResult').length
      };
    default:
      return JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
  }
}

function serializeEventPayload(event: AgentEvent): Record<string, unknown> | null {
  return summarizeAgentEventPayload(event);
}

function extractAssistantText(message: AssistantMessage) {
  return message.content
    .filter((block): block is Extract<AssistantMessage['content'][number], { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

function extractAssistantReasoning(message: AssistantMessage) {
  const reasoning = message.content
    .filter((block): block is Extract<AssistantMessage['content'][number], { type: 'thinking' }> => block.type === 'thinking')
    .map((block) => block.thinking)
    .join('');

  return reasoning || null;
}

function createAssistantStreamSnapshot(messageId: string, assistantMessageEvent: AssistantMessageEvent) {
  if (assistantMessageEvent.type === 'done' || assistantMessageEvent.type === 'error') {
    return null;
  }

  return {
    messageId,
    eventType: assistantMessageEvent.type,
    partialText: extractAssistantText(assistantMessageEvent.partial),
    partialReasoning: extractAssistantReasoning(assistantMessageEvent.partial)
  };
}

function createAssistantCompletionSnapshot(messageId: string, assistantMessage: AssistantMessage) {
  return {
    messageId,
    eventType: 'text_end' as const,
    partialText: extractAssistantText(assistantMessage),
    partialReasoning: extractAssistantReasoning(assistantMessage)
  };
}

async function appendRunEvent(ctx: RuntimePiContext, state: RuntimePiState, input: RuntimePiInput, event: AgentEvent) {
  return await ctx.runEventRepo.append({
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

  await ctx.messageRepo.createPart({
    id: crypto.randomUUID(),
    messageId,
    partIndex: nextPartIndex,
    type,
    textValue: options.textValue ?? null,
    jsonValue: options.jsonValue ?? null
  });

  state.nextPartIndexByMessageId.set(messageId, nextPartIndex + 1);
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
  state.openAssistantMessageId = null;
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

async function emitPersistedUpdate(options: RuntimePiRunTurnOptions | undefined, update: RuntimePiPersistedUpdate) {
  if (!options?.onPersistedUpdate) {
    return;
  }

  try {
    await options.onPersistedUpdate(update);
  } catch {
    // Transport observers are best-effort and must not mutate durable run outcome.
  }
}

async function emitLiveAssistantUpdate(
  options: RuntimePiRunTurnOptions | undefined,
  update: RuntimePiPersistedUpdate['assistantStream']
) {
  if (!options?.onLiveAssistantUpdate || !update) {
    return;
  }

  try {
    await options.onLiveAssistantUpdate(update);
  } catch {
    // Live transport observers are best-effort and must not mutate durable run outcome.
  }
}

async function handleAgentEvent(
  ctx: RuntimePiContext,
  state: RuntimePiState,
  input: RuntimePiInput,
  model: Model<any>,
  event: AgentEvent
): Promise<RuntimePiPersistedUpdate> {
  if (event.type === 'agent_start') {
    const run = await ctx.runRepo.updateStatus(input.runId, 'running', { startedAt: new Date() });
    const runEvent = await appendRunEvent(ctx, state, input, event);
    return { runEvent, run };
  }

  if (event.type === 'message_start' && event.message.role === 'assistant') {
    const messageId = state.currentAssistantMessageId ?? crypto.randomUUID();
    const message = await ctx.messageRepo.create({
      id: messageId,
      threadId: input.threadId,
      runId: input.runId,
      role: 'assistant',
      seq: state.nextMessageSeq++,
      status: 'created',
      metadata: {
        api: model.api,
        provider: model.provider,
        model: model.id
      }
    });

    state.nextPartIndexByMessageId.set(message.id, 0);
    state.currentAssistantMessageId = message.id;
    state.openAssistantMessageId = message.id;
    const runEvent = await appendRunEvent(ctx, state, input, event);
    return { runEvent };
  }

  if (event.type === 'message_update' && event.message.role === 'assistant') {
    const runEvent = await appendRunEvent(ctx, state, input, event);
    const messageId = state.currentAssistantMessageId;
    const assistantStream = messageId ? createAssistantStreamSnapshot(messageId, event.assistantMessageEvent) : null;
    return {
      runEvent,
      assistantStream
    };
  }

  if (event.type === 'message_end' && event.message.role === 'assistant') {
    await persistAssistantMessage(ctx, state, event.message);
    const runEvent = await appendRunEvent(ctx, state, input, event);
    return { runEvent };
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

    state.toolInvocationByCallId.set(event.toolCallId, { id: invocation.id, messageId: assistantMessageId, status: 'running' });
    state.persistedToolCallIds.add(event.toolCallId);

    await appendMessagePart(ctx, state, assistantMessageId, 'tool-call', {
      jsonValue: {
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        input: asRecordOrNull(event.args)
      }
    });

    const runEvent = await appendRunEvent(ctx, state, input, event);
    return { runEvent, toolInvocation: invocation };
  }

  if (event.type === 'tool_execution_end') {
    const invocation = state.toolInvocationByCallId.get(event.toolCallId);
    if (!invocation) {
      throw new Error(`Tool invocation not found for ${event.toolCallId}`);
    }

    const nextStatus = event.isError ? 'failed' : 'completed';
    const updatedInvocation = await ctx.toolRepo.updateStatus(invocation.id, nextStatus, {
      output: {
        content: Array.isArray(event.result?.content) ? event.result.content : [],
        details: event.result?.details ?? null,
        isError: event.isError
      },
      error: event.isError ? extractTextContent(Array.isArray(event.result?.content) ? event.result.content : []) || event.toolName : null,
      finishedAt: new Date()
    });
    state.toolInvocationByCallId.set(event.toolCallId, {
      ...invocation,
      status: nextStatus
    });

    await persistToolResultMessage(ctx, state, input, event);
    const runEvent = await appendRunEvent(ctx, state, input, event);
    return { runEvent, toolInvocation: updatedInvocation };
  }

  if (event.type === 'agent_end') {
    const status = event.messages.some((message) => message.role === 'assistant' && (message.stopReason === 'error' || message.stopReason === 'aborted'))
      ? 'failed'
      : 'completed';

    const run = await ctx.runRepo.updateStatus(input.runId, status, {
      finishedAt: new Date(),
      usage: createUsageSummary(
        event.messages.filter(
          (message): message is PiMessage => message.role === 'assistant' || message.role === 'toolResult' || message.role === 'user'
        )
      )
    });

    const runEvent = await appendRunEvent(ctx, state, input, event);
    return { runEvent, run };
  }

  const runEvent = await appendRunEvent(ctx, state, input, event);
  return { runEvent };
}

async function hardenFailureState(ctx: RuntimePiContext, state: RuntimePiState, errorMessage: string) {
  const finishedAt = new Date();
  const repairs: Array<Promise<unknown>> = [];

  if (state.openAssistantMessageId) {
    const messageId = state.openAssistantMessageId;
    repairs.push(
      (async () => {
        if ((state.nextPartIndexByMessageId.get(messageId) ?? 0) === 0) {
          await appendMessagePart(ctx, state, messageId, 'text', {
            textValue: errorMessage
          });
        }

        await ctx.messageRepo.updateStatus(messageId, 'failed');
      })()
    );
    state.openAssistantMessageId = null;
  }

  for (const [toolCallId, invocation] of state.toolInvocationByCallId.entries()) {
    if (invocation.status !== 'running') {
      continue;
    }

    repairs.push(
      ctx.toolRepo.updateStatus(invocation.id, 'failed', {
        error: errorMessage,
        finishedAt
      })
    );
    state.toolInvocationByCallId.set(toolCallId, {
      ...invocation,
      status: 'failed'
    });
  }

  await Promise.allSettled(repairs);
}

export function createPiRuntime(options: RuntimePiRuntimeOptions = {}): RuntimePiRuntime {
  return {
    async prepare(input = {}) {
      return resolveRuntimeSelection(options, input);
    },
    async runTurn(ctx, input, runOptions) {
      const resolvedConfig = await resolveRuntimeConfig(options, {
        provider: input.provider,
        model: input.model
      });
      const selection =
        resolvedConfig != null
          ? toRuntimeSelection(resolvedConfig)
          : {
              provider: String(options.model?.provider),
              model: options.model?.id ?? input.model ?? ''
            };

      const tools = await resolveTools(options.tools, {
        threadId: input.threadId,
        runId: input.runId,
        provider: selection.provider,
        model: selection.model
      });

      await runAssistantTurnWithPiInternal(
        ctx,
        {
          ...input,
          provider: selection.provider,
          model: selection.model
        },
        {
          ...options,
          tools,
          resolvedConfig
        },
        runOptions
      );
    }
  };
}

export async function runAssistantTurnWithPiInternal(
  ctx: RuntimePiContext,
  input: RuntimePiInput,
  options: RuntimePiInternalOptions = {},
  runOptions?: RuntimePiRunTurnOptions
) {
  const config = options.resolvedConfig ?? (options.model ? null : resolveRuntimePiConfigFromEnv({ provider: input.provider, model: input.model }));

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
    openAssistantMessageId: null,
    nextPartIndexByMessageId: new Map(),
    toolInvocationByCallId: new Map(),
    persistedToolCallIds: new Set()
  };

  const tools = options.tools ?? [];

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

  let eventChain = Promise.resolve();
  let liveEventChain = Promise.resolve();
  let subscriberFailure: unknown = null;

  const unsubscribe = agent.subscribe((event) => {
    if (event.type === 'message_start' && event.message.role === 'assistant' && !state.currentAssistantMessageId) {
      state.currentAssistantMessageId = crypto.randomUUID();
      state.openAssistantMessageId = state.currentAssistantMessageId;
    }

    if (event.type === 'message_update' && event.message.role === 'assistant') {
      const assistantStream = state.currentAssistantMessageId
        ? createAssistantStreamSnapshot(state.currentAssistantMessageId, event.assistantMessageEvent)
        : null;

      liveEventChain = liveEventChain.then(async () => {
        await emitLiveAssistantUpdate(runOptions, assistantStream);
      });
    }

    if (event.type === 'message_end' && event.message.role === 'assistant') {
      const assistantStream = state.currentAssistantMessageId
        ? createAssistantCompletionSnapshot(state.currentAssistantMessageId, event.message)
        : null;

      liveEventChain = liveEventChain.then(async () => {
        await emitLiveAssistantUpdate(runOptions, assistantStream);
      });
    }

    eventChain = eventChain.then(async () => {
      if (subscriberFailure) {
        return;
      }

      const update = await handleAgentEvent(ctx, state, input, model, event);
      await emitPersistedUpdate(runOptions, update);
    }).catch((error) => {
      subscriberFailure = error;
      throw error;
    });
  });

  try {
    await agent.continue();
    await liveEventChain;
    await eventChain;
    if (subscriberFailure) {
      throw subscriberFailure;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown runtime-pi failure';
    await hardenFailureState(ctx, state, message);
    const failedRun = await ctx.runRepo.updateStatus(input.runId, 'failed', {
      finishedAt: new Date(),
      error: message
    });

    const runtimeErrorEvent = await ctx.runEventRepo.append({
      id: crypto.randomUUID(),
      threadId: input.threadId,
      runId: input.runId,
      seq: state.nextRunEventSeq++,
      type: 'runtime_error',
      payload: { message }
    });
    await emitPersistedUpdate(runOptions, {
      runEvent: runtimeErrorEvent,
      run: failedRun
    });

    throw error;
  } finally {
    unsubscribe();
  }
}

export async function runAssistantTurnWithPi(ctx: RuntimePiContext, input: RuntimePiInput): Promise<void> {
  await createPiRuntime({
    tools: (context) => createDemoTools(context)
  }).runTurn(ctx, input);
}
