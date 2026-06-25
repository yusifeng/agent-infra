import type {
  AnswerCandidate,
  AnswerSelection,
  Artifact,
  ChatShare,
  ChatShareSnapshot,
  Dataset,
  DatasetExample,
  EvalExampleResult,
  EvalRun,
  EvalRunCompareTriage,
  Message,
  MessagePart,
  RunFeedback,
  Run,
  RunApprovalRequest,
  RunStatus,
  RunStatusCount,
  CloudAgentWorker,
  RunEvent,
  Thread,
  ToolInvocation,
  Workspace,
  WorkspaceChangeSet,
  WorkspaceFileChange,
  AgentProfile,
  WorkspaceFileIndexEntry,
  WorkspaceSecretRef,
  ProviderSessionBinding,
  ProviderTranscriptEntry
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

export interface WorkspaceRepository {
  create(input: Omit<Workspace, 'createdAt' | 'updatedAt'>): Promise<Workspace>;
  findById(id: string): Promise<Workspace | null>;
  findDefaultByUser(input: { appId: string; userId: string }): Promise<Workspace | null>;
  listByUser(input: { appId: string; userId: string }): Promise<Workspace[]>;
  archive(id: string, archivedAt: Date): Promise<Workspace>;
  touch(id: string, updatedAt: Date): Promise<Workspace>;
}

export interface AgentProfileRepository {
  create(input: Omit<AgentProfile, 'createdAt' | 'updatedAt'>): Promise<AgentProfile>;
  findById(id: string): Promise<AgentProfile | null>;
  findDefaultByWorkspace(workspaceId: string): Promise<AgentProfile | null>;
  listByWorkspace(workspaceId: string): Promise<AgentProfile[]>;
  update(
    id: string,
    patch: Partial<
      Pick<
        AgentProfile,
        | 'name'
        | 'provider'
        | 'model'
        | 'defaultForWorkspace'
        | 'approvalPolicy'
        | 'sandboxMode'
        | 'toolAllowlist'
        | 'mcpServers'
        | 'skillRefs'
        | 'secretRefs'
        | 'metadata'
      >
    >,
    updatedAt: Date
  ): Promise<AgentProfile>;
  archive(id: string, archivedAt: Date): Promise<AgentProfile>;
}

export interface WorkspaceSecretRefRepository {
  create(input: Omit<WorkspaceSecretRef, 'createdAt' | 'updatedAt'>): Promise<WorkspaceSecretRef>;
  findById(id: string): Promise<WorkspaceSecretRef | null>;
  listByWorkspace(workspaceId: string): Promise<WorkspaceSecretRef[]>;
  archive(id: string, archivedAt: Date): Promise<WorkspaceSecretRef>;
}

export interface WorkspaceFileIndexRepository {
  upsert(
    input: Omit<WorkspaceFileIndexEntry, 'id' | 'createdAt' | 'updatedAt'> & {
      id?: string;
    }
  ): Promise<WorkspaceFileIndexEntry>;
  listByWorkspace(workspaceId: string, options?: { includeDeleted?: boolean }): Promise<WorkspaceFileIndexEntry[]>;
  markDeleted(input: { workspaceId: string; path: string; deletedAt: Date }): Promise<WorkspaceFileIndexEntry>;
}

export interface WorkspaceChangeSetRepository {
  create(input: Omit<WorkspaceChangeSet, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<WorkspaceChangeSet>;
  findById(id: string): Promise<WorkspaceChangeSet | null>;
  listByWorkspace(workspaceId: string, options?: { includeResolved?: boolean }): Promise<WorkspaceChangeSet[]>;
  listByRun(runId: string): Promise<WorkspaceChangeSet[]>;
  updateStatus(
    id: string,
    status: WorkspaceChangeSet['status'],
    patch?: Partial<Pick<WorkspaceChangeSet, 'metadata' | 'nextSnapshotId' | 'resolvedAt'>>
  ): Promise<WorkspaceChangeSet>;
}

export interface WorkspaceFileChangeRepository {
  create(input: Omit<WorkspaceFileChange, 'id' | 'createdAt'> & { id?: string }): Promise<WorkspaceFileChange>;
  createMany(inputs: Array<Omit<WorkspaceFileChange, 'id' | 'createdAt'> & { id?: string }>): Promise<WorkspaceFileChange[]>;
  listByChangeSet(changeSetId: string): Promise<WorkspaceFileChange[]>;
  listByRun(runId: string): Promise<WorkspaceFileChange[]>;
}

export interface RunRepository {
  countByApp(appId: string): Promise<RunStatusCount>;
  create(input: Omit<Run, 'createdAt'>): Promise<Run>;
  findById(id: string): Promise<Run | null>;
  findLatestActiveByThread(threadId: string): Promise<Run | null>;
  listByApp(appId: string, options?: { limit?: number; statuses?: RunStatus[] }): Promise<Run[]>;
  listActiveByThread(threadId: string): Promise<Run[]>;
  listByThread(threadId: string, options?: { limit?: number }): Promise<Run[]>;
  claimById(input: { runId: string; workerId: string; leaseExpiresAt: Date; now: Date }): Promise<Run | null>;
  claimNextQueued(input: { appId: string; workerId: string; leaseExpiresAt: Date; now: Date }): Promise<Run | null>;
  extendClaim(input: { runId: string; workerId: string; leaseExpiresAt: Date; now: Date }): Promise<Run | null>;
  updateStatus(id: string, status: Run['status'], patch?: Partial<Run>): Promise<Run>;
}

export interface CloudAgentWorkerRepository {
  heartbeat(
    input: Omit<CloudAgentWorker, 'createdAt' | 'updatedAt'> & {
      heartbeatAt: Date;
    }
  ): Promise<CloudAgentWorker>;
  findById(id: string): Promise<CloudAgentWorker | null>;
  listByApp(appId: string, options?: { since?: Date; limit?: number }): Promise<CloudAgentWorker[]>;
  markStopped(input: { actorId?: string | null; id: string; reason?: string | null; stoppedAt: Date }): Promise<CloudAgentWorker | null>;
  markStoppedIfStale(input: {
    actorId?: string | null;
    id: string;
    reason?: string | null;
    staleBefore: Date;
    stoppedAt: Date;
  }): Promise<CloudAgentWorker | null>;
  clearDrain(input: { actorId: string; id: string; reason?: string | null; requestedAt: Date }): Promise<CloudAgentWorker | null>;
  requestDrain(input: { actorId: string; id: string; reason?: string | null; requestedAt: Date }): Promise<CloudAgentWorker | null>;
}

export interface AnswerCandidateRepository {
  create(input: Omit<AnswerCandidate, 'createdAt'>): Promise<AnswerCandidate>;
  findByRunId(runId: string): Promise<AnswerCandidate | null>;
  listByRunIds(runIds: string[]): Promise<AnswerCandidate[]>;
  listByThread(threadId: string): Promise<AnswerCandidate[]>;
  listByTriggerMessage(threadId: string, triggerMessageId: string): Promise<AnswerCandidate[]>;
}

export interface AnswerSelectionRepository {
  getByThreadAndTrigger(threadId: string, triggerMessageId: string): Promise<AnswerSelection | null>;
  listByThread(threadId: string): Promise<AnswerSelection[]>;
  upsert(input: Omit<AnswerSelection, 'createdAt' | 'updatedAt'>): Promise<AnswerSelection>;
}

export interface RunFeedbackRepository {
  clear(input: { runId: string; feedbackActorId: string }): Promise<void>;
  listByRunIds(runIds: string[], feedbackActorId?: string): Promise<RunFeedback[]>;
  set(input: Omit<RunFeedback, 'createdAt' | 'updatedAt'>): Promise<RunFeedback>;
}

export interface DatasetRepository {
  create(input: Omit<Dataset, 'createdAt' | 'updatedAt'>): Promise<Dataset>;
  findById(id: string): Promise<Dataset | null>;
  listByApp(input: {
    appId: string;
    actorId?: string | null;
    includeAppVisible?: boolean;
  }): Promise<Dataset[]>;
  update(
    id: string,
    patch: Partial<Pick<Dataset, 'name' | 'description' | 'visibility' | 'metadata'>>,
    updatedAt: Date
  ): Promise<Dataset>;
}

export interface DatasetExampleRepository {
  create(input: Omit<DatasetExample, 'createdAt' | 'updatedAt'>): Promise<DatasetExample>;
  findById(id: string): Promise<DatasetExample | null>;
  listByDataset(datasetId: string): Promise<DatasetExample[]>;
  updateExpectedOutput(
    id: string,
    patch: {
      expectedOutputJson?: Record<string, unknown> | null;
      metadataJson?: Record<string, unknown> | null;
    },
    updatedAt: Date
  ): Promise<DatasetExample>;
}

export interface EvalRunRepository {
  create(input: Omit<EvalRun, 'createdAt' | 'updatedAt'>): Promise<EvalRun>;
  findById(id: string): Promise<EvalRun | null>;
  listByDataset(datasetId: string): Promise<EvalRun[]>;
  update(
    id: string,
    patch: Partial<
      Pick<EvalRun, 'status' | 'name' | 'configJson' | 'summaryJson' | 'error' | 'startedAt' | 'finishedAt'>
    >,
    updatedAt: Date
  ): Promise<EvalRun>;
}

export interface EvalExampleResultRepository {
  create(input: Omit<EvalExampleResult, 'createdAt' | 'updatedAt'>): Promise<EvalExampleResult>;
  createMany(inputs: Array<Omit<EvalExampleResult, 'createdAt' | 'updatedAt'>>): Promise<EvalExampleResult[]>;
  findById(id: string): Promise<EvalExampleResult | null>;
  listByEvalRun(evalRunId: string): Promise<EvalExampleResult[]>;
  update(
    id: string,
    patch: Partial<
      Pick<
        EvalExampleResult,
        | 'status'
        | 'evalThreadId'
        | 'outputRunId'
        | 'actualOutputJson'
        | 'inputJson'
        | 'usageJson'
        | 'metadataJson'
        | 'error'
        | 'startedAt'
        | 'finishedAt'
      >
    >,
    updatedAt: Date
  ): Promise<EvalExampleResult>;
}

export interface EvalRunCompareTriageRepository {
  findByPairAndExample(input: {
    baselineEvalRunId: string;
    candidateEvalRunId: string;
    datasetExampleId: string;
  }): Promise<EvalRunCompareTriage | null>;
  listByPair(input: {
    baselineEvalRunId: string;
    candidateEvalRunId: string;
  }): Promise<EvalRunCompareTriage[]>;
  createOrUpdate(
    input: Omit<EvalRunCompareTriage, 'createdAt' | 'updatedAt'>
  ): Promise<EvalRunCompareTriage>;
  deleteByPairAndExample(input: {
    baselineEvalRunId: string;
    candidateEvalRunId: string;
    datasetExampleId: string;
  }): Promise<void>;
}

export interface RunEventRepository {
  append(input: Omit<RunEvent, 'createdAt'>): Promise<RunEvent>;
  listByRun(runId: string): Promise<RunEvent[]>;
  nextSeq(runId: string): Promise<number>;
}

export interface ProviderSessionBindingRepository {
  upsertActive(
    input: Omit<ProviderSessionBinding, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'archivedAt'> & {
      id?: string;
    }
  ): Promise<ProviderSessionBinding>;
  findActiveByThread(input: { threadId: string; provider: string }): Promise<ProviderSessionBinding | null>;
  listByThread(threadId: string): Promise<ProviderSessionBinding[]>;
  updateStatus(
    id: string,
    status: ProviderSessionBinding['status'],
    patch?: Partial<Pick<ProviderSessionBinding, 'metadata' | 'archivedAt'>>
  ): Promise<ProviderSessionBinding>;
}

export interface ProviderTranscriptRepository {
  append(input: Omit<ProviderTranscriptEntry, 'id' | 'ordinal' | 'createdAt'> & { id?: string }): Promise<ProviderTranscriptEntry>;
  listByRun(runId: string): Promise<ProviderTranscriptEntry[]>;
  listByProviderSession(input: {
    provider: string;
    providerSessionId: string;
    providerProjectKey?: string | null;
  }): Promise<ProviderTranscriptEntry[]>;
  nextOrdinal(input: {
    provider: string;
    providerSessionId: string;
    providerProjectKey?: string | null;
  }): Promise<number>;
}

export interface RunApprovalRequestRepository {
  create(
    input: Omit<RunApprovalRequest, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'resolvedAt'> & {
      id?: string;
    }
  ): Promise<RunApprovalRequest>;
  findById(id: string): Promise<RunApprovalRequest | null>;
  findByProviderRequest(input: {
    runId: string;
    provider: string;
    permissionRequestId: string;
  }): Promise<RunApprovalRequest | null>;
  findPendingByProviderRequest(input: {
    runId: string;
    provider: string;
    permissionRequestId: string;
  }): Promise<RunApprovalRequest | null>;
  listByRun(runId: string): Promise<RunApprovalRequest[]>;
  resolve(
    id: string,
    status: Extract<RunApprovalRequest['status'], 'approved' | 'denied' | 'expired' | 'cancelled'>,
    patch?: Partial<Pick<RunApprovalRequest, 'decision' | 'decisionReason' | 'resolvedByActorId' | 'metadata' | 'resolvedAt'>>
  ): Promise<RunApprovalRequest>;
  resolvePending(
    id: string,
    status: Extract<RunApprovalRequest['status'], 'approved' | 'denied' | 'expired' | 'cancelled'>,
    patch?: Partial<Pick<RunApprovalRequest, 'decision' | 'decisionReason' | 'resolvedByActorId' | 'metadata' | 'resolvedAt'>>
  ): Promise<RunApprovalRequest | null>;
}

export interface MessageRepository {
  create(input: Omit<Message, 'createdAt'>): Promise<Message>;
  createWithNextSeq(input: Omit<Message, 'createdAt' | 'seq'>): Promise<Message>;
  updateStatus(id: string, status: Message['status']): Promise<Message>;
  createPart(input: Omit<MessagePart, 'createdAt'>): Promise<MessagePart>;
  listByIds(threadId: string, ids: string[]): Promise<Array<Message & { parts: MessagePart[] }>>;
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
