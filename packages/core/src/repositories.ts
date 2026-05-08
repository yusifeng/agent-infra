import type {
  Artifact,
  ChatShare,
  ChatShareSnapshot,
  Message,
  MessagePart,
  Run,
  RunEvent,
  Thread,
  ToolInvocation
} from './types.js';

export interface MessagePageInfo {
  hasOlder: boolean;
  hasNewer: boolean;
  startSeq: number | null;
  endSeq: number | null;
}

export interface MessagePageResult {
  messages: Array<Message & { parts: MessagePart[] }>;
  pageInfo: MessagePageInfo;
}

export interface ThreadRepository {
  create(input: Omit<Thread, 'createdAt' | 'updatedAt'>): Promise<Thread>;
  findById(id: string): Promise<Thread | null>;
  listByApp(appId: string): Promise<Thread[]>;
  rename(id: string, title: string | null, updatedAt: Date): Promise<Thread>;
  archive(id: string, archivedAt: Date): Promise<Thread>;
  touch(id: string, updatedAt: Date): Promise<Thread>;
}

export interface RunRepository {
  create(input: Omit<Run, 'createdAt'>): Promise<Run>;
  findById(id: string): Promise<Run | null>;
  findLatestActiveByThread(threadId: string): Promise<Run | null>;
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
  listPageByThread(threadId: string, options?: { limit?: number; beforeSeq?: number; afterSeq?: number }): Promise<MessagePageResult>;
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

export interface ChatShareRepository {
  create(input: Omit<ChatShare, 'createdAt'>): Promise<ChatShare>;
  findById(id: string): Promise<ChatShare | null>;
  findByPublicId(publicId: string): Promise<ChatShare | null>;
  findActiveByThread(threadId: string): Promise<ChatShare | null>;
  updateStatus(id: string, status: ChatShare['status'], patch?: Partial<ChatShare>): Promise<ChatShare>;
}

export interface ChatShareSnapshotRepository {
  create(input: Omit<ChatShareSnapshot, 'createdAt'>): Promise<ChatShareSnapshot>;
  findById(id: string): Promise<ChatShareSnapshot | null>;
}
