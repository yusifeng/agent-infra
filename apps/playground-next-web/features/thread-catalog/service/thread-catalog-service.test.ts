import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { ThreadNotFoundError } from '@agent-infra/app';
import { createAgentInfraRepositories, type DbConfig } from '@agent-infra/db';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_ID } from '../../../constants';
import { LOCAL_DEV_USER_ID } from '../identity/current-user';
import { PlaygroundThreadCatalogRepo } from '../repo/thread-catalog-repo';
import { bootstrapPlaygroundThreadCatalog } from '../repo/schema';
import { PlaygroundThreadCatalogService } from './thread-catalog-service';

type SqliteClient = {
  close(): void;
  exec(statement: string): unknown;
  pragma(statement: string): unknown;
};
type SqliteDatabaseConstructor = new (path: string) => SqliteClient;

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3') as SqliteDatabaseConstructor;

function createSqliteTestDbConfig(sqlitePath: string): DbConfig {
  const sqlite = new Database(sqlitePath);
  sqlite.pragma('foreign_keys = ON');

  return {
    mode: 'sqlite',
    db: drizzle(sqlite as never),
    connectionString: `file:${sqlitePath}`,
    sqlitePath,
    bootstrapSchema: async () => {
      sqlite.exec(`CREATE TABLE IF NOT EXISTS threads (
        id text PRIMARY KEY NOT NULL,
        app_id text NOT NULL,
        user_id text,
        title text,
        status text NOT NULL,
        metadata text,
        created_at integer NOT NULL,
        updated_at integer NOT NULL,
        archived_at integer
      )`);
    }
  };
}

describe('PlaygroundThreadCatalogService', () => {
  let dbConfig: DbConfig;
  let service: PlaygroundThreadCatalogService;
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'playground-thread-catalog-'));

    dbConfig = createSqliteTestDbConfig(path.join(tempDir, 'thread-catalog.db'));
    await dbConfig.bootstrapSchema();
    await bootstrapPlaygroundThreadCatalog(dbConfig);
    service = new PlaygroundThreadCatalogService(dbConfig);
  });

  afterEach(async () => {
    if (dbConfig.mode === 'sqlite') {
      dbConfig.db.$client.close();
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates durable threads with null userId and stores ownership in catalog', async () => {
    const { thread, catalogRow } = await service.createThreadWithCatalog({
      ownerUserId: 'user-1',
      title: '  Test thread  '
    });

    expect(thread).toMatchObject({
      appId: APP_ID,
      userId: null,
      title: 'Test thread'
    });
    expect(catalogRow).toMatchObject({
      threadId: thread.id,
      appId: APP_ID,
      ownerUserId: 'user-1'
    });
  });

  it('rejects non-owner access before loading the durable thread', async () => {
    const { thread } = await service.createThreadWithCatalog({
      ownerUserId: 'owner-1',
      title: 'Private thread'
    });
    const loadThread = vi.fn(async () => thread);

    await expect(service.loadAccessibleThread(thread.id, 'owner-2', loadThread)).rejects.toBeInstanceOf(ThreadNotFoundError);
    expect(loadThread).not.toHaveBeenCalled();
  });

  it('does not overwrite an existing runtime binding', async () => {
    const { thread } = await service.createThreadWithCatalog({
      ownerUserId: 'user-1',
      title: 'Runtime thread'
    });

    await expect(service.bindRuntimeIfUnset(thread.id, 'openai', 'gpt-4o-mini', new Date('2026-05-14T00:00:00.000Z'))).resolves.toMatchObject({
      runtimeProvider: 'openai',
      runtimeModel: 'gpt-4o-mini'
    });
    await expect(service.bindRuntimeIfUnset(thread.id, 'deepseek', 'deepseek-chat', new Date('2026-05-14T00:01:00.000Z'))).resolves.toMatchObject({
      runtimeProvider: 'openai',
      runtimeModel: 'gpt-4o-mini'
    });
  });

  it('backfills legacy playground threads to the local dev catalog owner', async () => {
    const repos = createAgentInfraRepositories(dbConfig.mode, dbConfig.db);
    const legacyThread = await repos.threadRepo.create({
      id: 'legacy-thread',
      appId: APP_ID,
      userId: null,
      title: 'Legacy thread',
      status: 'active',
      metadata: null,
      archivedAt: null
    });

    await bootstrapPlaygroundThreadCatalog(dbConfig);

    await expect(new PlaygroundThreadCatalogRepo(dbConfig).findByThreadId(legacyThread.id)).resolves.toMatchObject({
      threadId: legacyThread.id,
      appId: APP_ID,
      ownerUserId: LOCAL_DEV_USER_ID
    });
  });
});
