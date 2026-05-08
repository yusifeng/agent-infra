import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  SqliteChatShareRepository,
  SqliteChatShareSnapshotRepository,
  SqliteThreadRepository
} from '../src/repositories-sqlite';
import { SQLITE_SCHEMA_STATEMENTS } from '../src/schema-sqlite';

describe('SqliteChatShare repositories', () => {
  let sqlite: Database.Database | undefined;
  let shareRepo: SqliteChatShareRepository;
  let snapshotRepo: SqliteChatShareSnapshotRepository;

  beforeEach(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');

    for (const statement of SQLITE_SCHEMA_STATEMENTS) {
      sqlite.exec(statement);
    }

    const db = drizzle(sqlite);
    const threadRepo = new SqliteThreadRepository(db);
    shareRepo = new SqliteChatShareRepository(db);
    snapshotRepo = new SqliteChatShareSnapshotRepository(db);

    await threadRepo.create({
      id: 'thread-1',
      appId: 'test',
      userId: null,
      title: 'Shared thread',
      status: 'active',
      metadata: null,
      archivedAt: null
    });
  });

  afterEach(() => {
    sqlite?.close();
    sqlite = undefined;
  });

  it('creates and loads an immutable share snapshot', async () => {
    await shareRepo.create({
      id: 'share-1',
      publicId: 'public-1',
      sourceThreadId: 'thread-1',
      scopeType: 'thread',
      status: 'active',
      snapshotId: 'snapshot-1',
      revokedAt: null
    });

    const snapshot = await snapshotRepo.create({
      id: 'snapshot-1',
      shareId: 'share-1',
      payloadFormat: 'messages_v1',
      payloadVersion: 1,
      payloadJson: {
        title: 'Snapshot title',
        messages: []
      },
      messageCount: 0,
      startSeq: null,
      endSeq: null
    });

    expect(snapshot.id).toBe('snapshot-1');
    expect(snapshot.createdAt).toBeInstanceOf(Date);

    const loaded = await snapshotRepo.findById('snapshot-1');
    expect(loaded).toMatchObject({
      id: 'snapshot-1',
      shareId: 'share-1',
      payloadFormat: 'messages_v1',
      payloadVersion: 1,
      payloadJson: {
        title: 'Snapshot title',
        messages: []
      }
    });
  });

  it('creates shares with unique public ids and resolves them by thread/public id', async () => {
    await shareRepo.create({
      id: 'share-1',
      publicId: 'public-1',
      sourceThreadId: 'thread-1',
      scopeType: 'thread',
      status: 'active',
      snapshotId: 'snapshot-1',
      revokedAt: null
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    await shareRepo.create({
      id: 'share-2',
      publicId: 'public-2',
      sourceThreadId: 'thread-1',
      scopeType: 'thread',
      status: 'revoked',
      snapshotId: 'snapshot-2',
      revokedAt: new Date('2026-05-08T00:00:00.000Z')
    });

    expect((await shareRepo.findByPublicId('public-1'))?.id).toBe('share-1');
    expect((await shareRepo.findById('share-2'))?.publicId).toBe('public-2');
    expect((await shareRepo.findActiveByThread('thread-1'))?.id).toBe('share-1');
  });

  it('updates share status and rotates active share lookup away from revoked rows', async () => {
    const first = await shareRepo.create({
      id: 'share-1',
      publicId: 'public-1',
      sourceThreadId: 'thread-1',
      scopeType: 'thread',
      status: 'active',
      snapshotId: 'snapshot-1',
      revokedAt: null
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = await shareRepo.create({
      id: 'share-2',
      publicId: 'public-2',
      sourceThreadId: 'thread-1',
      scopeType: 'thread',
      status: 'active',
      snapshotId: 'snapshot-2',
      revokedAt: null
    });

    expect((await shareRepo.findActiveByThread('thread-1'))?.id).toBe(second.id);

    await shareRepo.updateStatus(second.id, 'revoked', {
      revokedAt: new Date('2026-05-08T01:00:00.000Z')
    });

    expect((await shareRepo.findById(second.id))?.status).toBe('revoked');
    expect((await shareRepo.findActiveByThread('thread-1'))?.id).toBe(first.id);
  });
});
