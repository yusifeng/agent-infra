import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createDbConfigFromEnv, withDbTransaction } from '../src/client';
import { SqliteThreadRepository } from '../src/repositories-sqlite';

describe('withDbTransaction sqlite isolation', () => {
  const originalSqlitePath = process.env.SQLITE_PATH;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  let tempDir = '';
  let sqlitePath = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-infra-db-'));
    sqlitePath = path.join(tempDir, 'transaction-test.db');
    process.env.SQLITE_PATH = sqlitePath;
    delete process.env.DATABASE_URL;
  });

  afterEach(async () => {
    if (originalSqlitePath) {
      process.env.SQLITE_PATH = originalSqlitePath;
    } else {
      delete process.env.SQLITE_PATH;
    }

    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }

    await rm(tempDir, { recursive: true, force: true });
  });

  it('keeps uncommitted sqlite writes invisible to the shared connection', async () => {
    const dbConfig = createDbConfigFromEnv();
    await dbConfig.initialize();

    const sharedThreadRepo = new SqliteThreadRepository(dbConfig.db);

    await withDbTransaction(dbConfig, async (tx) => {
      const transactionalThreadRepo = new SqliteThreadRepository(tx);

      await transactionalThreadRepo.create({
        id: 'thread-1',
        appId: 'transaction-test',
        userId: null,
        title: 'Hidden until commit',
        status: 'active',
        metadata: null,
        archivedAt: null
      });

      await expect(transactionalThreadRepo.listByApp('transaction-test')).resolves.toHaveLength(1);
      await expect(sharedThreadRepo.listByApp('transaction-test')).resolves.toHaveLength(0);
    });

    await expect(sharedThreadRepo.listByApp('transaction-test')).resolves.toHaveLength(1);
  });

  it('rolls back sqlite writes when the transactional operation fails', async () => {
    const dbConfig = createDbConfigFromEnv();
    await dbConfig.initialize();

    const sharedThreadRepo = new SqliteThreadRepository(dbConfig.db);

    await expect(
      withDbTransaction(dbConfig, async (tx) => {
        const transactionalThreadRepo = new SqliteThreadRepository(tx);

        await transactionalThreadRepo.create({
          id: 'thread-rollback',
          appId: 'transaction-test',
          userId: null,
          title: 'Should rollback',
          status: 'active',
          metadata: null,
          archivedAt: null
        });

        throw new Error('rollback me');
      })
    ).rejects.toThrow('rollback me');

    await expect(sharedThreadRepo.listByApp('transaction-test')).resolves.toHaveLength(0);
  });
});
