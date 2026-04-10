import type { MessageRepository, RunEventRepository, RunRepository, ToolInvocationRepository } from '@agent-infra/core';
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

export interface RuntimePiRuntime {
  prepare(input?: Pick<RuntimePiInput, 'provider' | 'model'>): Promise<RuntimePiSelection>;
  runTurn(ctx: RuntimePiContext, input: RuntimePiInput): Promise<void>;
}
