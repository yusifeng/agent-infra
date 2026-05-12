import type {
  ChatShare,
  ChatShareSnapshot,
  Message,
  MessagePageResult,
  MessagePart,
  MessageRepository,
  Run,
  RunEvent,
  RunEventRepository,
  RunRepository,
  Thread,
  ThreadRepository,
  ToolInvocation,
  ToolInvocationRepository,
  ChatShareRepository,
  ChatShareSnapshotRepository
} from '@agent-infra/core';

export interface AgentInfraAppRepositories {
  threadRepo: ThreadRepository;
  runRepo: RunRepository;
  messageRepo: MessageRepository;
  toolRepo: ToolInvocationRepository;
  runEventRepo: RunEventRepository;
  chatShareRepo: ChatShareRepository;
  chatShareSnapshotRepo: ChatShareSnapshotRepository;
}

export interface RuntimeSelection {
  provider: string;
  model: string;
}

export interface RunTextRuntimeInput {
  threadId: string;
  runId: string;
  provider: string;
  model: string;
  thinkingEnabled?: boolean;
  reasoningEffort?: 'high' | 'max';
  webSearchEnabled?: boolean;
}

export interface GenerateTextRuntimeInput {
  provider?: string;
  model?: string;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: 'off' | 'high' | 'max';
}

export interface GenerateTextRuntimeResult {
  provider: string;
  model: string;
  text: string | null;
}

export interface StartTextTurnResult {
  run: Run;
  userMessage: Message & { parts: MessagePart[] };
  runtimeSelection: RuntimeSelection;
}

export interface AgentInfraRuntimePort {
  prepare(input: { provider?: string; model?: string }): Promise<RuntimeSelection>;
  runTextTurn(repositories: AgentInfraAppRepositories, input: RunTextRuntimeInput): Promise<void>;
  generateText(input: GenerateTextRuntimeInput): Promise<GenerateTextRuntimeResult>;
}

export interface CreateThreadInput {
  appId: string;
  title?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ListThreadsInput {
  appId: string;
}

export interface RenameThreadInput {
  threadId: string;
  title: string;
}

export interface ArchiveThreadInput {
  threadId: string;
}

export interface GetThreadMessagesInput {
  threadId: string;
  limit?: number;
  beforeSeq?: number;
  afterSeq?: number;
}

export interface RunTextTurnInput {
  threadId: string;
  text: string;
  provider?: string;
  model?: string;
  thinkingEnabled?: boolean;
  reasoningEffort?: 'high' | 'max';
  webSearchEnabled?: boolean;
}

export interface RunTextTurnResult {
  run: Run;
  messages: Array<Message & { parts: MessagePart[] }>;
  executionError?: string;
  debug: {
    runEventCount: number;
    toolInvocationCount: number;
  };
}

export interface GetRunTimelineInput {
  runId: string;
}

export interface RunTimelineResult {
  run: Run;
  runEvents: RunEvent[];
  toolInvocations: ToolInvocation[];
}

export interface GetThreadRunsInput {
  threadId: string;
  limit?: number;
}

export interface GetActiveThreadRunInput {
  threadId: string;
}

export interface CreateThreadSnapshotShareInput {
  threadId: string;
}

export interface GetPublicShareInput {
  publicId: string;
}

export interface RevokeShareInput {
  publicId: string;
}

export interface GetCurrentThreadShareInput {
  threadId: string;
}

export interface SharedMessagePartSnapshot {
  id: string;
  messageId: string;
  partIndex: number;
  type: MessagePart['type'];
  textValue?: string | null;
  jsonValue?: Record<string, unknown> | null;
  createdAt: string;
}

export interface SharedMessageSnapshot {
  id: string;
  runId?: string | null;
  role: Message['role'];
  seq: number;
  createdAt: string;
  parts: SharedMessagePartSnapshot[];
}

export interface SharedSearchBundle {
  runId?: string | null;
  toolCallId: string;
  toolName: string;
  status: ToolInvocation['status'];
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface SharedThreadSnapshotPayload {
  payloadFormat: 'messages_v1';
  payloadVersion: 1;
  title?: string | null;
  messages: SharedMessageSnapshot[];
  searchBundles?: Record<string, SharedSearchBundle> | null;
}

export interface CreateThreadSnapshotShareResult {
  share: ChatShare;
  snapshot: ChatShareSnapshot;
}

export interface PublicChatShareResult {
  share: ChatShare;
  snapshot: SharedThreadSnapshotPayload;
}

export interface AgentInfraAppDependencies {
  repositories: AgentInfraAppRepositories;
  runtime: AgentInfraRuntimePort;
  transaction: <T>(operation: (repositories: AgentInfraAppRepositories) => Promise<T>) => Promise<T>;
  idGenerator?: () => string;
  now?: () => Date;
}

export interface AgentInfraApp {
  threads: {
    create(input: CreateThreadInput): Promise<Thread>;
    list(input: ListThreadsInput): Promise<Thread[]>;
    rename(input: RenameThreadInput): Promise<Thread>;
    archive(input: ArchiveThreadInput): Promise<Thread>;
    getMessages(input: GetThreadMessagesInput): Promise<Array<Message & { parts: MessagePart[] }>>;
    getMessagesPage(input: GetThreadMessagesInput): Promise<MessagePageResult>;
  };
  turns: {
    startText(input: RunTextTurnInput): Promise<StartTextTurnResult>;
    runText(input: RunTextTurnInput): Promise<RunTextTurnResult>;
  };
  runs: {
    getTimeline(input: GetRunTimelineInput): Promise<RunTimelineResult>;
    listByThread(input: GetThreadRunsInput): Promise<Run[]>;
    getActiveByThread(input: GetActiveThreadRunInput): Promise<Run | null>;
  };
  shares: {
    createThreadSnapshot(input: CreateThreadSnapshotShareInput): Promise<CreateThreadSnapshotShareResult>;
    getCurrentByThread(input: GetCurrentThreadShareInput): Promise<ChatShare | null>;
    getPublic(input: GetPublicShareInput): Promise<PublicChatShareResult>;
    revoke(input: RevokeShareInput): Promise<ChatShare>;
  };
}
