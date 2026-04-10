import type { Artifact, Message, MessagePart, Run, RunEvent, Thread, ToolInvocation } from './types';

export interface ThreadRepository {
  create(input: Omit<Thread, 'createdAt' | 'updatedAt'>): Promise<Thread>;
  findById(id: string): Promise<Thread | null>;
  listByApp(appId: string): Promise<Thread[]>;
}

export interface RunRepository {
  create(input: Omit<Run, 'createdAt'>): Promise<Run>;
  findById(id: string): Promise<Run | null>;
  listByThread(threadId: string, options?: { limit?: number }): Promise<Run[]>;
  updateStatus(id: string, status: Run['status'], patch?: Partial<Run>): Promise<Run>;
}

export interface RunEventRepository {
  append(input: Omit<RunEvent, 'createdAt'>): Promise<RunEvent>;
  listByRun(runId: string): Promise<RunEvent[]>;
  nextSeq(runId: string): Promise<number>;
}

export interface MessageRepository {
  create(input: Omit<Message, 'createdAt'>): Promise<Message>;
  updateStatus(id: string, status: Message['status']): Promise<Message>;
  createPart(input: Omit<MessagePart, 'createdAt'>): Promise<MessagePart>;
  listByThread(threadId: string): Promise<Array<Message & { parts: MessagePart[] }>>;
  nextSeq(threadId: string): Promise<number>;
}

export interface ToolInvocationRepository {
  create(input: Omit<ToolInvocation, 'createdAt'>): Promise<ToolInvocation>;
  updateStatus(id: string, status: ToolInvocation['status'], patch?: Partial<ToolInvocation>): Promise<ToolInvocation>;
  listByRun(runId: string): Promise<ToolInvocation[]>;
}

export interface ArtifactRepository {
  create(input: Omit<Artifact, 'createdAt'>): Promise<Artifact>;
  findByThread(threadId: string): Promise<Artifact[]>;
}
