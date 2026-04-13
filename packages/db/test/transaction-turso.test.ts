import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDbConfigFromEnv, withDbTransaction } from '../src/client';

describe('withDbTransaction turso/libsql delegation', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalTursoDatabaseUrl = process.env.TURSO_DATABASE_URL;
  const originalTursoAuthToken = process.env.TURSO_AUTH_TOKEN;

  beforeEach(() => {
    process.env.TURSO_DATABASE_URL = 'libsql://agent-infra-test.aws-ap-northeast-1.turso.io';
    process.env.TURSO_AUTH_TOKEN = 'test-token';
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
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
  });

  it('picks turso mode when TURSO_DATABASE_URL is set', async () => {
    const dbConfig = createDbConfigFromEnv();

    expect(dbConfig.mode).toBe('turso');
    expect(dbConfig.connectionString).toBe('libsql://agent-infra-test.aws-ap-northeast-1.turso.io');
  });

  it('delegates turso transactions to the async drizzle client', async () => {
    const tx = { kind: 'turso-tx' };
    const transaction = vi.fn(async (callback: (db: unknown) => Promise<string>) => callback(tx));
    const dbConfig = {
      mode: 'turso' as const,
      db: { transaction },
      connectionString: process.env.TURSO_DATABASE_URL!,
      initialize: async () => {}
    };

    const result = await withDbTransaction(dbConfig, async (db) => {
      expect(db).toBe(tx);
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
