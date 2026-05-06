import type {
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
  ToolInvocationRepository
} from '@agent-infra/core';

export interface AgentInfraAppRepositories {
  threadRepo: ThreadRepository;
  runRepo: RunRepository;
  messageRepo: MessageRepository;
  toolRepo: ToolInvocationRepository;
  runEventRepo: RunEventRepository;
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
}

export interface StartTextTurnResult {
  run: Run;
  userMessage: Message & { parts: MessagePart[] };
  runtimeSelection: RuntimeSelection;
}

export interface AgentInfraRuntimePort {
  prepare(input: { provider?: string; model?: string }): Promise<RuntimeSelection>;
  runTextTurn(repositories: AgentInfraAppRepositories, input: RunTextRuntimeInput): Promise<void>;
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
}
