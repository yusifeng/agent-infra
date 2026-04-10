import type { MessageRepository, RunEventRepository, RunRepository, ToolInvocationRepository } from '@agent-infra/core';

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
