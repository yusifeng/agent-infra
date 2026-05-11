import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createDbConfigFromEnv } from '../src/client';

const envKeys = [
  'PLAYGROUND_DB_MODE',
  'SQLITE_PATH',
  'DATABASE_URL',
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN'
] as const;

const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

function restoreEnv() {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function withTempSqlitePath<T>(run: (sqlitePath: string) => Promise<T>) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-infra-db-mode-'));
  const sqlitePath = path.join(tempDir, 'forced-sqlite.db');

  try {
    return await run(sqlitePath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

describe('createDbConfigFromEnv', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('forces sqlite when PLAYGROUND_DB_MODE=sqlite even if turso and postgres envs exist', () => {
    return withTempSqlitePath(async (sqlitePath) => {
      process.env.PLAYGROUND_DB_MODE = 'sqlite';
      process.env.SQLITE_PATH = sqlitePath;
      process.env.TURSO_DATABASE_URL = 'libsql://example.turso.io';
      process.env.TURSO_AUTH_TOKEN = 'turso-token';
      process.env.DATABASE_URL = 'postgres://example.test/agent-infra';

      const dbConfig = createDbConfigFromEnv();

      expect(dbConfig.mode).toBe('sqlite');
      expect(dbConfig.connectionString).toContain('forced-sqlite.db');
    });
  });

  it('forces turso when PLAYGROUND_DB_MODE=turso even if sqlite and postgres envs exist', () => {
    return withTempSqlitePath(async (sqlitePath) => {
      process.env.PLAYGROUND_DB_MODE = 'turso';
      process.env.SQLITE_PATH = sqlitePath;
      process.env.TURSO_DATABASE_URL = 'libsql://example.turso.io';
      process.env.TURSO_AUTH_TOKEN = 'turso-token';
      process.env.DATABASE_URL = 'postgres://example.test/agent-infra';

      const dbConfig = createDbConfigFromEnv();

      expect(dbConfig.mode).toBe('turso');
      expect(dbConfig.connectionString).toBe('libsql://example.turso.io');
    });
  });

  it('forces postgres when PLAYGROUND_DB_MODE=postgres even if sqlite and turso envs exist', () => {
    return withTempSqlitePath(async (sqlitePath) => {
      process.env.PLAYGROUND_DB_MODE = 'postgres';
      process.env.SQLITE_PATH = sqlitePath;
      process.env.TURSO_DATABASE_URL = 'libsql://example.turso.io';
      process.env.TURSO_AUTH_TOKEN = 'turso-token';
      process.env.DATABASE_URL = 'postgres://example.test/agent-infra';

      const dbConfig = createDbConfigFromEnv();

      expect(dbConfig.mode).toBe('postgres');
      expect(dbConfig.connectionString).toBe('postgres://example.test/agent-infra');
    });
  });
});
