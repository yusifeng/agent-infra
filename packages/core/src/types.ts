export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export type ToolInvocationStatus = 'pending' | 'running' | 'completed' | 'failed';

export type MessagePartType = 'text' | 'tool-call' | 'tool-result' | 'reasoning' | 'data';

export interface Thread {
  id: string;
  appId: string;
  userId?: string | null;
  title?: string | null;
  status: 'active' | 'archived';
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | null;
}

export interface Run {
  id: string;
  threadId: string;
  triggerMessageId?: string | null;
  provider?: string | null;
  model?: string | null;
  status: RunStatus;
  usage?: Record<string, unknown> | null;
  error?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  createdAt: Date;
}

export interface Message {
  id: string;
  threadId: string;
  runId?: string | null;
  role: MessageRole;
  seq: number;
  status: 'created' | 'completed' | 'failed';
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}

export interface MessagePart {
  id: string;
  messageId: string;
  partIndex: number;
  type: MessagePartType;
  textValue?: string | null;
  jsonValue?: Record<string, unknown> | null;
  createdAt: Date;
}

export interface ToolInvocation {
  id: string;
  threadId: string;
  runId: string;
  messageId: string;
  toolName: string;
  toolCallId: string;
  status: ToolInvocationStatus;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  error?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  createdAt: Date;
}

export interface Artifact {
  id: string;
  threadId: string;
  runId?: string | null;
  kind: string;
  uri?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}
