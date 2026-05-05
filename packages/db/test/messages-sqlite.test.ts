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
});
