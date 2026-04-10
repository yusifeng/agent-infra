import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SqliteRunEventRepository, SqliteRunRepository, SqliteThreadRepository } from '../src/repositories-sqlite';
import { SQLITE_SCHEMA_STATEMENTS } from '../src/schema-sqlite';

describe('SqliteRunEventRepository', () => {
  let sqlite: Database.Database;
  let runEventRepo: SqliteRunEventRepository;
  let runId: string;

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    for (const statement of SQLITE_SCHEMA_STATEMENTS) {
      sqlite.exec(statement);
    }

    const db = drizzle(sqlite);
    const threadRepo = new SqliteThreadRepository(db);
    const runRepo = new SqliteRunRepository(db);
    runEventRepo = new SqliteRunEventRepository(db);

    await threadRepo.create({
      id: 'thread-1',
      appId: 'test',
      userId: null,
      title: 'Test Thread',
      status: 'active',
      metadata: null,
      archivedAt: null
    });

    const run = await runRepo.create({
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

    runId = run.id;
  });

  afterEach(() => {
    sqlite.close();
  });

  it('returns 1 for nextSeq on an empty run', async () => {
    await expect(runEventRepo.nextSeq(runId)).resolves.toBe(1);
  });

  it('appends and lists run events in seq order', async () => {
    await runEventRepo.append({
      id: 'event-2',
      threadId: 'thread-1',
      runId,
      seq: 2,
      type: 'message_end',
      payload: { messageId: 'message-2' }
    });

    await runEventRepo.append({
      id: 'event-1',
      threadId: 'thread-1',
      runId,
      seq: 1,
      type: 'agent_start',
      payload: { source: 'test' }
    });

    const events = await runEventRepo.listByRun(runId);

    expect(events.map((event) => event.seq)).toEqual([1, 2]);
    expect(events.map((event) => event.type)).toEqual(['agent_start', 'message_end']);
    expect(events[0]?.payload).toEqual({ source: 'test' });
    await expect(runEventRepo.nextSeq(runId)).resolves.toBe(3);
  });
});
