import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAgentInfraRepositories,
  createAgentInfraTransaction,
  createDbConfigFromEnv
} from '../src/client';
import {
  DrizzleDatasetExampleRepository,
  DrizzleDatasetRepository,
  DrizzleMessageRepository,
  DrizzleRunEventRepository,
  DrizzleRunRepository,
  DrizzleThreadRepository,
  DrizzleToolInvocationRepository
} from '../src/repositories';
import {
  SqliteDatasetExampleRepository,
  SqliteDatasetRepository,
  SqliteMessageRepository,
  SqliteRunEventRepository,
  SqliteRunRepository,
  SqliteThreadRepository,
  SqliteToolInvocationRepository
} from '../src/repositories-sqlite';

describe('db bootstrap primitives', () => {
  it('creates sqlite-backed repositories for sqlite and turso modes', () => {
    const sqliteRepos = createAgentInfraRepositories('sqlite', {});
    expect(sqliteRepos.threadRepo).toBeInstanceOf(SqliteThreadRepository);
    expect(sqliteRepos.runRepo).toBeInstanceOf(SqliteRunRepository);
    expect(sqliteRepos.messageRepo).toBeInstanceOf(SqliteMessageRepository);
    expect(sqliteRepos.toolRepo).toBeInstanceOf(SqliteToolInvocationRepository);
    expect(sqliteRepos.runEventRepo).toBeInstanceOf(SqliteRunEventRepository);
    expect(sqliteRepos.datasetRepo).toBeInstanceOf(SqliteDatasetRepository);
    expect(sqliteRepos.datasetExampleRepo).toBeInstanceOf(SqliteDatasetExampleRepository);

    const tursoRepos = createAgentInfraRepositories('turso', {});
    expect(tursoRepos.threadRepo).toBeInstanceOf(SqliteThreadRepository);
    expect(tursoRepos.runRepo).toBeInstanceOf(SqliteRunRepository);
    expect(tursoRepos.messageRepo).toBeInstanceOf(SqliteMessageRepository);
    expect(tursoRepos.toolRepo).toBeInstanceOf(SqliteToolInvocationRepository);
    expect(tursoRepos.runEventRepo).toBeInstanceOf(SqliteRunEventRepository);
    expect(tursoRepos.datasetRepo).toBeInstanceOf(SqliteDatasetRepository);
    expect(tursoRepos.datasetExampleRepo).toBeInstanceOf(SqliteDatasetExampleRepository);
  });

  it('creates drizzle-backed repositories for postgres mode', () => {
    const repos = createAgentInfraRepositories('postgres', {});
    expect(repos.threadRepo).toBeInstanceOf(DrizzleThreadRepository);
    expect(repos.runRepo).toBeInstanceOf(DrizzleRunRepository);
    expect(repos.messageRepo).toBeInstanceOf(DrizzleMessageRepository);
    expect(repos.toolRepo).toBeInstanceOf(DrizzleToolInvocationRepository);
    expect(repos.runEventRepo).toBeInstanceOf(DrizzleRunEventRepository);
    expect(repos.datasetRepo).toBeInstanceOf(DrizzleDatasetRepository);
    expect(repos.datasetExampleRepo).toBeInstanceOf(DrizzleDatasetExampleRepository);
  });

  describe('createAgentInfraTransaction', () => {
    const originalSqlitePath = process.env.SQLITE_PATH;
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalTursoDatabaseUrl = process.env.TURSO_DATABASE_URL;
    const originalTursoAuthToken = process.env.TURSO_AUTH_TOKEN;

    let tempDir = '';
    let sqlitePath = '';

    beforeEach(async () => {
      tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-infra-db-'));
      sqlitePath = path.join(tempDir, 'bootstrap-primitive.db');
      process.env.SQLITE_PATH = sqlitePath;
      delete process.env.DATABASE_URL;
      delete process.env.TURSO_DATABASE_URL;
      delete process.env.TURSO_AUTH_TOKEN;
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

      if (originalTursoDatabaseUrl) {
        process.env.TURSO_DATABASE_URL = originalTursoDatabaseUrl;
      } else {
        delete process.env.TURSO_DATABASE_URL;
      }

      if (originalTursoAuthToken) {
        process.env.TURSO_AUTH_TOKEN = originalTursoAuthToken;
      } else {
        delete process.env.TURSO_AUTH_TOKEN;
      }

      await rm(tempDir, { recursive: true, force: true });
    });

    it('wraps sqlite transactions with repository instances', async () => {
      const dbConfig = createDbConfigFromEnv();
      await dbConfig.bootstrapSchema();
      const sharedRepos = createAgentInfraRepositories(dbConfig.mode, dbConfig.db);
      const transaction = createAgentInfraTransaction(dbConfig);

      await transaction(async (repos) => {
        expect(repos.threadRepo).toBeInstanceOf(SqliteThreadRepository);

        await repos.threadRepo.create({
          id: 'thread-1',
          appId: 'bootstrap-test',
          userId: null,
          title: 'Transactional thread',
          status: 'active',
          metadata: null,
          archivedAt: null
        });

        await expect(repos.threadRepo.listByApp('bootstrap-test')).resolves.toHaveLength(1);
        await expect(sharedRepos.threadRepo.listByApp('bootstrap-test')).resolves.toHaveLength(0);
      });

      await expect(sharedRepos.threadRepo.listByApp('bootstrap-test')).resolves.toHaveLength(1);
    });

    it('delegates non-sqlite transactions and maps the transaction db into repositories', async () => {
      const tx = { kind: 'postgres-tx' };
      const transactionSpy = vi.fn(async (callback: (db: unknown) => Promise<string>) => callback(tx));
      const dbConfig = {
        mode: 'postgres' as const,
        db: { transaction: transactionSpy },
        connectionString: 'postgres://example.test/agent-infra',
        bootstrapSchema: async () => {}
      };

      const transaction = createAgentInfraTransaction(dbConfig);
      const result = await transaction(async (repos) => {
        expect(repos.threadRepo).toBeInstanceOf(DrizzleThreadRepository);
        return 'ok';
      });

      expect(result).toBe('ok');
      expect(transactionSpy).toHaveBeenCalledTimes(1);
    });
  });
});
