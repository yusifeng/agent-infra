import crypto from 'node:crypto';

import type { Message as StoredMessage, RunUsageSummaryV1, RunUsageTokensV1 } from '@agent-infra/core';
import { Agent, type AgentEvent, type AgentTool } from '@mariozechner/pi-agent-core';
import {
  completeSimple,
  getModels,
  type AssistantMessage,
  type AssistantMessageEvent,
  type Context,
  type Message as PiMessage,
  type Model,
  type ToolResultMessage
} from '@mariozechner/pi-ai';

import { resolveRuntimePiConfigFromEnv } from './config.js';
import { buildInitialAgentState, convertToLlm, projectAgentMessagesForEnabledTools } from './messages.js';
import { createDemoTools } from './tools.js';
import type {
  RuntimePiAssistantStreamUpdate,
  RuntimePiConfig,
  RuntimePiContext,
  RuntimePiGenerateTextInput,
  RuntimePiGenerateTextResult,
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
  nextRunEventSeq: number;
  currentAssistantMessageId: string | null;
  openAssistantMessageId: string | null;
  liveAssistantMessageId: string | null;
  liveAssistantTextSnapshot: string;
  liveAssistantReasoningSnapshot: string;
  persistedAssistantTextSnapshot: string;
  persistedAssistantReasoningSnapshot: string;
  persistedAssistantTextFlushed: boolean;
  persistedAssistantReasoningFlushed: boolean;
  nextPartIndexByMessageId: Map<string, number>;
  toolInvocationByCallId: Map<
    string,
    {
      id: string;
      messageId: string;
      status: 'running' | 'completed' | 'failed';
      input: Record<string, unknown> | null;
    }
  >;
  liveToolInputByCallId: Map<string, Record<string, unknown> | null>;
  persistedToolCallIds: Set<string>;
};

type CapturedAssistantSnapshots = {
  text: string;
  reasoning: string;
};

function deriveAssistantFailureMessage(message: PiMessage): string | null {
  if (message.role !== 'assistant') {
    return null;
  }

  if (message.stopReason === 'aborted') {
    return message.errorMessage?.trim() || 'provider stream ended with stopReason=aborted';
  }

  if (message.stopReason === 'error') {
    return message.errorMessage?.trim() || 'provider stream ended with stopReason=error';
  }

  return null;
}

export type RuntimePiInternalOptions = RuntimePiRuntimeOptions & {
  resolvedConfig?: RuntimePiConfig | null;
  tools?: AgentTool[];
};

let openAiModelIndexPromise: Promise<Map<string, Model<any>>> | null = null;

function createDeepseekModel(modelId: string): Model<any> {
  if (modelId !== 'deepseek-v4-flash' && modelId !== 'deepseek-v4-pro') {
    throw new Error(`Unknown DeepSeek model: ${modelId}`);
  }

  return {
    id: modelId,
    name: modelId === 'deepseek-v4-pro' ? 'DeepSeek V4 Pro' : 'DeepSeek V4 Flash',
    api: 'openai-completions',
    provider: 'deepseek',
    baseUrl: DEEPSEEK_BASE_URL,
    reasoning: true,
    input: ['text'],
    compat: {
      supportsReasoningEffort: true,
      reasoningEffortMap: {
        high: 'high',
        xhigh: 'max'
      }
    },
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

async function loadOpenAiModelIndex() {
  if (!openAiModelIndexPromise) {
    openAiModelIndexPromise = (async () => {
      return new Map(getModels('openai').map((model) => [model.id, model]));
    })().catch((error) => {
      openAiModelIndexPromise = null;
      throw error;
    });
  }

  return await openAiModelIndexPromise;
}

async function resolveOpenAiModel(modelId: string): Promise<Model<any>> {
  const openAiModelIndex = await loadOpenAiModelIndex();
  const model = openAiModelIndex.get(modelId);
  if (!model) {
    throw new Error(`Unknown OpenAI model: ${modelId}`);
  }

  return model;
}

async function resolveConfiguredModel(config: RuntimePiConfig): Promise<Model<any>> {
  if (config.provider === 'deepseek') {
    return createDeepseekModel(config.model);
  }

  return await resolveOpenAiModel(config.model);
}

function toRuntimeSelection(config: RuntimePiConfig): RuntimePiSelection {
  return {
    provider: config.provider,
    model: config.model
  };
}

function extractAssistantCompletionText(message: AssistantMessage): string | null {
  const text = message.content
    .filter((contentPart) => contentPart.type === 'text')
    .map((contentPart) => contentPart.text.trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  return text || null;
}

type OpenAiCompatibleCompletionResponse = {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>
        | null;
    };
  }>;
};

type OpenAiCompatibleCompletionContent =
  | string
  | Array<{
      type?: string;
      text?: string;
    }>
  | null
  | undefined;

function extractCompletionResponseText(content: OpenAiCompatibleCompletionContent): string | null {
  if (typeof content === 'string') {
    const text = content.trim();
    return text || null;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const text = content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text?.trim() ?? '')
    .filter(Boolean)
    .join('\n')
    .trim();

  return text || null;
}

export function applyGenerateTextPayloadOverrides(
  payload: unknown,
  selection: RuntimePiSelection,
  input: Pick<RuntimePiGenerateTextInput, 'reasoningEffort'>
): unknown | undefined {
  if (selection.provider !== 'deepseek' || input.reasoningEffort !== 'off') {
    return undefined;
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }

  return {
    ...(payload as Record<string, unknown>),
    thinking: {
      type: 'disabled'
    }
  };
}

function buildNonStreamingGenerateTextPayload(
  selection: RuntimePiSelection,
  input: RuntimePiGenerateTextInput
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: selection.model,
    messages: [
      {
        role: 'system',
        content: input.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
      },
      {
        role: 'user',
        content: input.userPrompt
      }
    ]
  };

  if (typeof input.temperature === 'number') {
    payload.temperature = input.temperature;
  }

  if (typeof input.maxTokens === 'number') {
    payload.max_tokens = input.maxTokens;
  }

  if (input.reasoningEffort === 'high') {
    payload.reasoning_effort = 'high';
  } else if (input.reasoningEffort === 'max') {
    payload.reasoning_effort = selection.provider === 'deepseek' ? 'max' : 'high';
  }

  return (
    applyGenerateTextPayloadOverrides(payload, selection, input) as Record<string, unknown> | undefined
  ) ?? payload;
}

async function requestOpenAiCompatibleGenerateText(input: {
  model: Model<any>;
  selection: RuntimePiSelection;
  runtimeInput: RuntimePiGenerateTextInput;
  apiKey: string;
}): Promise<string | null> {
  const payload = buildNonStreamingGenerateTextPayload(input.selection, input.runtimeInput);
  const response = await fetch(`${input.model.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      'content-type': 'application/json',
      ...input.model.headers
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`generateText request failed (${response.status})`);
  }

  const completion = (await response.json()) as OpenAiCompatibleCompletionResponse;
  return extractCompletionResponseText(completion.choices?.[0]?.message?.content);
}

async function resolveGenerateTextResult(
  options: RuntimePiRuntimeOptions,
  input: RuntimePiGenerateTextInput
): Promise<RuntimePiGenerateTextResult> {
  const resolvedConfig = await resolveRuntimeConfig(options, {
    provider: input.provider,
    model: input.model
  });
  const model = options.model ?? await resolveConfiguredModel(resolvedConfig as RuntimePiConfig);
  const selection =
    resolvedConfig != null
      ? toRuntimeSelection(resolvedConfig)
      : {
          provider: String(model.provider),
          model: model.id
        };
  const context: Context = {
    systemPrompt: input.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: input.userPrompt,
        timestamp: Date.now()
      }
    ]
  };
  const apiKey =
    resolvedConfig?.apiKey ??
    (options.getApiKey ? await options.getApiKey(String(model.provider)) : undefined);

  if (!apiKey) {
    throw new Error(`No API key for provider: ${selection.provider}`);
  }

  if (model.api === 'openai-completions') {
    const text = await requestOpenAiCompatibleGenerateText({
      model,
      selection,
      runtimeInput: input,
      apiKey
    });

    return {
      provider: selection.provider,
      model: selection.model,
      text
    };
  }

  const assistantMessage = await completeSimple(model, context, {
    apiKey,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    ...(input.reasoningEffort === 'max'
      ? { reasoning: 'xhigh' as const }
      : input.reasoningEffort === 'high'
        ? { reasoning: 'high' as const }
        : {}),
    onPayload: (payload) => applyGenerateTextPayloadOverrides(payload, selection, input)
  });

  return {
    provider: selection.provider,
    model: selection.model,
    text: extractAssistantCompletionText(assistantMessage)
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
  context: { threadId: string; runId: string; provider: string; model: string; webSearchEnabled?: boolean }
) {
  if (!tools) {
    return [] as AgentTool[];
  }

  if (Array.isArray(tools)) {
    return tools;
  }

  return await tools(context);
}

function asRecordOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function readFiniteNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function addTokenValue(tokens: RunUsageTokensV1, key: keyof RunUsageTokensV1, value: number | null) {
  if (value === null) {
    return false;
  }

  tokens[key] = (tokens[key] ?? 0) + value;
  return true;
}

function getEstimatedCostMicros(usage: Record<string, unknown>) {
  const cost = asRecordOrNull(usage.cost);
  if (!cost) {
    return null;
  }

  const total = readFiniteNumber(cost, 'total');
  return total === null ? null : Math.round(total * 1_000_000);
}

function createUsageSummary(messages: PiMessage[], input: Pick<RuntimePiInput, 'provider' | 'model'>): RunUsageSummaryV1 {
  const assistantMessages = messages.filter((message) => message.role === 'assistant');
  const tokens: RunUsageTokensV1 = {};
  const rawAssistantUsages: Record<string, unknown>[] = [];
  let estimatedCostMicros = 0;
  let hasEstimatedCost = false;
  let sawUsageRecord = false;
  let sawMissing = assistantMessages.length === 0;
  let sawPartial = false;
  let sawMalformed = false;

  for (const message of assistantMessages) {
    const rawUsage = getMessageUsage(message);
    if (rawUsage === null || rawUsage === undefined) {
      sawMissing = true;
      continue;
    }

    const usage = asRecordOrNull(rawUsage);
    if (!usage) {
      sawMalformed = true;
      continue;
    }

    sawUsageRecord = true;
    rawAssistantUsages.push(cloneJsonRecord(usage));

    const inputTokens = readFiniteNumber(usage, 'input');
    const outputTokens = readFiniteNumber(usage, 'output');
    const cacheReadTokens = readFiniteNumber(usage, 'cacheRead');
    const cacheWriteTokens = readFiniteNumber(usage, 'cacheWrite');
    const totalTokens = readFiniteNumber(usage, 'totalTokens');
    const reasoningTokens = readFiniteNumber(usage, 'reasoning');

    const completeTokenRecord =
      inputTokens !== null &&
      outputTokens !== null &&
      cacheReadTokens !== null &&
      cacheWriteTokens !== null &&
      totalTokens !== null;
    if (!completeTokenRecord) {
      sawPartial = true;
    }

    addTokenValue(tokens, 'input', inputTokens);
    addTokenValue(tokens, 'output', outputTokens);
    addTokenValue(tokens, 'cacheRead', cacheReadTokens);
    addTokenValue(tokens, 'cacheWrite', cacheWriteTokens);
    addTokenValue(tokens, 'total', totalTokens);
    addTokenValue(tokens, 'reasoning', reasoningTokens);

    const costMicros = getEstimatedCostMicros(usage);
    if (costMicros !== null) {
      estimatedCostMicros += costMicros;
      hasEstimatedCost = true;
    }
  }

  const normalizationStatus: RunUsageSummaryV1['normalizationStatus'] = sawMalformed
    ? 'malformed'
    : !sawUsageRecord
      ? 'missing'
      : sawMissing || sawPartial
        ? 'partial'
        : 'complete';

  return {
    schemaVersion: 1,
    provider: input.provider ?? null,
    model: input.model ?? null,
    normalizationStatus,
    tokens,
    estimatedCost: hasEstimatedCost
      ? {
          currency: 'USD',
          amountMicros: estimatedCostMicros,
          source: 'pi-ai-message-usage',
          version: null
        }
      : null,
    rawProviderUsage:
      rawAssistantUsages.length > 0
        ? {
            assistantMessages: rawAssistantUsages
          }
        : null
  };
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

  const summary: Record<string, number> = {};
  const input = readFiniteNumber(usage, 'input');
  const output = readFiniteNumber(usage, 'output');
  const cacheRead = readFiniteNumber(usage, 'cacheRead');
  const cacheWrite = readFiniteNumber(usage, 'cacheWrite');
  const totalTokens = readFiniteNumber(usage, 'totalTokens');

  if (input !== null) {
    summary.input = input;
  }
  if (output !== null) {
    summary.output = output;
  }
  if (cacheRead !== null) {
    summary.cacheRead = cacheRead;
  }
  if (cacheWrite !== null) {
    summary.cacheWrite = cacheWrite;
  }
  if (totalTokens !== null) {
    summary.totalTokens = totalTokens;
  }

  return Object.keys(summary).length > 0 ? summary : null;
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

function updatePersistedAssistantSnapshots(state: RuntimePiState, assistantMessageEvent: AssistantMessageEvent) {
  if (assistantMessageEvent.type === 'done' || assistantMessageEvent.type === 'error') {
    return;
  }

  const nextTextSnapshot = extractAssistantText(assistantMessageEvent.partial);
  const nextReasoningSnapshot = extractAssistantReasoning(assistantMessageEvent.partial) ?? '';

  if (assistantMessageEvent.type.startsWith('text_')) {
    state.persistedAssistantTextSnapshot = nextTextSnapshot;
  } else if (nextTextSnapshot) {
    state.persistedAssistantTextSnapshot = nextTextSnapshot;
  }

  if (assistantMessageEvent.type.startsWith('thinking_')) {
    state.persistedAssistantReasoningSnapshot = nextReasoningSnapshot;
  } else if (nextReasoningSnapshot) {
    state.persistedAssistantReasoningSnapshot = nextReasoningSnapshot;
  }
}

export function computeStreamTextChange(previous: string, next: string) {
  if (previous === next) {
    return null;
  }

  if (!previous) {
    return {
      kind: 'delta' as const,
      value: next
    };
  }

  if (!next) {
    return {
      kind: 'replace' as const,
      value: ''
    };
  }

  if (next.startsWith(previous)) {
    return {
      kind: 'delta' as const,
      value: next.slice(previous.length)
    };
  }

  return {
    kind: 'replace' as const,
    value: next
  };
}

function createAssistantStreamUpdates(
  state: RuntimePiState,
  messageId: string,
  assistantMessageEvent: AssistantMessageEvent
) {
  if (assistantMessageEvent.type === 'done' || assistantMessageEvent.type === 'error') {
    return [];
  }

  const updates: RuntimePiAssistantStreamUpdate[] = [];
  // pi-ai streams both event-local deltas and a mutable partial AssistantMessage.
  // We treat the partial message as the source of truth, then derive delta-first
  // updates for consumers. This lets us preserve correctness when a provider
  // finalizes text or tool arguments with a non-prefix rewrite.
  let nextTextSnapshot = extractAssistantText(assistantMessageEvent.partial);
  let nextReasoningSnapshot = extractAssistantReasoning(assistantMessageEvent.partial) ?? '';

  // Tool lifecycle updates can arrive with a partial assistant message that only
  // contains tool-call blocks. Those partials must not blank already streamed
  // assistant text/thinking; the tool lifecycle itself is emitted separately as
  // `tool_event`.
  if (!assistantMessageEvent.type.startsWith('text_') && !nextTextSnapshot) {
    nextTextSnapshot = state.liveAssistantTextSnapshot;
  }

  if (!assistantMessageEvent.type.startsWith('thinking_') && !nextReasoningSnapshot) {
    nextReasoningSnapshot = state.liveAssistantReasoningSnapshot;
  }

  const textChange = computeStreamTextChange(state.liveAssistantTextSnapshot, nextTextSnapshot);
  const thinkingChange = computeStreamTextChange(state.liveAssistantReasoningSnapshot, nextReasoningSnapshot);

  state.liveAssistantTextSnapshot = nextTextSnapshot;
  state.liveAssistantReasoningSnapshot = nextReasoningSnapshot;

  if (textChange?.kind === 'delta') {
    updates.push({
      messageId,
      kind: 'assistant_delta',
      textDelta: textChange.value
    });
  }

  if (textChange?.kind === 'replace') {
    updates.push({
      messageId,
      kind: 'assistant_replace',
      textSnapshot: textChange.value
    });
  }

  if (thinkingChange?.kind === 'delta') {
    updates.push({
      messageId,
      kind: 'thinking_delta',
      thinkingDelta: thinkingChange.value
    });
  }

  if (thinkingChange?.kind === 'replace') {
    updates.push({
      messageId,
      kind: 'thinking_replace',
      thinkingSnapshot: thinkingChange.value
    });
  }

  return updates;
}

function createAssistantCompletionUpdates(
  state: RuntimePiState,
  messageId: string,
  assistantMessage: AssistantMessage
) {
  const updates: RuntimePiAssistantStreamUpdate[] = [];
  let finalTextSnapshot = extractAssistantText(assistantMessage);
  let finalReasoningSnapshot = extractAssistantReasoning(assistantMessage) ?? '';

  // `toolUse` completions often finalize to tool-call-only content even though
  // the provider already streamed a visible preamble sentence. Keep the live
  // text/thinking snapshots stable through the tool boundary; the next
  // assistant message (or durable transcript after reconcile) will advance the
  // visible content.
  if (assistantMessage.stopReason === 'toolUse') {
    if (!finalTextSnapshot) {
      finalTextSnapshot = state.liveAssistantTextSnapshot;
    }

    if (!finalReasoningSnapshot) {
      finalReasoningSnapshot = state.liveAssistantReasoningSnapshot;
    }
  }

  const textChange = computeStreamTextChange(state.liveAssistantTextSnapshot, finalTextSnapshot);
  const thinkingChange = computeStreamTextChange(state.liveAssistantReasoningSnapshot, finalReasoningSnapshot);

  if (textChange?.kind === 'delta') {
    updates.push({
      messageId,
      kind: 'assistant_delta',
      textDelta: textChange.value
    });
  }

  if (textChange?.kind === 'replace') {
    updates.push({
      messageId,
      kind: 'assistant_replace',
      textSnapshot: textChange.value
    });
  }

  if (thinkingChange?.kind === 'delta') {
    updates.push({
      messageId,
      kind: 'thinking_delta',
      thinkingDelta: thinkingChange.value
    });
  }

  if (thinkingChange?.kind === 'replace') {
    updates.push({
      messageId,
      kind: 'thinking_replace',
      thinkingSnapshot: thinkingChange.value
    });
  }

  state.liveAssistantTextSnapshot = '';
  state.liveAssistantReasoningSnapshot = '';
  return updates;
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
  const message = await ctx.messageRepo.createWithNextSeq({
    id: crypto.randomUUID(),
    threadId: input.threadId,
    runId: input.runId,
    role,
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

async function persistPendingAssistantSnapshots(ctx: RuntimePiContext, state: RuntimePiState, messageId: string) {
  if (!state.persistedAssistantReasoningFlushed && state.persistedAssistantReasoningSnapshot.trim()) {
    await appendMessagePart(ctx, state, messageId, 'reasoning', {
      textValue: state.persistedAssistantReasoningSnapshot
    });
    state.persistedAssistantReasoningSnapshot = '';
    state.persistedAssistantReasoningFlushed = true;
  }

  if (!state.persistedAssistantTextFlushed && state.persistedAssistantTextSnapshot.trim()) {
    await appendMessagePart(ctx, state, messageId, 'text', {
      textValue: state.persistedAssistantTextSnapshot
    });
    state.persistedAssistantTextSnapshot = '';
    state.persistedAssistantTextFlushed = true;
  }
}

async function persistAssistantMessage(
  ctx: RuntimePiContext,
  state: RuntimePiState,
  assistantMessage: AssistantMessage,
  capturedSnapshots: CapturedAssistantSnapshots | null = null
) {
  const messageId = state.currentAssistantMessageId;
  if (!messageId) {
    throw new Error('Assistant message was not initialized before completion.');
  }

  let wroteContent = false;
  const finalTextSnapshot = extractAssistantText(assistantMessage);
  const finalReasoningSnapshot = extractAssistantReasoning(assistantMessage) ?? '';

  if (finalTextSnapshot && !state.persistedAssistantTextFlushed) {
    state.persistedAssistantTextSnapshot = finalTextSnapshot;
  } else if (capturedSnapshots?.text) {
    if (!state.persistedAssistantTextFlushed) {
      state.persistedAssistantTextSnapshot = capturedSnapshots.text;
    }
  }

  if (finalReasoningSnapshot && !state.persistedAssistantReasoningFlushed) {
    state.persistedAssistantReasoningSnapshot = finalReasoningSnapshot;
  } else if (capturedSnapshots?.reasoning) {
    if (!state.persistedAssistantReasoningFlushed) {
      state.persistedAssistantReasoningSnapshot = capturedSnapshots.reasoning;
    }
  }

  for (const block of assistantMessage.content) {
    if (block.type === 'text') {
      wroteContent = true;
      state.persistedAssistantTextFlushed = true;
      await appendMessagePart(ctx, state, messageId, 'text', {
        textValue: block.text
      });
      continue;
    }

    if (block.type === 'thinking') {
      wroteContent = true;
      state.persistedAssistantReasoningFlushed = true;
      await appendMessagePart(ctx, state, messageId, 'reasoning', {
        textValue: block.thinking
      });
      continue;
    }
  }

  if (!wroteContent) {
    wroteContent = Boolean(state.persistedAssistantReasoningSnapshot.trim() || state.persistedAssistantTextSnapshot.trim());
    await persistPendingAssistantSnapshots(ctx, state, messageId);
  }

  if (!wroteContent && assistantMessage.stopReason === 'error' && assistantMessage.errorMessage) {
    await appendMessagePart(ctx, state, messageId, 'text', {
      textValue: assistantMessage.errorMessage
    });
  }

  await ctx.messageRepo.updateStatus(messageId, assistantMessage.stopReason === 'error' || assistantMessage.stopReason === 'aborted' ? 'failed' : 'completed');
  state.openAssistantMessageId = null;
  state.persistedAssistantTextSnapshot = '';
  state.persistedAssistantReasoningSnapshot = '';
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

async function emitPersistedUpdate(options: RuntimePiRunTurnOptions | undefined, update: RuntimePiPersistedUpdate | null) {
  if (!options?.onPersistedUpdate || !update) {
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
  update: RuntimePiAssistantStreamUpdate | null
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
  event: AgentEvent,
  capturedAssistantSnapshots: CapturedAssistantSnapshots | null = null
): Promise<RuntimePiPersistedUpdate | null> {
  if (event.type === 'agent_start') {
    const run = await ctx.runRepo.updateStatus(input.runId, 'running', { startedAt: new Date() });
    const runEvent = await appendRunEvent(ctx, state, input, event);
    return { runEvent, run };
  }

  if (event.type === 'message_start' && event.message.role === 'assistant') {
    const messageId = state.openAssistantMessageId ?? crypto.randomUUID();
    const message = await ctx.messageRepo.createWithNextSeq({
      id: messageId,
      threadId: input.threadId,
      runId: input.runId,
      role: 'assistant',
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
    state.persistedAssistantTextSnapshot = '';
    state.persistedAssistantReasoningSnapshot = '';
    state.persistedAssistantTextFlushed = false;
    state.persistedAssistantReasoningFlushed = false;
    const runEvent = await appendRunEvent(ctx, state, input, event);
    return { runEvent };
  }

  if (event.type === 'message_update' && event.message.role === 'assistant') {
    return null;
  }

  if (event.type === 'message_end' && event.message.role === 'assistant') {
    await persistAssistantMessage(ctx, state, event.message, capturedAssistantSnapshots);
    const runEvent = await appendRunEvent(ctx, state, input, event);
    return { runEvent };
  }

  if (event.type === 'tool_execution_start') {
    const assistantMessageId = state.currentAssistantMessageId;
    if (!assistantMessageId) {
      throw new Error('Tool execution started before an assistant message was persisted.');
    }

    if (capturedAssistantSnapshots) {
      state.persistedAssistantTextSnapshot = capturedAssistantSnapshots.text;
      state.persistedAssistantReasoningSnapshot = capturedAssistantSnapshots.reasoning;
    }
    await persistPendingAssistantSnapshots(ctx, state, assistantMessageId);

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

    state.toolInvocationByCallId.set(event.toolCallId, {
      id: invocation.id,
      messageId: assistantMessageId,
      status: 'running',
      input: asRecordOrNull(event.args)
    });
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
        artifact: asRecordOrNull((event.result as { artifact?: unknown } | null | undefined)?.artifact),
        isError: event.isError
      },
      error: event.isError ? extractTextContent(Array.isArray(event.result?.content) ? event.result.content : []) || event.toolName : null,
      finishedAt: new Date()
    });
    state.toolInvocationByCallId.set(event.toolCallId, {
      ...invocation,
      status: nextStatus
    });
    state.liveToolInputByCallId.delete(event.toolCallId);

    await persistToolResultMessage(ctx, state, input, event);
    const runEvent = await appendRunEvent(ctx, state, input, event);
    return { runEvent, toolInvocation: updatedInvocation };
  }

  if (event.type === 'agent_end') {
    const terminalAssistantFailure =
      [...event.messages]
        .reverse()
        .find((message) => message.role === 'assistant' && (message.stopReason === 'error' || message.stopReason === 'aborted')) ?? null;
    const status = terminalAssistantFailure ? 'failed' : 'completed';

    const run = await ctx.runRepo.updateStatus(input.runId, status, {
      finishedAt: new Date(),
      error: terminalAssistantFailure ? deriveAssistantFailureMessage(terminalAssistantFailure) : null,
      usage: createUsageSummary(
        event.messages.filter(
          (message): message is PiMessage => message.role === 'assistant' || message.role === 'toolResult' || message.role === 'user'
        ),
        {
          provider: String(model.provider),
          model: model.id
        }
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
    async generateText(input) {
      return await resolveGenerateTextResult(options, input);
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
        model: selection.model,
        webSearchEnabled: input.webSearchEnabled
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

  const model = options.model ?? await resolveConfiguredModel(config as RuntimePiConfig);
  const history = await ctx.messageRepo.listByThread(input.threadId);
  const { systemPrompt, messages } = buildInitialAgentState(history, model, options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT);
  const lastMessage = messages.at(-1);

  if (!lastMessage || (lastMessage.role !== 'user' && lastMessage.role !== 'toolResult')) {
    throw new Error('runtime-pi requires the latest persisted thread message to be a user or tool result message.');
  }

  const state: RuntimePiState = {
    nextRunEventSeq: await ctx.runEventRepo.nextSeq(input.runId),
    currentAssistantMessageId: null,
    openAssistantMessageId: null,
    liveAssistantMessageId: null,
    liveAssistantTextSnapshot: '',
    liveAssistantReasoningSnapshot: '',
    persistedAssistantTextSnapshot: '',
    persistedAssistantReasoningSnapshot: '',
    persistedAssistantTextFlushed: false,
    persistedAssistantReasoningFlushed: false,
    nextPartIndexByMessageId: new Map(),
    toolInvocationByCallId: new Map(),
    liveToolInputByCallId: new Map(),
    persistedToolCallIds: new Set()
  };

  const tools = options.tools ?? [];
  const enabledToolNames = new Set(tools.map((tool) => tool.name));
  const projectedMessages = projectAgentMessagesForEnabledTools(messages, {
    enabledToolNames
  });
  const deepseekThinkingEnabled = input.provider === 'deepseek' ? input.thinkingEnabled === true : false;
  const thinkingLevel =
    deepseekThinkingEnabled
      ? input.reasoningEffort === 'max'
        ? 'xhigh'
        : 'high'
      : 'off';

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      thinkingLevel,
      tools,
      messages: projectedMessages
    },
    onPayload: async (payload) => {
      if (input.provider !== 'deepseek' || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return undefined;
      }

      return {
        ...(payload as Record<string, unknown>),
        thinking: {
          type: deepseekThinkingEnabled ? 'enabled' : 'disabled'
        }
      };
    },
    convertToLlm,
    getApiKey: options.getApiKey ?? ((provider) => (provider === config?.provider ? config.apiKey : undefined)),
    toolExecution: 'parallel'
  });

  let eventChain = Promise.resolve();
  let liveEventChain = Promise.resolve();
  let subscriberFailure: unknown = null;

  const unsubscribe = agent.subscribe((event) => {
    const capturedAssistantSnapshots: CapturedAssistantSnapshots | null =
      event.type === 'message_end' && event.message.role === 'assistant'
        ? {
            text: state.persistedAssistantTextSnapshot,
            reasoning: state.persistedAssistantReasoningSnapshot
          }
        : event.type === 'tool_execution_start'
          ? {
              text: state.persistedAssistantTextSnapshot,
              reasoning: state.persistedAssistantReasoningSnapshot
            }
          : null;

    if (event.type === 'message_start' && event.message.role === 'assistant') {
      // Live assistant segments must not reuse the persisted assistant message
      // identity. Persisted assistant messages are opened/closed on the async
      // durable event chain, while live rendering needs a fresh identity as
      // soon as the provider starts a new assistant message. Reusing
      // `openAssistantMessageId` here lets adjacent assistant messages collapse
      // into one live segment when persistence lags behind streaming.
      state.liveAssistantMessageId = crypto.randomUUID();
      state.liveAssistantTextSnapshot = '';
      state.liveAssistantReasoningSnapshot = '';
    }

    if (event.type === 'message_update' && event.message.role === 'assistant') {
      updatePersistedAssistantSnapshots(state, event.assistantMessageEvent);
      const assistantStreamUpdates = state.liveAssistantMessageId
        ? createAssistantStreamUpdates(state, state.liveAssistantMessageId, event.assistantMessageEvent)
        : [];

      liveEventChain = liveEventChain.then(async () => {
        for (const update of assistantStreamUpdates) {
          await emitLiveAssistantUpdate(runOptions, update);
        }
      });
    }

    if (event.type === 'message_end' && event.message.role === 'assistant') {
      const assistantStreamUpdates = state.liveAssistantMessageId
        ? createAssistantCompletionUpdates(state, state.liveAssistantMessageId, event.message)
        : [];

      liveEventChain = liveEventChain.then(async () => {
        for (const update of assistantStreamUpdates) {
          await emitLiveAssistantUpdate(runOptions, update);
        }
      });
    }

    if (event.type === 'tool_execution_start') {
      const messageId = state.liveAssistantMessageId;
      const liveToolInput = asRecordOrNull(event.args);
      state.liveToolInputByCallId.set(event.toolCallId, liveToolInput);
      if (messageId) {
        liveEventChain = liveEventChain.then(async () => {
          await emitLiveAssistantUpdate(runOptions, {
            messageId,
            kind: 'tool_event',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            phase: 'start',
            input: liveToolInput
          });
        });
      }
    }

    if (event.type === 'tool_execution_end') {
      const messageId = state.liveAssistantMessageId;
      if (messageId) {
        liveEventChain = liveEventChain.then(async () => {
          await emitLiveAssistantUpdate(runOptions, {
            messageId,
            kind: 'tool_event',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            phase: event.isError ? 'failed' : 'completed',
            input: state.liveToolInputByCallId.get(event.toolCallId) ?? state.toolInvocationByCallId.get(event.toolCallId)?.input ?? null
          });
        });
      }
    }

    eventChain = eventChain.then(async () => {
      if (subscriberFailure) {
        return;
      }

      const update = await handleAgentEvent(ctx, state, input, model, event, capturedAssistantSnapshots);
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
