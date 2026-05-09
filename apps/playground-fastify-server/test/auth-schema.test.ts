import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createDbConfigFromEnv } from '@agent-infra/db';
import { afterEach, describe, expect, it } from 'vitest';

import { bootstrapPlaygroundAuthSchema } from '../src/features/auth/repo/schema.js';

const envKeys = ['SQLITE_PATH', 'DATABASE_URL', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'] as const;
const tempDirs: string[] = [];

async function withSqlitePath<T>(sqlitePath: string, run: () => Promise<T>) {
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

  process.env.SQLITE_PATH = sqlitePath;
  delete process.env.DATABASE_URL;
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;

  try {
    return await run();
  } finally {
    for (const key of envKeys) {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map(async (tempDir) => {
      await rm(tempDir, { recursive: true, force: true });
    })
  );
});

describe('bootstrapPlaygroundAuthSchema', () => {
  it('creates the auth tables and indexes idempotently for sqlite', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'playground-fastify-auth-schema-'));
    tempDirs.push(tempDir);
    const sqlitePath = path.join(tempDir, 'test.db');

    await withSqlitePath(sqlitePath, async () => {
      const dbConfig = createDbConfigFromEnv();
      await dbConfig.bootstrapSchema();

      await bootstrapPlaygroundAuthSchema(dbConfig);
      await bootstrapPlaygroundAuthSchema(dbConfig);

      const objects = dbConfig.db.$client
        .prepare(
          `SELECT name, type
           FROM sqlite_master
           WHERE name IN (
             'auth_users',
             'auth_identities',
             'auth_passwords',
             'auth_email_challenges',
             'auth_sessions',
             'auth_identities_type_value_unique_idx',
             'auth_email_challenges_lookup_idx',
             'auth_sessions_token_hash_unique_idx'
           )
           ORDER BY name`
        )
        .all() as Array<{ name: string; type: string }>;

      expect(objects).toEqual([
        { name: 'auth_email_challenges', type: 'table' },
        { name: 'auth_email_challenges_lookup_idx', type: 'index' },
        { name: 'auth_identities', type: 'table' },
        { name: 'auth_identities_type_value_unique_idx', type: 'index' },
        { name: 'auth_passwords', type: 'table' },
        { name: 'auth_sessions', type: 'table' },
        { name: 'auth_sessions_token_hash_unique_idx', type: 'index' },
        { name: 'auth_users', type: 'table' }
      ]);
    });
  });
});
