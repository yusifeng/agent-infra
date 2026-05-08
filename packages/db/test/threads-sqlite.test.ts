import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SqliteThreadRepository } from '../src/repositories-sqlite';
import { SQLITE_SCHEMA_STATEMENTS } from '../src/schema-sqlite';

describe('SqliteThreadRepository lifecycle', () => {
  let sqlite: Database.Database | undefined;
  let threadRepo: SqliteThreadRepository;

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    for (const statement of SQLITE_SCHEMA_STATEMENTS) {
      sqlite.exec(statement);
    }

    const db = drizzle(sqlite);
    threadRepo = new SqliteThreadRepository(db);
  });

  afterEach(async () => {
    sqlite?.close();
  });

  it('renames threads, archives threads, and excludes archived threads from app listings', async () => {
    const thread = await threadRepo.create({
      id: 'thread-1',
      appId: 'playground-runtime-pi',
      userId: null,
      title: 'Original title',
      status: 'active',
      metadata: null,
      archivedAt: null
    });

    const renamed = await threadRepo.rename(thread.id, 'Renamed title', new Date('2026-05-09T10:00:00.000Z'));
    expect(renamed.title).toBe('Renamed title');

    const archived = await threadRepo.archive(thread.id, new Date('2026-05-09T10:05:00.000Z'));
    expect(archived.status).toBe('archived');
    expect(archived.archivedAt?.toISOString()).toBe('2026-05-09T10:05:00.000Z');

    expect(await threadRepo.findById(thread.id)).toMatchObject({
      id: thread.id,
      title: 'Renamed title',
      status: 'archived'
    });
    expect(await threadRepo.listByApp('playground-runtime-pi')).toEqual([]);
  });
});
