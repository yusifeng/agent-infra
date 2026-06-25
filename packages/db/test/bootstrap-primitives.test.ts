import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAgentInfraRepositories,
  createAgentInfraTransaction,
  createDbConfigFromEnv,
  createSqliteDbConfig
} from '../src/client';
import {
  DrizzleAgentProfileRepository,
  DrizzleDatasetExampleRepository,
  DrizzleDatasetRepository,
  DrizzleEvalExampleResultRepository,
  DrizzleEvalRunRepository,
  DrizzleMessageRepository,
  DrizzleCloudAgentWorkerRepository,
  DrizzleRunApprovalRequestRepository,
  DrizzleRunEventRepository,
  DrizzleRunRepository,
  DrizzleThreadRepository,
  DrizzleToolInvocationRepository,
  DrizzleWorkspaceChangeSetRepository,
  DrizzleWorkspaceFileChangeRepository,
  DrizzleWorkspaceFileIndexRepository,
  DrizzleWorkspaceSecretRefRepository,
  DrizzleWorkspaceRepository,
  DrizzleProviderSessionBindingRepository,
  DrizzleProviderTranscriptRepository
} from '../src/repositories';
import {
  SqliteAgentProfileRepository,
  SqliteDatasetExampleRepository,
  SqliteDatasetRepository,
  SqliteEvalExampleResultRepository,
  SqliteEvalRunRepository,
  SqliteMessageRepository,
  SqliteCloudAgentWorkerRepository,
  SqliteRunApprovalRequestRepository,
  SqliteRunEventRepository,
  SqliteRunRepository,
  SqliteThreadRepository,
  SqliteToolInvocationRepository,
  SqliteWorkspaceChangeSetRepository,
  SqliteWorkspaceFileChangeRepository,
  SqliteWorkspaceFileIndexRepository,
  SqliteWorkspaceSecretRefRepository,
  SqliteWorkspaceRepository,
  SqliteProviderSessionBindingRepository,
  SqliteProviderTranscriptRepository
} from '../src/repositories-sqlite';

describe('db bootstrap primitives', () => {
  it('creates sqlite-backed repositories for sqlite and turso modes', () => {
    const sqliteRepos = createAgentInfraRepositories('sqlite', {});
    expect(sqliteRepos.threadRepo).toBeInstanceOf(SqliteThreadRepository);
    expect(sqliteRepos.workspaceRepo).toBeInstanceOf(SqliteWorkspaceRepository);
    expect(sqliteRepos.agentProfileRepo).toBeInstanceOf(SqliteAgentProfileRepository);
    expect(sqliteRepos.workspaceSecretRefRepo).toBeInstanceOf(SqliteWorkspaceSecretRefRepository);
    expect(sqliteRepos.workspaceFileIndexRepo).toBeInstanceOf(SqliteWorkspaceFileIndexRepository);
    expect(sqliteRepos.workspaceChangeSetRepo).toBeInstanceOf(SqliteWorkspaceChangeSetRepository);
    expect(sqliteRepos.workspaceFileChangeRepo).toBeInstanceOf(SqliteWorkspaceFileChangeRepository);
    expect(sqliteRepos.runRepo).toBeInstanceOf(SqliteRunRepository);
    expect(sqliteRepos.cloudAgentWorkerRepo).toBeInstanceOf(SqliteCloudAgentWorkerRepository);
    expect(sqliteRepos.messageRepo).toBeInstanceOf(SqliteMessageRepository);
    expect(sqliteRepos.toolRepo).toBeInstanceOf(SqliteToolInvocationRepository);
    expect(sqliteRepos.runEventRepo).toBeInstanceOf(SqliteRunEventRepository);
    expect(sqliteRepos.runApprovalRequestRepo).toBeInstanceOf(SqliteRunApprovalRequestRepository);
    expect(sqliteRepos.providerSessionBindingRepo).toBeInstanceOf(SqliteProviderSessionBindingRepository);
    expect(sqliteRepos.providerTranscriptRepo).toBeInstanceOf(SqliteProviderTranscriptRepository);
    expect(sqliteRepos.datasetRepo).toBeInstanceOf(SqliteDatasetRepository);
    expect(sqliteRepos.datasetExampleRepo).toBeInstanceOf(SqliteDatasetExampleRepository);
    expect(sqliteRepos.evalRunRepo).toBeInstanceOf(SqliteEvalRunRepository);
    expect(sqliteRepos.evalExampleResultRepo).toBeInstanceOf(SqliteEvalExampleResultRepository);

    const tursoRepos = createAgentInfraRepositories('turso', {});
    expect(tursoRepos.threadRepo).toBeInstanceOf(SqliteThreadRepository);
    expect(tursoRepos.workspaceRepo).toBeInstanceOf(SqliteWorkspaceRepository);
    expect(tursoRepos.agentProfileRepo).toBeInstanceOf(SqliteAgentProfileRepository);
    expect(tursoRepos.workspaceSecretRefRepo).toBeInstanceOf(SqliteWorkspaceSecretRefRepository);
    expect(tursoRepos.workspaceFileIndexRepo).toBeInstanceOf(SqliteWorkspaceFileIndexRepository);
    expect(tursoRepos.workspaceChangeSetRepo).toBeInstanceOf(SqliteWorkspaceChangeSetRepository);
    expect(tursoRepos.workspaceFileChangeRepo).toBeInstanceOf(SqliteWorkspaceFileChangeRepository);
    expect(tursoRepos.runRepo).toBeInstanceOf(SqliteRunRepository);
    expect(tursoRepos.cloudAgentWorkerRepo).toBeInstanceOf(SqliteCloudAgentWorkerRepository);
    expect(tursoRepos.messageRepo).toBeInstanceOf(SqliteMessageRepository);
    expect(tursoRepos.toolRepo).toBeInstanceOf(SqliteToolInvocationRepository);
    expect(tursoRepos.runEventRepo).toBeInstanceOf(SqliteRunEventRepository);
    expect(tursoRepos.runApprovalRequestRepo).toBeInstanceOf(SqliteRunApprovalRequestRepository);
    expect(tursoRepos.providerSessionBindingRepo).toBeInstanceOf(SqliteProviderSessionBindingRepository);
    expect(tursoRepos.providerTranscriptRepo).toBeInstanceOf(SqliteProviderTranscriptRepository);
    expect(tursoRepos.datasetRepo).toBeInstanceOf(SqliteDatasetRepository);
    expect(tursoRepos.datasetExampleRepo).toBeInstanceOf(SqliteDatasetExampleRepository);
    expect(tursoRepos.evalRunRepo).toBeInstanceOf(SqliteEvalRunRepository);
    expect(tursoRepos.evalExampleResultRepo).toBeInstanceOf(SqliteEvalExampleResultRepository);
  });

  it('creates drizzle-backed repositories for postgres mode', () => {
    const repos = createAgentInfraRepositories('postgres', {});
    expect(repos.threadRepo).toBeInstanceOf(DrizzleThreadRepository);
    expect(repos.workspaceRepo).toBeInstanceOf(DrizzleWorkspaceRepository);
    expect(repos.agentProfileRepo).toBeInstanceOf(DrizzleAgentProfileRepository);
    expect(repos.workspaceSecretRefRepo).toBeInstanceOf(DrizzleWorkspaceSecretRefRepository);
    expect(repos.workspaceFileIndexRepo).toBeInstanceOf(DrizzleWorkspaceFileIndexRepository);
    expect(repos.workspaceChangeSetRepo).toBeInstanceOf(DrizzleWorkspaceChangeSetRepository);
    expect(repos.workspaceFileChangeRepo).toBeInstanceOf(DrizzleWorkspaceFileChangeRepository);
    expect(repos.runRepo).toBeInstanceOf(DrizzleRunRepository);
    expect(repos.cloudAgentWorkerRepo).toBeInstanceOf(DrizzleCloudAgentWorkerRepository);
    expect(repos.messageRepo).toBeInstanceOf(DrizzleMessageRepository);
    expect(repos.toolRepo).toBeInstanceOf(DrizzleToolInvocationRepository);
    expect(repos.runEventRepo).toBeInstanceOf(DrizzleRunEventRepository);
    expect(repos.runApprovalRequestRepo).toBeInstanceOf(DrizzleRunApprovalRequestRepository);
    expect(repos.providerSessionBindingRepo).toBeInstanceOf(DrizzleProviderSessionBindingRepository);
    expect(repos.providerTranscriptRepo).toBeInstanceOf(DrizzleProviderTranscriptRepository);
    expect(repos.datasetRepo).toBeInstanceOf(DrizzleDatasetRepository);
    expect(repos.datasetExampleRepo).toBeInstanceOf(DrizzleDatasetExampleRepository);
    expect(repos.evalRunRepo).toBeInstanceOf(DrizzleEvalRunRepository);
    expect(repos.evalExampleResultRepo).toBeInstanceOf(DrizzleEvalExampleResultRepository);
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

    it('adds queue claim columns to legacy sqlite runs tables before creating indexes', async () => {
      const legacy = new Database(sqlitePath);
      legacy.exec(`
        CREATE TABLE threads (
          id TEXT PRIMARY KEY,
          app_id TEXT NOT NULL,
          user_id TEXT,
          title TEXT,
          status TEXT NOT NULL,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          archived_at INTEGER
        );

        CREATE TABLE runs (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL REFERENCES threads(id),
          trigger_message_id TEXT,
          provider TEXT,
          model TEXT,
          status TEXT NOT NULL,
          usage_json TEXT,
          error TEXT,
          started_at INTEGER,
          finished_at INTEGER,
          created_at INTEGER NOT NULL
        );
      `);
      legacy.close();

      const dbConfig = createSqliteDbConfig(sqlitePath);
      await dbConfig.bootstrapSchema();

      const upgraded = new Database(sqlitePath, { readonly: true });
      try {
        const columns = upgraded.prepare('PRAGMA table_info(runs)').all() as Array<{ name: string }>;
        const columnNames = columns.map((column) => column.name);
        expect(columnNames).toContain('claim_owner');
        expect(columnNames).toContain('claim_expires_at');
        expect(columnNames).toContain('next_attempt_at');
        expect(columnNames).toContain('attempt_count');

        const indexes = upgraded.prepare("PRAGMA index_list('runs')").all() as Array<{ name: string }>;
        expect(indexes.map((index) => index.name)).toContain('runs_status_claim_expires_at_idx');
      } finally {
        upgraded.close();
      }
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
