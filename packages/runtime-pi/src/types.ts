import type { Message, MessagePart, MessageRepository, Run, RunEvent, RunEventRepository, RunRepository, ToolInvocation, ToolInvocationRepository } from '@agent-infra/core';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { Model } from '@mariozechner/pi-ai';

export type RuntimePiProvider = 'openai' | 'deepseek';

export interface RuntimePiContext {
  runRepo: RunRepository;
  messageRepo: MessageRepository;
  toolRepo: ToolInvocationRepository;
  runEventRepo: RunEventRepository;
}

export interface RuntimePiInput {
  threadId: string;
  runId: string;
  historyMessages?: Array<Message & { parts: MessagePart[] }>;
  provider?: string;
  model?: string;
  thinkingEnabled?: boolean;
  reasoningEffort?: 'high' | 'max';
  webSearchEnabled?: boolean;
}

export interface RuntimePiGenerateTextInput {
  provider?: string;
  model?: string;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: 'off' | 'high' | 'max';
}

export interface RuntimePiGenerateTextResult {
  provider: string;
  model: string;
  text: string | null;
}

export interface RuntimePiModelOption {
  key: string;
  provider: RuntimePiProvider;
  model: string;
  label: string;
  description: string;
}

export interface RuntimePiConfig {
  provider: RuntimePiProvider;
  model: string;
  apiKey: string;
}

export interface RuntimePiToolContext {
  threadId: string;
  runId: string;
  provider: string;
  model: string;
  webSearchEnabled?: boolean;
}

export type RuntimePiToolProvider = AgentTool[] | ((context: RuntimePiToolContext) => AgentTool[] | Promise<AgentTool[]>);

export interface RuntimePiSelection {
  provider: string;
  model: string;
}

export interface RuntimePiRuntimeOptions {
  model?: Model<any>;
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
  systemPrompt?: string;
  tools?: RuntimePiToolProvider;
  resolveConfig?: (preferred: Pick<RuntimePiInput, 'provider' | 'model'>) => RuntimePiConfig | Promise<RuntimePiConfig>;
}

export interface RuntimePiPersistedUpdate {
  runEvent?: RunEvent | null;
  run?: Run | null;
  toolInvocation?: ToolInvocation | null;
}

export interface RuntimePiAssistantDeltaUpdate {
  messageId: string;
  kind: 'assistant_delta';
  textDelta: string;
}

export interface RuntimePiAssistantReplaceUpdate {
  messageId: string;
  kind: 'assistant_replace';
  textSnapshot: string;
}

export interface RuntimePiThinkingDeltaUpdate {
  messageId: string;
  kind: 'thinking_delta';
  thinkingDelta: string;
}

export interface RuntimePiThinkingReplaceUpdate {
  messageId: string;
  kind: 'thinking_replace';
  thinkingSnapshot: string;
}

export interface RuntimePiToolEventUpdate {
  messageId: string;
  kind: 'tool_event';
  toolCallId: string;
  toolName: string;
  phase: 'start' | 'completed' | 'failed';
  input?: Record<string, unknown> | null;
}

export type RuntimePiAssistantStreamUpdate =
  | RuntimePiAssistantDeltaUpdate
  | RuntimePiAssistantReplaceUpdate
  | RuntimePiThinkingDeltaUpdate
  | RuntimePiThinkingReplaceUpdate
  | RuntimePiToolEventUpdate;

export interface RuntimePiRunTurnOptions {
  onPersistedUpdate?: (update: RuntimePiPersistedUpdate) => void | Promise<void>;
  onLiveAssistantUpdate?: (update: RuntimePiAssistantStreamUpdate) => void | Promise<void>;
}

export interface RuntimePiRuntime {
  prepare(input?: Pick<RuntimePiInput, 'provider' | 'model'>): Promise<RuntimePiSelection>;
  runTurn(ctx: RuntimePiContext, input: RuntimePiInput, options?: RuntimePiRunTurnOptions): Promise<void>;
  generateText(input: RuntimePiGenerateTextInput): Promise<RuntimePiGenerateTextResult>;
}
