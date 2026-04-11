import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SqliteRunRepository, SqliteThreadRepository } from '../src/repositories-sqlite';
import { SQLITE_SCHEMA_STATEMENTS } from '../src/schema-sqlite';

describe('SqliteRunRepository', () => {
  let sqlite: Database.Database | undefined;
  let runRepo: SqliteRunRepository;

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    for (const statement of SQLITE_SCHEMA_STATEMENTS) {
      sqlite.exec(statement);
    }

    const db = drizzle(sqlite);
    const threadRepo = new SqliteThreadRepository(db);
    runRepo = new SqliteRunRepository(db);

    await threadRepo.create({
      id: 'thread-1',
      appId: 'test',
      userId: null,
      title: 'Test Thread',
      status: 'active',
      metadata: null,
      archivedAt: null
    });
  });

  afterEach(() => {
    sqlite?.close();
    sqlite = undefined;
  });

  it('lists recent runs for a thread in descending createdAt order and respects limit', async () => {
    const first = await runRepo.create({
      id: 'run-1',
      threadId: 'thread-1',
      triggerMessageId: null,
      provider: 'openai',
      model: 'gpt-4o-mini',
      status: 'queued',
      usage: null,
      error: null,
      startedAt: null,
      finishedAt: null
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = await runRepo.create({
      id: 'run-2',
      threadId: 'thread-1',
      triggerMessageId: null,
      provider: 'deepseek',
      model: 'deepseek-chat',
      status: 'running',
      usage: null,
      error: null,
      startedAt: null,
      finishedAt: null
    });

    const allRuns = await runRepo.listByThread('thread-1');
    expect(allRuns.map((run) => run.id)).toEqual([second.id, first.id]);

    const limitedRuns = await runRepo.listByThread('thread-1', { limit: 1 });
    expect(limitedRuns.map((run) => run.id)).toEqual([second.id]);
  });
});
