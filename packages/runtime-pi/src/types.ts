import type { MessageRepository, Run, RunEvent, RunEventRepository, RunRepository, ToolInvocation, ToolInvocationRepository } from '@agent-infra/core';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { AssistantMessageEvent, Model } from '@mariozechner/pi-ai';

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
  provider?: string;
  model?: string;
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
  assistantStream?: RuntimePiAssistantStreamUpdate | null;
}

export interface RuntimePiAssistantStreamUpdate {
  messageId: string;
  eventType: Exclude<AssistantMessageEvent['type'], 'done' | 'error'>;
  partialText: string;
  partialReasoning: string | null;
}

export interface RuntimePiRunTurnOptions {
  onPersistedUpdate?: (update: RuntimePiPersistedUpdate) => void | Promise<void>;
  onLiveAssistantUpdate?: (update: RuntimePiAssistantStreamUpdate) => void | Promise<void>;
}

export interface RuntimePiRuntime {
  prepare(input?: Pick<RuntimePiInput, 'provider' | 'model'>): Promise<RuntimePiSelection>;
  runTurn(ctx: RuntimePiContext, input: RuntimePiInput, options?: RuntimePiRunTurnOptions): Promise<void>;
}
