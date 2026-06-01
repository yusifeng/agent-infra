import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SqliteMessageRepository, SqliteThreadRepository } from '../src/repositories-sqlite';
import { SQLITE_SCHEMA_STATEMENTS } from '../src/schema-sqlite';

describe('SqliteMessageRepository pagination', () => {
  let sqlite: Database.Database | undefined;
  let messageRepo: SqliteMessageRepository;

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    for (const statement of SQLITE_SCHEMA_STATEMENTS) {
      sqlite.exec(statement);
    }

    const db = drizzle(sqlite);
    const threadRepo = new SqliteThreadRepository(db);
    messageRepo = new SqliteMessageRepository(db);

    await threadRepo.create({
      id: 'thread-1',
      appId: 'test',
      userId: null,
      title: 'Test Thread',
      status: 'active',
      metadata: null,
      archivedAt: null
    });

    for (const seq of [1, 2, 3, 4, 5]) {
      const message = await messageRepo.create({
        id: `message-${seq}`,
        threadId: 'thread-1',
        runId: null,
        role: 'assistant',
        seq,
        status: 'completed',
        metadata: null
      });

      await messageRepo.createPart({
        id: `part-${seq}`,
        messageId: message.id,
        partIndex: 0,
        type: 'text',
        textValue: `message ${seq}`,
        jsonValue: null
      });
    }
  });

  afterEach(() => {
    sqlite?.close();
    sqlite = undefined;
  });

  it('returns the latest page in ascending order and supports loading older pages', async () => {
    const latestPage = await messageRepo.listPageByThread('thread-1', { limit: 2 });

    expect(latestPage.messages.map((message) => message.seq)).toEqual([4, 5]);
    expect(latestPage.pageInfo).toEqual({
      hasOlder: true,
      hasNewer: false,
      startSeq: 4,
      endSeq: 5
    });

    const olderPage = await messageRepo.listPageByThread('thread-1', {
      beforeSeq: latestPage.pageInfo.startSeq ?? undefined,
      limit: 2
    });

    expect(olderPage.messages.map((message) => message.seq)).toEqual([2, 3]);
    expect(olderPage.pageInfo).toEqual({
      hasOlder: true,
      hasNewer: true,
      startSeq: 2,
      endSeq: 3
    });
  });

  it('allocates message seq during create and retries unique collisions', async () => {
    class CollidingMessageRepository extends SqliteMessageRepository {
      private collisionsRemaining = 2;

      override async nextSeq(threadId: string): Promise<number> {
        if (this.collisionsRemaining > 0) {
          this.collisionsRemaining -= 1;
          return 5;
        }

        return super.nextSeq(threadId);
      }
    }

    const db = drizzle(sqlite!);
    const collidingRepo = new CollidingMessageRepository(db);

    const created = await collidingRepo.createWithNextSeq({
      id: 'message-6',
      threadId: 'thread-1',
      runId: null,
      role: 'assistant',
      status: 'completed',
      metadata: null
    });

    expect(created.seq).toBe(6);
    expect((await messageRepo.listByThread('thread-1')).map((message) => message.seq)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('retries wrapped libsql message seq collisions', async () => {
    class WrappedCollisionMessageRepository extends SqliteMessageRepository {
      private collisionsRemaining = 1;

      override async nextSeq(threadId: string): Promise<number> {
        if (this.collisionsRemaining > 0) {
          return 5;
        }

        return super.nextSeq(threadId);
      }

      override async create(input: Parameters<SqliteMessageRepository['create']>[0]) {
        if (this.collisionsRemaining > 0) {
          this.collisionsRemaining -= 1;
          throw new Error('Failed query: insert into "messages"', {
            cause: new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: messages.thread_id, messages.seq')
          });
        }

        return super.create(input);
      }
    }

    const db = drizzle(sqlite!);
    const collidingRepo = new WrappedCollisionMessageRepository(db);

    const created = await collidingRepo.createWithNextSeq({
      id: 'message-wrapped-collision',
      threadId: 'thread-1',
      runId: null,
      role: 'assistant',
      status: 'completed',
      metadata: null
    });

    expect(created.seq).toBe(6);
    expect((await messageRepo.listByThread('thread-1')).map((message) => message.seq)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('allocates unique seq values for simultaneous assistant and tool message creation', async () => {
    const [assistantMessage, toolMessage] = await Promise.all([
      messageRepo.createWithNextSeq({
        id: 'message-assistant',
        threadId: 'thread-1',
        runId: null,
        role: 'assistant',
        status: 'completed',
        metadata: null
      }),
      messageRepo.createWithNextSeq({
        id: 'message-tool',
        threadId: 'thread-1',
        runId: null,
        role: 'tool',
        status: 'completed',
        metadata: null
      })
    ]);

    expect(new Set([assistantMessage.seq, toolMessage.seq]).size).toBe(2);
    expect((await messageRepo.listByThread('thread-1')).map((message) => message.seq)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('does not retry unrelated unique constraint failures', async () => {
    await expect(
      messageRepo.createWithNextSeq({
        id: 'message-1',
        threadId: 'thread-1',
        runId: null,
        role: 'assistant',
        status: 'completed',
        metadata: null
      })
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });
});
