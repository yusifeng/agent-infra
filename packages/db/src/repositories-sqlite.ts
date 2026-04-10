import { asc, eq, inArray, max } from 'drizzle-orm';
import type {
  Artifact,
  ArtifactRepository,
  Message,
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
import { artifacts, messageParts, messages, runEvents, runs, threads, toolInvocations } from './schema-sqlite';

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
    return this.db.select().from(threads).where(eq(threads.appId, appId)).orderBy(asc(threads.createdAt));
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
    const msgRows = await this.db.select().from(messages).where(eq(messages.threadId, threadId)).orderBy(asc(messages.seq));
    if (msgRows.length === 0) return [];

    const messageIds = msgRows.map((message: Message) => message.id);
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

    return msgRows.map((m: Message) => ({
      ...m,
      parts: partsByMessageId.get(m.id) ?? []
    }));
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
