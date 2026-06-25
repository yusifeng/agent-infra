import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, lte, max, or } from 'drizzle-orm';
import type {
  AnswerCandidate,
  AnswerCandidateRepository,
  AnswerSelection,
  AnswerSelectionRepository,
  Artifact,
  ArtifactRepository,
  AgentProfile,
  AgentProfileRepository,
  ChatShare,
  ChatShareRepository,
  ChatShareSnapshot,
  ChatShareSnapshotRepository,
  Dataset,
  DatasetExample,
  DatasetExampleRepository,
  DatasetRepository,
  EvalExampleResult,
  EvalExampleResultRepository,
  EvalRun,
  EvalRunCompareTriage,
  EvalRunCompareTriageRepository,
  EvalRunRepository,
  Message,
  MessagePart,
  MessageRepository,
  CloudAgentWorker,
  CloudAgentWorkerRepository,
  Run,
  RunApprovalRequest,
  RunApprovalRequestRepository,
  RunEvent,
  RunEventRepository,
  RunFeedback,
  RunFeedbackRepository,
  RunRepository,
  Thread,
  ThreadRepository,
  ToolInvocation,
  ToolInvocationRepository,
  Workspace,
  WorkspaceChangeSet,
  WorkspaceChangeSetRepository,
  WorkspaceFileChange,
  WorkspaceFileChangeRepository,
  WorkspaceFileIndexEntry,
  WorkspaceFileIndexRepository,
  WorkspaceSecretRef,
  WorkspaceSecretRefRepository,
  WorkspaceRepository,
  ProviderSessionBinding,
  ProviderSessionBindingRepository,
  ProviderTranscriptEntry,
  ProviderTranscriptRepository
} from '@agent-infra/core';
import {
  answerCandidates,
  answerSelections,
  agentProfiles,
  artifacts,
  chatShareSnapshots,
  chatShares,
  cloudAgentWorkers,
  datasetExamples,
  datasets,
  evalExampleResults,
  evalRunCompareTriage,
  evalRuns,
  messageParts,
  messages,
  providerSessionBindings,
  providerTranscriptEntries,
  runApprovalRequests,
  runEvents,
  runFeedback,
  runs,
  threads,
  toolInvocations,
  workspaces,
  workspaceChangeSets,
  workspaceFileChanges,
  workspaceFileIndex,
  workspaceSecretRefs
} from './schema-sqlite.js';

function isMessageSeqUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: unknown }).code) : '';
  const constraint = 'constraint' in error ? String((error as { constraint?: unknown }).constraint) : '';
  if (code === '23505' && constraint === 'messages_thread_id_seq_unique') return true;
  const message = error instanceof Error ? error.message : '';
  if (
    message.includes('messages_thread_id_seq_unique') ||
    message.includes('UNIQUE constraint failed: messages.thread_id, messages.seq')
  ) {
    return true;
  }

  const cause = 'cause' in error ? (error as { cause?: unknown }).cause : null;
  return cause ? isMessageSeqUniqueConstraintError(cause) : false;
}

export class SqliteThreadRepository implements ThreadRepository {
  constructor(private readonly db: any) {}

  async create(input: Omit<Thread, 'createdAt' | 'updatedAt'>): Promise<Thread> {
    const now = new Date();
    await this.db.insert(threads).values({ ...input, createdAt: now, updatedAt: now });
    return { ...input, createdAt: now, updatedAt: now };
  }

  async findById(id: string): Promise<Thread | null> {
    const [row] = await this.db.select().from(threads).where(eq(threads.id, id)).limit(1);
    return row ?? null;
  }

  async listByApp(appId: string): Promise<Thread[]> {
    return this.db
      .select()
      .from(threads)
      .where(and(eq(threads.appId, appId), eq(threads.status, 'active')))
      .orderBy(asc(threads.createdAt));
  }

  async rename(id: string, title: string | null, updatedAt: Date): Promise<Thread> {
    await this.db.update(threads).set({ title, updatedAt }).where(eq(threads.id, id));
    const row = await this.findById(id);
    if (!row) throw new Error(`thread ${id} not found`);
    return row;
  }

  async archive(id: string, archivedAt: Date): Promise<Thread> {
    await this.db
      .update(threads)
      .set({ status: 'archived', archivedAt, updatedAt: archivedAt })
      .where(eq(threads.id, id));
    const row = await this.findById(id);
    if (!row) throw new Error(`thread ${id} not found`);
    return row;
  }

  async touch(id: string, updatedAt: Date): Promise<Thread> {
    await this.db.update(threads).set({ updatedAt }).where(eq(threads.id, id));
    const row = await this.findById(id);
    if (!row) throw new Error(`thread ${id} not found`);
    return row;
  }
}

export class SqliteWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly db: any) {}

  async create(input: Omit<Workspace, 'createdAt' | 'updatedAt'>): Promise<Workspace> {
    const now = new Date();
    if (input.defaultForUser) {
      await this.db
        .update(workspaces)
        .set({ defaultForUser: false, updatedAt: now })
        .where(and(eq(workspaces.appId, input.appId), eq(workspaces.userId, input.userId), eq(workspaces.defaultForUser, true)));
    }
    await this.db.insert(workspaces).values({ ...input, createdAt: now, updatedAt: now });
    return { ...input, createdAt: now, updatedAt: now };
  }

  async findById(id: string): Promise<Workspace | null> {
    const [row] = await this.db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
    return row ?? null;
  }

  async findDefaultByUser(input: { appId: string; userId: string }): Promise<Workspace | null> {
    const [row] = await this.db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.appId, input.appId),
          eq(workspaces.userId, input.userId),
          eq(workspaces.defaultForUser, true),
          eq(workspaces.status, 'active')
        )
      )
      .orderBy(desc(workspaces.updatedAt))
      .limit(1);
    return row ?? null;
  }

  async listByUser(input: { appId: string; userId: string }): Promise<Workspace[]> {
    return this.db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.appId, input.appId), eq(workspaces.userId, input.userId), eq(workspaces.status, 'active')))
      .orderBy(desc(workspaces.defaultForUser), asc(workspaces.createdAt));
  }

  async archive(id: string, archivedAt: Date): Promise<Workspace> {
    await this.db
      .update(workspaces)
      .set({ status: 'archived', archivedAt, updatedAt: archivedAt, defaultForUser: false })
      .where(eq(workspaces.id, id));
    const row = await this.findById(id);
    if (!row) throw new Error(`workspace ${id} not found`);
    return row;
  }

  async touch(id: string, updatedAt: Date): Promise<Workspace> {
    await this.db.update(workspaces).set({ updatedAt }).where(eq(workspaces.id, id));
    const row = await this.findById(id);
    if (!row) throw new Error(`workspace ${id} not found`);
    return row;
  }
}

export class SqliteAgentProfileRepository implements AgentProfileRepository {
  constructor(private readonly db: any) {}

  async create(input: Omit<AgentProfile, 'createdAt' | 'updatedAt'>): Promise<AgentProfile> {
    const now = new Date();
    if (input.defaultForWorkspace) {
      await this.db
        .update(agentProfiles)
        .set({ defaultForWorkspace: false, updatedAt: now })
        .where(and(eq(agentProfiles.workspaceId, input.workspaceId), eq(agentProfiles.defaultForWorkspace, true)));
    }
    await this.db.insert(agentProfiles).values({ ...input, createdAt: now, updatedAt: now });
    return { ...input, createdAt: now, updatedAt: now };
  }

  async findById(id: string): Promise<AgentProfile | null> {
    const [row] = await this.db.select().from(agentProfiles).where(eq(agentProfiles.id, id)).limit(1);
    return row ?? null;
  }

  async findDefaultByWorkspace(workspaceId: string): Promise<AgentProfile | null> {
    const [row] = await this.db
      .select()
      .from(agentProfiles)
      .where(
        and(
          eq(agentProfiles.workspaceId, workspaceId),
          eq(agentProfiles.defaultForWorkspace, true),
          eq(agentProfiles.status, 'active')
        )
      )
      .orderBy(desc(agentProfiles.updatedAt))
      .limit(1);
    return row ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<AgentProfile[]> {
    return this.db
      .select()
      .from(agentProfiles)
      .where(and(eq(agentProfiles.workspaceId, workspaceId), eq(agentProfiles.status, 'active')))
      .orderBy(desc(agentProfiles.defaultForWorkspace), asc(agentProfiles.createdAt));
  }

  async update(
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
  ): Promise<AgentProfile> {
    const existing = await this.findById(id);
    if (!existing) throw new Error(`agent profile ${id} not found`);
    if (patch.defaultForWorkspace) {
      await this.db
        .update(agentProfiles)
        .set({ defaultForWorkspace: false, updatedAt })
        .where(and(eq(agentProfiles.workspaceId, existing.workspaceId), eq(agentProfiles.defaultForWorkspace, true)));
    }
    await this.db.update(agentProfiles).set({ ...patch, updatedAt }).where(eq(agentProfiles.id, id));
    const row = await this.findById(id);
    if (!row) throw new Error(`agent profile ${id} not found`);
    return row;
  }

  async archive(id: string, archivedAt: Date): Promise<AgentProfile> {
    await this.db
      .update(agentProfiles)
      .set({ status: 'archived', archivedAt, updatedAt: archivedAt, defaultForWorkspace: false })
      .where(eq(agentProfiles.id, id));
    const row = await this.findById(id);
    if (!row) throw new Error(`agent profile ${id} not found`);
    return row;
  }
}

export class SqliteWorkspaceSecretRefRepository implements WorkspaceSecretRefRepository {
  constructor(private readonly db: any) {}

  async create(input: Omit<WorkspaceSecretRef, 'createdAt' | 'updatedAt'>): Promise<WorkspaceSecretRef> {
    const now = new Date();
    await this.db.insert(workspaceSecretRefs).values({ ...input, createdAt: now, updatedAt: now });
    return { ...input, createdAt: now, updatedAt: now };
  }

  async findById(id: string): Promise<WorkspaceSecretRef | null> {
    const [row] = await this.db.select().from(workspaceSecretRefs).where(eq(workspaceSecretRefs.id, id)).limit(1);
    return row ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<WorkspaceSecretRef[]> {
    return this.db
      .select()
      .from(workspaceSecretRefs)
      .where(and(eq(workspaceSecretRefs.workspaceId, workspaceId), eq(workspaceSecretRefs.status, 'active')))
      .orderBy(asc(workspaceSecretRefs.name), asc(workspaceSecretRefs.createdAt));
  }

  async archive(id: string, archivedAt: Date): Promise<WorkspaceSecretRef> {
    await this.db
      .update(workspaceSecretRefs)
      .set({ status: 'archived', archivedAt, updatedAt: archivedAt })
      .where(eq(workspaceSecretRefs.id, id));
    const row = await this.findById(id);
    if (!row) throw new Error(`workspace secret ref ${id} not found`);
    return row;
  }
}

export class SqliteWorkspaceFileIndexRepository implements WorkspaceFileIndexRepository {
  constructor(private readonly db: any) {}

  async upsert(
    input: Omit<WorkspaceFileIndexEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<WorkspaceFileIndexEntry> {
    const existing = await this.findByWorkspacePath(input.workspaceId, input.path);
    const now = new Date();
    if (existing) {
      await this.db
        .update(workspaceFileIndex)
        .set({
          kind: input.kind,
          sizeBytes: input.sizeBytes ?? null,
          mimeType: input.mimeType ?? null,
          contentHash: input.contentHash ?? null,
          previewCapability: input.previewCapability ?? null,
          metadata: input.metadata ?? null,
          deletedAt: input.deletedAt ?? null,
          updatedAt: now
        })
        .where(eq(workspaceFileIndex.id, existing.id));
      const row = await this.findByWorkspacePath(input.workspaceId, input.path);
      if (!row) throw new Error(`workspace file ${input.workspaceId}:${input.path} not found`);
      return row;
    }

    const created = {
      id: input.id ?? randomUUID(),
      workspaceId: input.workspaceId,
      path: input.path,
      kind: input.kind,
      sizeBytes: input.sizeBytes ?? null,
      mimeType: input.mimeType ?? null,
      contentHash: input.contentHash ?? null,
      previewCapability: input.previewCapability ?? null,
      metadata: input.metadata ?? null,
      deletedAt: input.deletedAt ?? null,
      createdAt: now,
      updatedAt: now
    };
    await this.db.insert(workspaceFileIndex).values(created);
    return created;
  }

  async listByWorkspace(workspaceId: string, options: { includeDeleted?: boolean } = {}): Promise<WorkspaceFileIndexEntry[]> {
    const predicates = [eq(workspaceFileIndex.workspaceId, workspaceId)];
    if (!options.includeDeleted) {
      predicates.push(isNull(workspaceFileIndex.deletedAt));
    }

    return this.db
      .select()
      .from(workspaceFileIndex)
      .where(and(...predicates))
      .orderBy(asc(workspaceFileIndex.path));
  }

  async markDeleted(input: { workspaceId: string; path: string; deletedAt: Date }): Promise<WorkspaceFileIndexEntry> {
    const existing = await this.findByWorkspacePath(input.workspaceId, input.path);
    if (!existing) {
      throw new Error(`workspace file ${input.workspaceId}:${input.path} not found`);
    }

    await this.db
      .update(workspaceFileIndex)
      .set({ deletedAt: input.deletedAt, updatedAt: input.deletedAt })
      .where(eq(workspaceFileIndex.id, existing.id));
    const row = await this.findByWorkspacePath(input.workspaceId, input.path);
    if (!row) throw new Error(`workspace file ${input.workspaceId}:${input.path} not found`);
    return row;
  }

  private async findByWorkspacePath(workspaceId: string, filePath: string): Promise<WorkspaceFileIndexEntry | null> {
    const [row] = await this.db
      .select()
      .from(workspaceFileIndex)
      .where(and(eq(workspaceFileIndex.workspaceId, workspaceId), eq(workspaceFileIndex.path, filePath)))
      .limit(1);
    return row ?? null;
  }
}

export class SqliteWorkspaceChangeSetRepository implements WorkspaceChangeSetRepository {
  constructor(private readonly db: any) {}

  async create(input: Omit<WorkspaceChangeSet, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<WorkspaceChangeSet> {
    const now = new Date();
    const created = {
      id: input.id ?? randomUUID(),
      workspaceId: input.workspaceId,
      threadId: input.threadId ?? null,
      runId: input.runId ?? null,
      status: input.status,
      baseSnapshotId: input.baseSnapshotId ?? null,
      nextSnapshotId: input.nextSnapshotId ?? null,
      metadata: input.metadata ?? null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: input.resolvedAt ?? null
    };
    await this.db.insert(workspaceChangeSets).values(created);
    return created;
  }

  async findById(id: string): Promise<WorkspaceChangeSet | null> {
    const [row] = await this.db.select().from(workspaceChangeSets).where(eq(workspaceChangeSets.id, id)).limit(1);
    return row ?? null;
  }

  async listByWorkspace(workspaceId: string, options: { includeResolved?: boolean } = {}): Promise<WorkspaceChangeSet[]> {
    const predicates = [eq(workspaceChangeSets.workspaceId, workspaceId)];
    if (!options.includeResolved) {
      predicates.push(eq(workspaceChangeSets.status, 'pending'));
    }

    return this.db
      .select()
      .from(workspaceChangeSets)
      .where(and(...predicates))
      .orderBy(desc(workspaceChangeSets.createdAt));
  }

  async listByRun(runId: string): Promise<WorkspaceChangeSet[]> {
    return this.db
      .select()
      .from(workspaceChangeSets)
      .where(eq(workspaceChangeSets.runId, runId))
      .orderBy(desc(workspaceChangeSets.createdAt));
  }

  async updateStatus(
    id: string,
    status: WorkspaceChangeSet['status'],
    patch: Partial<Pick<WorkspaceChangeSet, 'metadata' | 'nextSnapshotId' | 'resolvedAt'>> = {}
  ): Promise<WorkspaceChangeSet> {
    const updatedAt = new Date();
    await this.db
      .update(workspaceChangeSets)
      .set({
        status,
        metadata: patch.metadata,
        nextSnapshotId: patch.nextSnapshotId,
        resolvedAt: patch.resolvedAt ?? (status === 'pending' ? null : updatedAt),
        updatedAt
      })
      .where(eq(workspaceChangeSets.id, id));
    const row = await this.findById(id);
    if (!row) throw new Error(`workspace change set ${id} not found`);
    return row;
  }
}

export class SqliteWorkspaceFileChangeRepository implements WorkspaceFileChangeRepository {
  constructor(private readonly db: any) {}

  async create(input: Omit<WorkspaceFileChange, 'id' | 'createdAt'> & { id?: string }): Promise<WorkspaceFileChange> {
    const created = {
      id: input.id ?? randomUUID(),
      changeSetId: input.changeSetId,
      workspaceId: input.workspaceId,
      threadId: input.threadId ?? null,
      runId: input.runId ?? null,
      path: input.path,
      changeType: input.changeType,
      beforeContentHash: input.beforeContentHash ?? null,
      afterContentHash: input.afterContentHash ?? null,
      artifactId: input.artifactId ?? null,
      metadata: input.metadata ?? null,
      createdAt: new Date()
    };
    await this.db.insert(workspaceFileChanges).values(created);
    return created;
  }

  async createMany(inputs: Array<Omit<WorkspaceFileChange, 'id' | 'createdAt'> & { id?: string }>): Promise<WorkspaceFileChange[]> {
    const created: WorkspaceFileChange[] = [];
    for (const input of inputs) {
      created.push(await this.create(input));
    }
    return created;
  }

  async listByChangeSet(changeSetId: string): Promise<WorkspaceFileChange[]> {
    return this.db
      .select()
      .from(workspaceFileChanges)
      .where(eq(workspaceFileChanges.changeSetId, changeSetId))
      .orderBy(asc(workspaceFileChanges.path), asc(workspaceFileChanges.createdAt));
  }

  async listByRun(runId: string): Promise<WorkspaceFileChange[]> {
    return this.db
      .select()
      .from(workspaceFileChanges)
      .where(eq(workspaceFileChanges.runId, runId))
      .orderBy(asc(workspaceFileChanges.path), asc(workspaceFileChanges.createdAt));
  }
}

export class SqliteRunRepository implements RunRepository {
  constructor(private readonly db: any) {}

  async countByApp(appId: string): Promise<Partial<Record<Run['status'], number>>> {
    const rows = await this.db
      .select({
        count: count(),
        status: runs.status
      })
      .from(runs)
      .innerJoin(threads, eq(runs.threadId, threads.id))
      .where(eq(threads.appId, appId))
      .groupBy(runs.status);
    return Object.fromEntries(rows.map((row: any) => [row.status, Number(row.count)]));
  }

  async create(input: Omit<Run, 'createdAt'>): Promise<Run> {
    const createdAt = new Date();
    await this.db.insert(runs).values({ ...input, usageJson: input.usage, createdAt });
    const row = await this.findById(input.id);
    if (!row) throw new Error(`run ${input.id} not found`);
    return row;
  }

  async findById(id: string): Promise<Run | null> {
    const [row] = await this.db.select().from(runs).where(eq(runs.id, id)).limit(1);
    if (!row) return null;
    return { ...row, usage: row.usageJson };
  }

  async listByApp(appId: string, options: { limit?: number; statuses?: Run['status'][] } = {}): Promise<Run[]> {
    const clauses = [eq(threads.appId, appId)];
    if (options.statuses?.length) {
      clauses.push(inArray(runs.status, options.statuses));
    }
    let query = this.db
      .select({ run: runs })
      .from(runs)
      .innerJoin(threads, eq(runs.threadId, threads.id))
      .where(and(...clauses))
      .orderBy(desc(runs.createdAt));
    if (options.limit && options.limit > 0) {
      query = query.limit(options.limit);
    }

    const rows = await query;
    return rows.map((row: any) => ({ ...row.run, usage: row.run.usageJson }));
  }

  async findLatestActiveByThread(threadId: string): Promise<Run | null> {
    const [row] = await this.db
      .select()
      .from(runs)
      .where(and(eq(runs.threadId, threadId), inArray(runs.status, ['queued', 'running'])))
      .orderBy(desc(runs.createdAt))
      .limit(1);
    if (!row) return null;
    return { ...row, usage: row.usageJson };
  }

  async listActiveByThread(threadId: string): Promise<Run[]> {
    const rows = await this.db
      .select()
      .from(runs)
      .where(and(eq(runs.threadId, threadId), inArray(runs.status, ['queued', 'running'])))
      .orderBy(desc(runs.createdAt));
    return rows.map((row: any) => ({ ...row, usage: row.usageJson }));
  }

  async listByThread(threadId: string, options?: { limit?: number }): Promise<Run[]> {
    let query = this.db.select().from(runs).where(eq(runs.threadId, threadId)).orderBy(desc(runs.createdAt));
    if (options?.limit && options.limit > 0) {
      query = query.limit(options.limit);
    }

    const rows = await query;
    return rows.map((row: any) => ({ ...row, usage: row.usageJson }));
  }

  async claimById(input: { runId: string; workerId: string; leaseExpiresAt: Date; now: Date }): Promise<Run | null> {
    const existing = await this.findById(input.runId);
    if (!existing) {
      return null;
    }

    await this.db
      .update(runs)
      .set({
        status: 'running',
        error: null,
        startedAt: existing.startedAt ?? input.now,
        finishedAt: null,
        claimOwner: input.workerId,
        claimExpiresAt: input.leaseExpiresAt,
        attemptCount: (existing.attemptCount ?? 0) + 1
      })
      .where(
        and(
          eq(runs.id, input.runId),
          or(
            and(eq(runs.status, 'queued'), or(isNull(runs.nextAttemptAt), lte(runs.nextAttemptAt, input.now))),
            and(eq(runs.status, 'running'), lt(runs.claimExpiresAt, input.now))
          )
        )
      );

    const claimed = await this.findById(input.runId);
    return claimed?.claimOwner === input.workerId ? claimed : null;
  }

  async claimNextQueued(input: { appId: string; workerId: string; leaseExpiresAt: Date; now: Date }): Promise<Run | null> {
    const [candidate] = await this.db
      .select({ id: runs.id })
      .from(runs)
      .innerJoin(threads, eq(runs.threadId, threads.id))
      .where(
        and(
          eq(threads.appId, input.appId),
          eq(threads.status, 'active'),
          or(
            and(eq(runs.status, 'queued'), or(isNull(runs.nextAttemptAt), lte(runs.nextAttemptAt, input.now))),
            and(eq(runs.status, 'running'), lt(runs.claimExpiresAt, input.now))
          )
        )
      )
      .orderBy(asc(runs.createdAt))
      .limit(1);
    if (!candidate) {
      return null;
    }

    const existing = await this.findById(candidate.id);
    if (!existing) {
      return null;
    }

    await this.db
      .update(runs)
      .set({
        status: 'running',
        error: null,
        startedAt: existing.startedAt ?? input.now,
        finishedAt: null,
        claimOwner: input.workerId,
        claimExpiresAt: input.leaseExpiresAt,
        attemptCount: (existing.attemptCount ?? 0) + 1
      })
      .where(
        and(
          eq(runs.id, candidate.id),
          or(
            and(eq(runs.status, 'queued'), or(isNull(runs.nextAttemptAt), lte(runs.nextAttemptAt, input.now))),
            and(eq(runs.status, 'running'), lt(runs.claimExpiresAt, input.now))
          )
        )
      );

    const claimed = await this.findById(candidate.id);
    return claimed?.claimOwner === input.workerId ? claimed : null;
  }

  async extendClaim(input: { runId: string; workerId: string; leaseExpiresAt: Date; now: Date }): Promise<Run | null> {
    await this.db
      .update(runs)
      .set({
        claimExpiresAt: input.leaseExpiresAt
      })
      .where(
        and(
          eq(runs.id, input.runId),
          eq(runs.status, 'running'),
          eq(runs.claimOwner, input.workerId),
          gt(runs.claimExpiresAt, input.now)
        )
      );

    const run = await this.findById(input.runId);
    return run?.claimOwner === input.workerId &&
      run.status === 'running' &&
      run.claimExpiresAt &&
      run.claimExpiresAt.getTime() > input.now.getTime()
      ? run
      : null;
  }

  async updateStatus(id: string, status: Run['status'], patch: Partial<Run> = {}): Promise<Run> {
    const terminal = status === 'completed' || status === 'failed' || status === 'cancelled';
    const updated: Record<string, unknown> = { status };
    if ('error' in patch) updated.error = patch.error;
    if ('startedAt' in patch) updated.startedAt = patch.startedAt;
    if ('finishedAt' in patch) updated.finishedAt = patch.finishedAt;
    if ('usage' in patch) updated.usageJson = patch.usage;
    if ('nextAttemptAt' in patch) updated.nextAttemptAt = patch.nextAttemptAt;
    if (terminal) {
      updated.claimOwner = null;
      updated.claimExpiresAt = null;
    } else {
      if ('claimOwner' in patch) updated.claimOwner = patch.claimOwner;
      if ('claimExpiresAt' in patch) updated.claimExpiresAt = patch.claimExpiresAt;
    }
    if ('attemptCount' in patch) updated.attemptCount = patch.attemptCount;
    await this.db.update(runs).set(updated).where(eq(runs.id, id));
    const row = await this.findById(id);
    if (!row) throw new Error(`run ${id} not found`);
    return row;
  }
}

export class SqliteCloudAgentWorkerRepository implements CloudAgentWorkerRepository {
  constructor(private readonly db: any) {}

  async heartbeat(
    input: Omit<CloudAgentWorker, 'createdAt' | 'updatedAt'> & {
      heartbeatAt: Date;
    }
  ): Promise<CloudAgentWorker> {
    const existing = await this.findById(input.id);
    const now = input.heartbeatAt;
    const metadata = mergeCloudAgentWorkerMetadata(existing?.metadata, input.metadata);
    const status = shouldDrainCloudAgentWorker(metadata) && input.status !== 'stopped' ? 'draining' : input.status;
    const values = {
      id: input.id,
      appId: input.appId,
      queueProvider: input.queueProvider,
      status,
      concurrency: input.concurrency,
      activeRunIds: input.activeRunIds ?? null,
      metadata,
      startedAt: existing?.startedAt ?? input.startedAt,
      lastHeartbeatAt: now,
      stoppedAt: input.stoppedAt ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    await this.db
      .insert(cloudAgentWorkers)
      .values(values)
      .onConflictDoUpdate({
        target: cloudAgentWorkers.id,
        set: {
          appId: values.appId,
          queueProvider: values.queueProvider,
          status: values.status,
          concurrency: values.concurrency,
          activeRunIds: values.activeRunIds,
          metadata: values.metadata,
          startedAt: values.startedAt,
          lastHeartbeatAt: values.lastHeartbeatAt,
          stoppedAt: values.stoppedAt,
          updatedAt: values.updatedAt
        }
      });

    const row = await this.findById(input.id);
    if (!row) throw new Error(`cloud agent worker ${input.id} not found`);
    return row;
  }

  async listByApp(appId: string, options: { since?: Date; limit?: number } = {}): Promise<CloudAgentWorker[]> {
    const clauses = [eq(cloudAgentWorkers.appId, appId)];
    if (options.since) {
      clauses.push(gt(cloudAgentWorkers.lastHeartbeatAt, options.since));
    }

    let query = this.db
      .select()
      .from(cloudAgentWorkers)
      .where(and(...clauses))
      .orderBy(desc(cloudAgentWorkers.lastHeartbeatAt));
    if (options.limit && options.limit > 0) {
      query = query.limit(options.limit);
    }

    const rows = await query;
    return rows.map(toCloudAgentWorker);
  }

  async markStopped(input: { actorId?: string | null; id: string; reason?: string | null; stoppedAt: Date }): Promise<CloudAgentWorker | null> {
    const existing = await this.findById(input.id);
    await this.db
      .update(cloudAgentWorkers)
      .set({
        metadata: mergeStoppedWorkerMetadata(existing?.metadata, input),
        status: 'stopped',
        stoppedAt: input.stoppedAt,
        updatedAt: input.stoppedAt
      })
      .where(eq(cloudAgentWorkers.id, input.id));
    return this.findById(input.id);
  }

  async markStoppedIfStale(input: {
    actorId?: string | null;
    id: string;
    reason?: string | null;
    staleBefore: Date;
    stoppedAt: Date;
  }): Promise<CloudAgentWorker | null> {
    const existing = await this.findById(input.id);
    await this.db
      .update(cloudAgentWorkers)
      .set({
        metadata: mergeStoppedWorkerMetadata(existing?.metadata, input),
        status: 'stopped',
        stoppedAt: input.stoppedAt,
        updatedAt: input.stoppedAt
      })
      .where(and(eq(cloudAgentWorkers.id, input.id), lt(cloudAgentWorkers.lastHeartbeatAt, input.staleBefore)));
    const worker = await this.findById(input.id);
    return worker?.status === 'stopped' && worker.lastHeartbeatAt.getTime() < input.staleBefore.getTime() ? worker : null;
  }

  async clearDrain(input: {
    actorId: string;
    id: string;
    reason?: string | null;
    requestedAt: Date;
  }): Promise<CloudAgentWorker | null> {
    const existing = await this.findById(input.id);
    if (!existing) {
      return null;
    }

    await this.db
      .update(cloudAgentWorkers)
      .set({
        metadata: mergeCloudAgentWorkerMetadata(existing.metadata, {
          control: {
            drainClearedAt: input.requestedAt.toISOString(),
            drainClearedByActorId: input.actorId,
            drainClearReason: input.reason ?? null,
            desiredStatus: 'active'
          }
        }),
        status: existing.status === 'stopped' ? 'stopped' : 'active',
        updatedAt: input.requestedAt
      })
      .where(eq(cloudAgentWorkers.id, input.id));
    return this.findById(input.id);
  }

  async requestDrain(input: {
    actorId: string;
    id: string;
    reason?: string | null;
    requestedAt: Date;
  }): Promise<CloudAgentWorker | null> {
    const existing = await this.findById(input.id);
    if (!existing) {
      return null;
    }

    await this.db
      .update(cloudAgentWorkers)
      .set({
        metadata: mergeCloudAgentWorkerMetadata(existing.metadata, {
          control: {
            drainRequestedAt: input.requestedAt.toISOString(),
            drainRequestedByActorId: input.actorId,
            drainReason: input.reason ?? null,
            desiredStatus: 'draining'
          }
        }),
        status: existing.status === 'stopped' ? 'stopped' : 'draining',
        updatedAt: input.requestedAt
      })
      .where(eq(cloudAgentWorkers.id, input.id));
    return this.findById(input.id);
  }

  async findById(id: string): Promise<CloudAgentWorker | null> {
    const [row] = await this.db.select().from(cloudAgentWorkers).where(eq(cloudAgentWorkers.id, id)).limit(1);
    return row ? toCloudAgentWorker(row) : null;
  }
}

export class SqliteAnswerCandidateRepository implements AnswerCandidateRepository {
  constructor(private readonly db: any) {}

  private async validateCandidateRun(input: Pick<AnswerCandidate, 'threadId' | 'triggerMessageId' | 'runId'>) {
    const [run] = await this.db.select().from(runs).where(eq(runs.id, input.runId)).limit(1);
    if (!run || run.threadId !== input.threadId || run.triggerMessageId !== input.triggerMessageId) {
      throw new Error(`run ${input.runId} is not a candidate for trigger message ${input.triggerMessageId}`);
    }

    const [message] = await this.db.select().from(messages).where(eq(messages.id, input.triggerMessageId)).limit(1);
    if (!message || message.threadId !== input.threadId) {
      throw new Error(`trigger message ${input.triggerMessageId} is not in thread ${input.threadId}`);
    }
  }

  async create(input: Omit<AnswerCandidate, 'createdAt'>): Promise<AnswerCandidate> {
    await this.validateCandidateRun(input);
    const createdAt = new Date();
    await this.db.insert(answerCandidates).values({ ...input, createdAt });
    return { ...input, createdAt };
  }

  async findByRunId(runId: string): Promise<AnswerCandidate | null> {
    const [row] = await this.db.select().from(answerCandidates).where(eq(answerCandidates.runId, runId)).limit(1);
    return row ?? null;
  }

  async listByRunIds(runIds: string[]): Promise<AnswerCandidate[]> {
    if (runIds.length === 0) return [];
    return this.db
      .select()
      .from(answerCandidates)
      .where(inArray(answerCandidates.runId, runIds))
      .orderBy(asc(answerCandidates.createdAt), asc(answerCandidates.ordinal));
  }

  async listByThread(threadId: string): Promise<AnswerCandidate[]> {
    return this.db
      .select()
      .from(answerCandidates)
      .where(eq(answerCandidates.threadId, threadId))
      .orderBy(asc(answerCandidates.createdAt), asc(answerCandidates.ordinal));
  }

  async listByTriggerMessage(threadId: string, triggerMessageId: string): Promise<AnswerCandidate[]> {
    return this.db
      .select()
      .from(answerCandidates)
      .where(and(eq(answerCandidates.threadId, threadId), eq(answerCandidates.triggerMessageId, triggerMessageId)))
      .orderBy(asc(answerCandidates.ordinal));
  }
}

export class SqliteAnswerSelectionRepository implements AnswerSelectionRepository {
  constructor(private readonly db: any) {}

  private async validateSelectedCandidate(input: Omit<AnswerSelection, 'createdAt' | 'updatedAt'>) {
    const [candidate] = await this.db
      .select()
      .from(answerCandidates)
      .where(
        and(
          eq(answerCandidates.threadId, input.threadId),
          eq(answerCandidates.triggerMessageId, input.triggerMessageId),
          eq(answerCandidates.runId, input.selectedRunId)
        )
      )
      .limit(1);
    if (!candidate) {
      throw new Error(`run ${input.selectedRunId} is not a candidate for trigger message ${input.triggerMessageId}`);
    }
  }

  async getByThreadAndTrigger(threadId: string, triggerMessageId: string): Promise<AnswerSelection | null> {
    const [row] = await this.db
      .select()
      .from(answerSelections)
      .where(and(eq(answerSelections.threadId, threadId), eq(answerSelections.triggerMessageId, triggerMessageId)))
      .limit(1);
    return row ?? null;
  }

  async listByThread(threadId: string): Promise<AnswerSelection[]> {
    return this.db.select().from(answerSelections).where(eq(answerSelections.threadId, threadId)).orderBy(asc(answerSelections.createdAt));
  }

  async upsert(input: Omit<AnswerSelection, 'createdAt' | 'updatedAt'>): Promise<AnswerSelection> {
    await this.validateSelectedCandidate(input);
    const existing = await this.getByThreadAndTrigger(input.threadId, input.triggerMessageId);
    const now = new Date();
    if (existing) {
      await this.db
        .update(answerSelections)
        .set({
          selectedRunId: input.selectedRunId,
          source: input.source,
          selectedByUserId: input.selectedByUserId ?? null,
          updatedAt: now
        })
        .where(and(eq(answerSelections.threadId, input.threadId), eq(answerSelections.triggerMessageId, input.triggerMessageId)));
      return {
        ...existing,
        selectedRunId: input.selectedRunId,
        source: input.source,
        selectedByUserId: input.selectedByUserId ?? null,
        updatedAt: now
      };
    }

    const created = { ...input, selectedByUserId: input.selectedByUserId ?? null, createdAt: now, updatedAt: now };
    await this.db.insert(answerSelections).values(created);
    return created;
  }
}

export class SqliteRunFeedbackRepository implements RunFeedbackRepository {
  constructor(private readonly db: any) {}

  private async validateFeedbackTarget(input: Pick<RunFeedback, 'threadId' | 'triggerMessageId' | 'runId'>) {
    const [run] = await this.db
      .select()
      .from(runs)
      .where(and(eq(runs.id, input.runId), eq(runs.threadId, input.threadId), eq(runs.triggerMessageId, input.triggerMessageId)))
      .limit(1);
    if (!run) {
      throw new Error(`run ${input.runId} is not a feedback target for trigger message ${input.triggerMessageId}`);
    }

    const [assistantMessage] = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.threadId, input.threadId), eq(messages.runId, input.runId), eq(messages.role, 'assistant')))
      .limit(1);
    if (!assistantMessage) {
      throw new Error(`run ${input.runId} has no assistant output`);
    }
  }

  async clear(input: { runId: string; feedbackActorId: string }): Promise<void> {
    await this.db
      .delete(runFeedback)
      .where(and(eq(runFeedback.runId, input.runId), eq(runFeedback.feedbackActorId, input.feedbackActorId)));
  }

  async listByRunIds(runIds: string[], feedbackActorId?: string): Promise<RunFeedback[]> {
    if (runIds.length === 0) return [];
    const predicates = [inArray(runFeedback.runId, runIds)];
    if (feedbackActorId) {
      predicates.push(eq(runFeedback.feedbackActorId, feedbackActorId));
    }
    return this.db
      .select()
      .from(runFeedback)
      .where(predicates.length === 1 ? predicates[0] : and(...predicates))
      .orderBy(asc(runFeedback.runId), asc(runFeedback.createdAt));
  }

  async set(input: Omit<RunFeedback, 'createdAt' | 'updatedAt'>): Promise<RunFeedback> {
    await this.validateFeedbackTarget(input);
    const [existing] = await this.db
      .select()
      .from(runFeedback)
      .where(and(eq(runFeedback.runId, input.runId), eq(runFeedback.feedbackActorId, input.feedbackActorId)))
      .limit(1);
    const now = new Date();
    if (existing) {
      await this.db
        .update(runFeedback)
        .set({
          threadId: input.threadId,
          triggerMessageId: input.triggerMessageId,
          value: input.value,
          updatedAt: now
        })
        .where(and(eq(runFeedback.runId, input.runId), eq(runFeedback.feedbackActorId, input.feedbackActorId)));
      return {
        ...existing,
        threadId: input.threadId,
        triggerMessageId: input.triggerMessageId,
        runId: input.runId,
        feedbackActorId: input.feedbackActorId,
        value: input.value,
        updatedAt: now
      };
    }

    const created = { ...input, createdAt: now, updatedAt: now };
    await this.db.insert(runFeedback).values(created);
    return created;
  }
}

export class SqliteDatasetRepository implements DatasetRepository {
  constructor(private readonly db: any) {}

  async create(input: Omit<Dataset, 'createdAt' | 'updatedAt'>): Promise<Dataset> {
    const now = new Date();
    await this.db.insert(datasets).values({ ...input, createdAt: now, updatedAt: now });
    return { ...input, createdAt: now, updatedAt: now };
  }

  async findById(id: string): Promise<Dataset | null> {
    const [row] = await this.db.select().from(datasets).where(eq(datasets.id, id)).limit(1);
    return row ?? null;
  }

  async listByApp(input: { appId: string; actorId?: string | null; includeAppVisible?: boolean }): Promise<Dataset[]> {
    const predicates = [eq(datasets.appId, input.appId)];
    if (typeof input.actorId === 'string') {
      const ownershipPredicate =
        input.includeAppVisible === false
          ? eq(datasets.createdByActorId, input.actorId)
          : or(eq(datasets.createdByActorId, input.actorId), eq(datasets.visibility, 'app'));
      if (ownershipPredicate) {
        predicates.push(ownershipPredicate);
      }
    } else if (input.actorId === null) {
      predicates.push(eq(datasets.visibility, 'app'));
    }

    return this.db
      .select()
      .from(datasets)
      .where(predicates.length === 1 ? predicates[0] : and(...predicates))
      .orderBy(asc(datasets.createdAt), asc(datasets.name));
  }

  async update(
    id: string,
    patch: Partial<Pick<Dataset, 'name' | 'description' | 'visibility' | 'metadata'>>,
    updatedAt: Date
  ): Promise<Dataset> {
    await this.db.update(datasets).set({ ...patch, updatedAt }).where(eq(datasets.id, id));
    const row = await this.findById(id);
    if (!row) throw new Error(`dataset ${id} not found`);
    return row;
  }
}

export class SqliteDatasetExampleRepository implements DatasetExampleRepository {
  constructor(private readonly db: any) {}

  async create(input: Omit<DatasetExample, 'createdAt' | 'updatedAt'>): Promise<DatasetExample> {
    const now = new Date();
    await this.db.insert(datasetExamples).values({ ...input, createdAt: now, updatedAt: now });
    return { ...input, createdAt: now, updatedAt: now };
  }

  async findById(id: string): Promise<DatasetExample | null> {
    const [row] = await this.db.select().from(datasetExamples).where(eq(datasetExamples.id, id)).limit(1);
    return row ?? null;
  }

  async listByDataset(datasetId: string): Promise<DatasetExample[]> {
    return this.db
      .select()
      .from(datasetExamples)
      .where(eq(datasetExamples.datasetId, datasetId))
      .orderBy(asc(datasetExamples.createdAt));
  }

  async updateExpectedOutput(
    id: string,
    patch: {
      expectedOutputJson?: Record<string, unknown> | null;
      metadataJson?: Record<string, unknown> | null;
    },
    updatedAt: Date
  ): Promise<DatasetExample> {
    const update: {
      expectedOutputJson?: Record<string, unknown> | null;
      metadataJson?: Record<string, unknown> | null;
      updatedAt: Date;
    } = { updatedAt };
    if (Object.hasOwn(patch, 'expectedOutputJson')) {
      update.expectedOutputJson = patch.expectedOutputJson;
    }
    if (Object.hasOwn(patch, 'metadataJson')) {
      update.metadataJson = patch.metadataJson;
    }

    await this.db.update(datasetExamples).set(update).where(eq(datasetExamples.id, id));
    const row = await this.findById(id);
    if (!row) throw new Error(`dataset example ${id} not found`);
    return row;
  }
}

export class SqliteEvalRunRepository implements EvalRunRepository {
  constructor(private readonly db: any) {}

  async create(input: Omit<EvalRun, 'createdAt' | 'updatedAt'>): Promise<EvalRun> {
    const now = new Date();
    await this.db.insert(evalRuns).values({ ...input, createdAt: now, updatedAt: now });
    return { ...input, createdAt: now, updatedAt: now };
  }

  async findById(id: string): Promise<EvalRun | null> {
    const [row] = await this.db.select().from(evalRuns).where(eq(evalRuns.id, id)).limit(1);
    return row ?? null;
  }

  async listByDataset(datasetId: string): Promise<EvalRun[]> {
    return this.db
      .select()
      .from(evalRuns)
      .where(eq(evalRuns.datasetId, datasetId))
      .orderBy(desc(evalRuns.createdAt), asc(evalRuns.id));
  }

  async update(
    id: string,
    patch: Partial<
      Pick<EvalRun, 'status' | 'name' | 'configJson' | 'summaryJson' | 'error' | 'startedAt' | 'finishedAt'>
    >,
    updatedAt: Date
  ): Promise<EvalRun> {
    await this.db.update(evalRuns).set({ ...patch, updatedAt }).where(eq(evalRuns.id, id));
    const row = await this.findById(id);
    if (!row) throw new Error(`eval run ${id} not found`);
    return row;
  }
}

export class SqliteEvalExampleResultRepository implements EvalExampleResultRepository {
  constructor(private readonly db: any) {}

  async create(input: Omit<EvalExampleResult, 'createdAt' | 'updatedAt'>): Promise<EvalExampleResult> {
    const now = new Date();
    await this.db.insert(evalExampleResults).values({ ...input, createdAt: now, updatedAt: now });
    return { ...input, createdAt: now, updatedAt: now };
  }

  async createMany(inputs: Array<Omit<EvalExampleResult, 'createdAt' | 'updatedAt'>>): Promise<EvalExampleResult[]> {
    if (inputs.length === 0) return [];
    const now = new Date();
    const rows = inputs.map((input) => ({ ...input, createdAt: now, updatedAt: now }));
    await this.db.insert(evalExampleResults).values(rows);
    return rows;
  }

  async findById(id: string): Promise<EvalExampleResult | null> {
    const [row] = await this.db.select().from(evalExampleResults).where(eq(evalExampleResults.id, id)).limit(1);
    return row ?? null;
  }

  async listByEvalRun(evalRunId: string): Promise<EvalExampleResult[]> {
    return this.db
      .select()
      .from(evalExampleResults)
      .where(eq(evalExampleResults.evalRunId, evalRunId))
      .orderBy(asc(evalExampleResults.exampleOrdinal), asc(evalExampleResults.createdAt));
  }

  async update(
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
  ): Promise<EvalExampleResult> {
    await this.db.update(evalExampleResults).set({ ...patch, updatedAt }).where(eq(evalExampleResults.id, id));
    const row = await this.findById(id);
    if (!row) throw new Error(`eval example result ${id} not found`);
    return row;
  }
}

export class SqliteEvalRunCompareTriageRepository implements EvalRunCompareTriageRepository {
  constructor(private readonly db: any) {}

  async findByPairAndExample(input: {
    baselineEvalRunId: string;
    candidateEvalRunId: string;
    datasetExampleId: string;
  }): Promise<EvalRunCompareTriage | null> {
    const [row] = await this.db
      .select()
      .from(evalRunCompareTriage)
      .where(
        and(
          eq(evalRunCompareTriage.baselineEvalRunId, input.baselineEvalRunId),
          eq(evalRunCompareTriage.candidateEvalRunId, input.candidateEvalRunId),
          eq(evalRunCompareTriage.datasetExampleId, input.datasetExampleId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  async listByPair(input: {
    baselineEvalRunId: string;
    candidateEvalRunId: string;
  }): Promise<EvalRunCompareTriage[]> {
    return this.db
      .select()
      .from(evalRunCompareTriage)
      .where(
        and(
          eq(evalRunCompareTriage.baselineEvalRunId, input.baselineEvalRunId),
          eq(evalRunCompareTriage.candidateEvalRunId, input.candidateEvalRunId)
        )
      )
      .orderBy(asc(evalRunCompareTriage.datasetExampleId), asc(evalRunCompareTriage.id));
  }

  async createOrUpdate(input: Omit<EvalRunCompareTriage, 'createdAt' | 'updatedAt'>): Promise<EvalRunCompareTriage> {
    const existing = await this.findByPairAndExample(input);
    const now = new Date();
    if (existing) {
      await this.db
        .update(evalRunCompareTriage)
        .set({
          ...input,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: now
        })
        .where(eq(evalRunCompareTriage.id, existing.id));
      const row = await this.findByPairAndExample(input);
      if (!row) throw new Error(`compare triage ${existing.id} not found after update`);
      return row;
    }

    const created = { ...input, createdAt: now, updatedAt: now };
    await this.db.insert(evalRunCompareTriage).values(created);
    return created;
  }

  async deleteByPairAndExample(input: {
    baselineEvalRunId: string;
    candidateEvalRunId: string;
    datasetExampleId: string;
  }): Promise<void> {
    await this.db
      .delete(evalRunCompareTriage)
      .where(
        and(
          eq(evalRunCompareTriage.baselineEvalRunId, input.baselineEvalRunId),
          eq(evalRunCompareTriage.candidateEvalRunId, input.candidateEvalRunId),
          eq(evalRunCompareTriage.datasetExampleId, input.datasetExampleId)
        )
      );
  }
}

export class SqliteRunEventRepository implements RunEventRepository {
  constructor(private readonly db: any) {}

  async append(input: Omit<RunEvent, 'createdAt'>): Promise<RunEvent> {
    const createdAt = new Date();
    await this.db.insert(runEvents).values({ ...input, payloadJson: input.payload, createdAt });
    return { ...input, createdAt };
  }

  async listByRun(runId: string): Promise<RunEvent[]> {
    const rows = await this.db.select().from(runEvents).where(eq(runEvents.runId, runId)).orderBy(asc(runEvents.seq));
    return rows.map((row: any) => ({ ...row, payload: row.payloadJson }));
  }

  async nextSeq(runId: string): Promise<number> {
    const result = await this.db.select({ maxSeq: max(runEvents.seq) }).from(runEvents).where(eq(runEvents.runId, runId));
    return (result[0]?.maxSeq ?? 0) + 1;
  }
}

export class SqliteRunApprovalRequestRepository implements RunApprovalRequestRepository {
  constructor(private readonly db: any) {}

  async create(
    input: Omit<RunApprovalRequest, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'resolvedAt'> & { id?: string }
  ): Promise<RunApprovalRequest> {
    const now = new Date();
    const created = {
      id: input.id ?? randomUUID(),
      workspaceId: input.workspaceId ?? null,
      threadId: input.threadId,
      runId: input.runId,
      provider: input.provider,
      permissionRequestId: input.permissionRequestId,
      action: input.action,
      status: 'pending' as const,
      detailsJson: input.details ?? null,
      decision: input.decision ?? null,
      decisionReason: input.decisionReason ?? null,
      resolvedByActorId: input.resolvedByActorId ?? null,
      metadataJson: input.metadata ?? null,
      expiresAt: input.expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null
    };
    await this.db.insert(runApprovalRequests).values(created);
    const row = await this.findById(created.id);
    if (!row) throw new Error(`run approval request ${created.id} not found`);
    return row;
  }

  async findById(id: string): Promise<RunApprovalRequest | null> {
    const [row] = await this.db.select().from(runApprovalRequests).where(eq(runApprovalRequests.id, id)).limit(1);
    return row ? toRunApprovalRequest(row) : null;
  }

  async findByProviderRequest(input: {
    runId: string;
    provider: string;
    permissionRequestId: string;
  }): Promise<RunApprovalRequest | null> {
    const [row] = await this.db
      .select()
      .from(runApprovalRequests)
      .where(
        and(
          eq(runApprovalRequests.runId, input.runId),
          eq(runApprovalRequests.provider, input.provider),
          eq(runApprovalRequests.permissionRequestId, input.permissionRequestId)
        )
      )
      .limit(1);
    return row ? toRunApprovalRequest(row) : null;
  }

  async findPendingByProviderRequest(input: {
    runId: string;
    provider: string;
    permissionRequestId: string;
  }): Promise<RunApprovalRequest | null> {
    const [row] = await this.db
      .select()
      .from(runApprovalRequests)
      .where(
        and(
          eq(runApprovalRequests.runId, input.runId),
          eq(runApprovalRequests.provider, input.provider),
          eq(runApprovalRequests.permissionRequestId, input.permissionRequestId),
          eq(runApprovalRequests.status, 'pending')
        )
      )
      .limit(1);
    return row ? toRunApprovalRequest(row) : null;
  }

  async listByRun(runId: string): Promise<RunApprovalRequest[]> {
    const rows = await this.db
      .select()
      .from(runApprovalRequests)
      .where(eq(runApprovalRequests.runId, runId))
      .orderBy(asc(runApprovalRequests.createdAt));
    return rows.map(toRunApprovalRequest);
  }

  async resolve(
    id: string,
    status: Extract<RunApprovalRequest['status'], 'approved' | 'denied' | 'expired' | 'cancelled'>,
    patch: Partial<Pick<RunApprovalRequest, 'decision' | 'decisionReason' | 'resolvedByActorId' | 'metadata' | 'resolvedAt'>> = {}
  ): Promise<RunApprovalRequest> {
    const resolvedAt = patch.resolvedAt ?? new Date();
    await this.db
      .update(runApprovalRequests)
      .set({
        status,
        decision: patch.decision ?? (status === 'approved' || status === 'denied' ? status : null),
        decisionReason: patch.decisionReason,
        resolvedByActorId: patch.resolvedByActorId,
        metadataJson: patch.metadata,
        updatedAt: resolvedAt,
        resolvedAt
      })
      .where(eq(runApprovalRequests.id, id));
    const row = await this.findById(id);
    if (!row) throw new Error(`run approval request ${id} not found`);
    return row;
  }

  async resolvePending(
    id: string,
    status: Extract<RunApprovalRequest['status'], 'approved' | 'denied' | 'expired' | 'cancelled'>,
    patch: Partial<Pick<RunApprovalRequest, 'decision' | 'decisionReason' | 'resolvedByActorId' | 'metadata' | 'resolvedAt'>> = {}
  ): Promise<RunApprovalRequest | null> {
    const resolvedAt = patch.resolvedAt ?? new Date();
    const [row] = await this.db
      .update(runApprovalRequests)
      .set({
        status,
        decision: patch.decision ?? (status === 'approved' || status === 'denied' ? status : null),
        decisionReason: patch.decisionReason,
        resolvedByActorId: patch.resolvedByActorId,
        metadataJson: patch.metadata,
        updatedAt: resolvedAt,
        resolvedAt
      })
      .where(and(eq(runApprovalRequests.id, id), eq(runApprovalRequests.status, 'pending')))
      .returning();
    return row ? toRunApprovalRequest(row) : null;
  }
}

function toRunApprovalRequest(row: any): RunApprovalRequest {
  return {
    ...row,
    details: row.detailsJson,
    metadata: row.metadataJson
  };
}

function mergeCloudAgentWorkerMetadata(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!existing && !incoming) {
    return null;
  }

  return {
    ...(existing ?? {}),
    ...(incoming ?? {}),
    control: isRecord(incoming?.control) ? incoming.control : existing?.control
  };
}

function mergeStoppedWorkerMetadata(
  existing: Record<string, unknown> | null | undefined,
  input: {
    actorId?: string | null;
    reason?: string | null;
    stoppedAt: Date;
  }
): Record<string, unknown> | null {
  return mergeCloudAgentWorkerMetadata(existing, {
    control: {
      desiredStatus: 'stopped',
      stoppedAt: input.stoppedAt.toISOString(),
      stoppedByActorId: input.actorId ?? null,
      stoppedReason: input.reason ?? null
    }
  });
}

function shouldDrainCloudAgentWorker(metadata: Record<string, unknown> | null | undefined): boolean {
  return isRecord(metadata?.control) && metadata.control.desiredStatus === 'draining';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toCloudAgentWorker(row: any): CloudAgentWorker {
  return {
    ...row,
    activeRunIds: row.activeRunIds ?? null,
    metadata: row.metadata ?? null
  };
}

function providerProjectKeyCondition(column: any, value?: string | null) {
  return value == null ? isNull(column) : eq(column, value);
}

export class SqliteProviderSessionBindingRepository implements ProviderSessionBindingRepository {
  constructor(private readonly db: any) {}

  async upsertActive(
    input: Omit<ProviderSessionBinding, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'archivedAt'> & { id?: string }
  ): Promise<ProviderSessionBinding> {
    const existing = await this.findActiveByThread({ threadId: input.threadId, provider: input.provider });
    const now = new Date();
    if (existing) {
      await this.db
        .update(providerSessionBindings)
        .set({
          workspaceId: input.workspaceId,
          runId: input.runId ?? null,
          providerSessionId: input.providerSessionId,
          providerProjectKey: input.providerProjectKey ?? null,
          metadata: input.metadata ?? null,
          updatedAt: now
        })
        .where(eq(providerSessionBindings.id, existing.id));
      const row = await this.findById(existing.id);
      if (!row) throw new Error(`provider session binding ${existing.id} not found`);
      return row;
    }

    const created = {
      id: input.id ?? randomUUID(),
      workspaceId: input.workspaceId,
      threadId: input.threadId,
      runId: input.runId ?? null,
      provider: input.provider,
      providerSessionId: input.providerSessionId,
      providerProjectKey: input.providerProjectKey ?? null,
      status: 'active' as const,
      metadata: input.metadata ?? null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null
    };
    await this.db.insert(providerSessionBindings).values(created);
    return created;
  }

  async findActiveByThread(input: { threadId: string; provider: string }): Promise<ProviderSessionBinding | null> {
    const [row] = await this.db
      .select()
      .from(providerSessionBindings)
      .where(and(eq(providerSessionBindings.threadId, input.threadId), eq(providerSessionBindings.provider, input.provider), eq(providerSessionBindings.status, 'active')))
      .orderBy(desc(providerSessionBindings.updatedAt))
      .limit(1);
    return row ?? null;
  }

  async listByThread(threadId: string): Promise<ProviderSessionBinding[]> {
    return this.db
      .select()
      .from(providerSessionBindings)
      .where(eq(providerSessionBindings.threadId, threadId))
      .orderBy(desc(providerSessionBindings.updatedAt));
  }

  async updateStatus(
    id: string,
    status: ProviderSessionBinding['status'],
    patch: Partial<Pick<ProviderSessionBinding, 'metadata' | 'archivedAt'>> = {}
  ): Promise<ProviderSessionBinding> {
    const updatedAt = new Date();
    await this.db
      .update(providerSessionBindings)
      .set({
        status,
        metadata: patch.metadata,
        archivedAt: patch.archivedAt,
        updatedAt
      })
      .where(eq(providerSessionBindings.id, id));
    const row = await this.findById(id);
    if (!row) throw new Error(`provider session binding ${id} not found`);
    return row;
  }

  private async findById(id: string): Promise<ProviderSessionBinding | null> {
    const [row] = await this.db.select().from(providerSessionBindings).where(eq(providerSessionBindings.id, id)).limit(1);
    return row ?? null;
  }
}

export class SqliteProviderTranscriptRepository implements ProviderTranscriptRepository {
  constructor(private readonly db: any) {}

  async append(input: Omit<ProviderTranscriptEntry, 'id' | 'ordinal' | 'createdAt'> & { id?: string }): Promise<ProviderTranscriptEntry> {
    const ordinal = await this.nextOrdinal({
      provider: input.provider,
      providerSessionId: input.providerSessionId,
      providerProjectKey: input.providerProjectKey
    });
    const createdAt = new Date();
    const created = {
      id: input.id ?? randomUUID(),
      workspaceId: input.workspaceId,
      threadId: input.threadId ?? null,
      runId: input.runId ?? null,
      provider: input.provider,
      providerSessionId: input.providerSessionId,
      providerProjectKey: input.providerProjectKey ?? null,
      providerEntryId: input.providerEntryId ?? null,
      ordinal,
      entryType: input.entryType,
      rawJson: input.rawJson,
      createdAt
    };
    await this.db.insert(providerTranscriptEntries).values(created);
    return created;
  }

  async listByProviderSession(input: {
    provider: string;
    providerSessionId: string;
    providerProjectKey?: string | null;
  }): Promise<ProviderTranscriptEntry[]> {
    return this.db
      .select()
      .from(providerTranscriptEntries)
      .where(
        and(
          eq(providerTranscriptEntries.provider, input.provider),
          eq(providerTranscriptEntries.providerSessionId, input.providerSessionId),
          providerProjectKeyCondition(providerTranscriptEntries.providerProjectKey, input.providerProjectKey)
        )
      )
      .orderBy(asc(providerTranscriptEntries.ordinal));
  }

  async listByRun(runId: string): Promise<ProviderTranscriptEntry[]> {
    return this.db
      .select()
      .from(providerTranscriptEntries)
      .where(eq(providerTranscriptEntries.runId, runId))
      .orderBy(asc(providerTranscriptEntries.createdAt), asc(providerTranscriptEntries.ordinal));
  }

  async nextOrdinal(input: {
    provider: string;
    providerSessionId: string;
    providerProjectKey?: string | null;
  }): Promise<number> {
    const result = await this.db
      .select({ maxOrdinal: max(providerTranscriptEntries.ordinal) })
      .from(providerTranscriptEntries)
      .where(
        and(
          eq(providerTranscriptEntries.provider, input.provider),
          eq(providerTranscriptEntries.providerSessionId, input.providerSessionId),
          providerProjectKeyCondition(providerTranscriptEntries.providerProjectKey, input.providerProjectKey)
        )
      );
    return (result[0]?.maxOrdinal ?? 0) + 1;
  }
}

export class SqliteMessageRepository implements MessageRepository {
  constructor(private readonly db: any) {}

  private async loadMessageParts(messageIds: string[]) {
    if (messageIds.length === 0) {
      return new Map<string, MessagePart[]>();
    }

    const partRows = await this.db
      .select()
      .from(messageParts)
      .where(inArray(messageParts.messageId, messageIds))
      .orderBy(asc(messageParts.partIndex));

    const partsByMessageId = new Map<string, MessagePart[]>();
    for (const part of partRows as MessagePart[]) {
      const existing = partsByMessageId.get(part.messageId) ?? [];
      existing.push(part);
      partsByMessageId.set(part.messageId, existing);
    }

    return partsByMessageId;
  }

  private async hasMessage(threadId: string, direction: 'older' | 'newer', seq: number) {
    const predicate = direction === 'older' ? lt(messages.seq, seq) : gt(messages.seq, seq);
    const [row] = await this.db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.threadId, threadId), predicate))
      .limit(1);

    return Boolean(row);
  }

  async create(input: Omit<Message, 'createdAt'>): Promise<Message> {
    const createdAt = new Date();
    await this.db.insert(messages).values({ ...input, createdAt });
    return { ...input, createdAt };
  }

  async createWithNextSeq(input: Omit<Message, 'createdAt' | 'seq'>): Promise<Message> {
    let collisions = 0;
    for (;;) {
      const seq = await this.nextSeq(input.threadId);
      try {
        return await this.create({ ...input, seq });
      } catch (error) {
        if (!isMessageSeqUniqueConstraintError(error)) {
          throw error;
        }
        collisions += 1;
        if (collisions % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
    }
  }

  async updateStatus(id: string, status: Message['status']): Promise<Message> {
    await this.db.update(messages).set({ status }).where(eq(messages.id, id));
    const [row] = await this.db.select().from(messages).where(eq(messages.id, id)).limit(1);
    if (!row) throw new Error(`message ${id} not found`);
    return row;
  }

  async createPart(input: Omit<MessagePart, 'createdAt'>): Promise<MessagePart> {
    const createdAt = new Date();
    await this.db.insert(messageParts).values({ ...input, createdAt, jsonValue: input.jsonValue });
    return { ...input, createdAt };
  }

  async listByIds(threadId: string, ids: string[]): Promise<Array<Message & { parts: MessagePart[] }>> {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return [];
    }

    const msgRows = (await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.threadId, threadId), inArray(messages.id, uniqueIds)))
      .orderBy(asc(messages.seq))) as Message[];
    const partsByMessageId = await this.loadMessageParts(msgRows.map((message) => message.id));

    return msgRows.map((message) => ({
      ...message,
      parts: partsByMessageId.get(message.id) ?? []
    }));
  }

  async listByThread(threadId: string): Promise<Array<Message & { parts: MessagePart[] }>> {
    const page = await this.listPageByThread(threadId);
    return page.messages;
  }

  async listPageByThread(threadId: string, options: { limit?: number; beforeSeq?: number; afterSeq?: number } = {}) {
    const predicates = [eq(messages.threadId, threadId)];
    if (typeof options.beforeSeq === 'number') {
      predicates.push(lt(messages.seq, options.beforeSeq));
    }
    if (typeof options.afterSeq === 'number') {
      predicates.push(gt(messages.seq, options.afterSeq));
    }

    const applyPredicate = predicates.length === 1 ? predicates[0] : and(...predicates);
    const readAscending = typeof options.afterSeq === 'number';

    let query = this.db
      .select()
      .from(messages)
      .where(applyPredicate)
      .orderBy(readAscending ? asc(messages.seq) : desc(messages.seq));

    if (options.limit && options.limit > 0) {
      query = query.limit(options.limit);
    }

    const rawRows = (await query) as Message[];
    const msgRows = readAscending ? rawRows : [...rawRows].reverse();
    const messageIds = msgRows.map((message) => message.id);
    const partsByMessageId = await this.loadMessageParts(messageIds);
    const hydratedMessages = msgRows.map((m: Message) => ({
      ...m,
      parts: partsByMessageId.get(m.id) ?? []
    }));

    const startSeq = hydratedMessages[0]?.seq ?? null;
    const endSeq = hydratedMessages.at(-1)?.seq ?? null;

    let hasOlder = false;
    let hasNewer = false;
    if (startSeq !== null && endSeq !== null) {
      [hasOlder, hasNewer] = await Promise.all([
        this.hasMessage(threadId, 'older', startSeq),
        this.hasMessage(threadId, 'newer', endSeq)
      ]);
    }

    return {
      messages: hydratedMessages,
      pageInfo: {
        hasOlder,
        hasNewer,
        startSeq,
        endSeq
      }
    };
  }

  async nextSeq(threadId: string): Promise<number> {
    const result = await this.db.select({ maxSeq: max(messages.seq) }).from(messages).where(eq(messages.threadId, threadId));
    return (result[0]?.maxSeq ?? 0) + 1;
  }
}

export class SqliteToolInvocationRepository implements ToolInvocationRepository {
  constructor(private readonly db: any) {}

  async create(input: Omit<ToolInvocation, 'createdAt'>): Promise<ToolInvocation> {
    const createdAt = new Date();
    await this.db.insert(toolInvocations).values({
      ...input,
      inputJson: input.input,
      outputJson: input.output,
      createdAt
    });
    return { ...input, createdAt };
  }

  async updateStatus(id: string, status: ToolInvocation['status'], patch: Partial<ToolInvocation> = {}): Promise<ToolInvocation> {
    await this.db
      .update(toolInvocations)
      .set({
        status,
        outputJson: patch.output,
        error: patch.error,
        finishedAt: patch.finishedAt,
        startedAt: patch.startedAt
      })
      .where(eq(toolInvocations.id, id));

    const [row] = await this.db.select().from(toolInvocations).where(eq(toolInvocations.id, id)).limit(1);
    if (!row) throw new Error(`tool invocation ${id} not found`);
    return { ...row, input: row.inputJson, output: row.outputJson };
  }

  async listByRun(runId: string): Promise<ToolInvocation[]> {
    const rows = await this.db.select().from(toolInvocations).where(eq(toolInvocations.runId, runId)).orderBy(asc(toolInvocations.createdAt));
    return rows.map((row: any) => ({ ...row, input: row.inputJson, output: row.outputJson }));
  }
}

export class SqliteArtifactRepository implements ArtifactRepository {
  constructor(private readonly db: any) {}

  async create(input: Omit<Artifact, 'createdAt'>): Promise<Artifact> {
    const createdAt = new Date();
    await this.db.insert(artifacts).values({ ...input, createdAt });
    return { ...input, createdAt };
  }

  async findByThread(threadId: string): Promise<Artifact[]> {
    return this.db.select().from(artifacts).where(eq(artifacts.threadId, threadId));
  }
}

export class SqliteChatShareRepository implements ChatShareRepository {
  constructor(private readonly db: any) {}

  async create(input: Omit<ChatShare, 'createdAt'>): Promise<ChatShare> {
    const createdAt = new Date();
    await this.db.insert(chatShares).values({ ...input, createdAt });
    return { ...input, createdAt };
  }

  async findById(id: string): Promise<ChatShare | null> {
    const [row] = await this.db.select().from(chatShares).where(eq(chatShares.id, id)).limit(1);
    return row ?? null;
  }

  async findByPublicId(publicId: string): Promise<ChatShare | null> {
    const [row] = await this.db.select().from(chatShares).where(eq(chatShares.publicId, publicId)).limit(1);
    return row ?? null;
  }

  async findActiveByThread(threadId: string): Promise<ChatShare | null> {
    const [row] = await this.db
      .select()
      .from(chatShares)
      .where(and(eq(chatShares.sourceThreadId, threadId), eq(chatShares.status, 'active')))
      .orderBy(desc(chatShares.createdAt))
      .limit(1);
    return row ?? null;
  }

  async updateStatus(id: string, status: ChatShare['status'], patch: Partial<ChatShare> = {}): Promise<ChatShare> {
    await this.db
      .update(chatShares)
      .set({
        status,
        revokedAt: patch.revokedAt,
        snapshotId: patch.snapshotId
      })
      .where(eq(chatShares.id, id));

    const row = await this.findById(id);
    if (!row) throw new Error(`chat share ${id} not found`);
    return row;
  }
}

export class SqliteChatShareSnapshotRepository implements ChatShareSnapshotRepository {
  constructor(private readonly db: any) {}

  async create(input: Omit<ChatShareSnapshot, 'createdAt'>): Promise<ChatShareSnapshot> {
    const createdAt = new Date();
    await this.db.insert(chatShareSnapshots).values({ ...input, createdAt, payloadJson: input.payloadJson });
    return { ...input, createdAt };
  }

  async findById(id: string): Promise<ChatShareSnapshot | null> {
    const [row] = await this.db.select().from(chatShareSnapshots).where(eq(chatShareSnapshots.id, id)).limit(1);
    return row ?? null;
  }
}
