import { and, asc, desc, eq, gt, inArray, lt, max } from 'drizzle-orm';
import type {
  AnswerCandidate,
  AnswerCandidateRepository,
  AnswerSelection,
  AnswerSelectionRepository,
  Artifact,
  ArtifactRepository,
  ChatShare,
  ChatShareRepository,
  ChatShareSnapshot,
  ChatShareSnapshotRepository,
  Message,
  MessagePart,
  MessageRepository,
  Run,
  RunEvent,
  RunEventRepository,
  RunFeedback,
  RunFeedbackRepository,
  RunRepository,
  Thread,
  ThreadRepository,
  ToolInvocation,
  ToolInvocationRepository
} from '@agent-infra/core';
import {
  answerCandidates,
  answerSelections,
  artifacts,
  chatShareSnapshots,
  chatShares,
  messageParts,
  messages,
  runEvents,
  runFeedback,
  runs,
  threads,
  toolInvocations
} from './schema-sqlite.js';

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

export class SqliteRunRepository implements RunRepository {
  constructor(private readonly db: any) {}

  async create(input: Omit<Run, 'createdAt'>): Promise<Run> {
    const createdAt = new Date();
    await this.db.insert(runs).values({ ...input, usageJson: input.usage, createdAt });
    return { ...input, createdAt };
  }

  async findById(id: string): Promise<Run | null> {
    const [row] = await this.db.select().from(runs).where(eq(runs.id, id)).limit(1);
    if (!row) return null;
    return { ...row, usage: row.usageJson };
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

  async updateStatus(id: string, status: Run['status'], patch: Partial<Run> = {}): Promise<Run> {
    const updated = {
      status,
      error: patch.error,
      startedAt: patch.startedAt,
      finishedAt: patch.finishedAt,
      usageJson: patch.usage
    };
    await this.db.update(runs).set(updated).where(eq(runs.id, id));
    const row = await this.findById(id);
    if (!row) throw new Error(`run ${id} not found`);
    return row;
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
    const [candidate] = await this.db
      .select()
      .from(answerCandidates)
      .where(
        and(
          eq(answerCandidates.threadId, input.threadId),
          eq(answerCandidates.triggerMessageId, input.triggerMessageId),
          eq(answerCandidates.runId, input.runId)
        )
      )
      .limit(1);
    if (!candidate) {
      throw new Error(`run ${input.runId} is not a candidate for trigger message ${input.triggerMessageId}`);
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
