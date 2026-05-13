import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { getPlaygroundDbInfo } from './playground-meta';

const ENV_KEYS = [
  'PLAYGROUND_DB_MODE',
  'SQLITE_PATH',
  'TURSO_DATABASE_URL',
  'DATABASE_URL'
] as const;

const originalEnv = new Map<string, string | undefined>(
  ENV_KEYS.map((key) => [key, process.env[key]])
);

function clearDbEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

afterEach(() => {
  clearDbEnv();
  for (const [key, value] of originalEnv) {
    if (value === undefined) {
      continue;
    }

    process.env[key] = value;
  }
});

describe('playground meta db info', () => {
  it('honors PLAYGROUND_DB_MODE=sqlite even when hosted db variables exist', () => {
    clearDbEnv();
    process.env.PLAYGROUND_DB_MODE = 'sqlite';
    process.env.SQLITE_PATH = './_test-meta.db';
    process.env.TURSO_DATABASE_URL = 'libsql://example.turso.io';
    process.env.DATABASE_URL = 'postgres://example';

    expect(getPlaygroundDbInfo()).toEqual({
      mode: 'sqlite',
      connectionString: `file:${path.resolve(process.cwd(), './_test-meta.db')}`
    });
  });

  it('uses turso when PLAYGROUND_DB_MODE=turso', () => {
    clearDbEnv();
    process.env.PLAYGROUND_DB_MODE = 'turso';
    process.env.TURSO_DATABASE_URL = 'libsql://example.turso.io';

    expect(getPlaygroundDbInfo()).toEqual({
      mode: 'turso',
      connectionString: 'libsql://example.turso.io'
    });
  });

  it('falls back to hosted db variables when no mode is forced', () => {
    clearDbEnv();
    process.env.TURSO_DATABASE_URL = 'libsql://example.turso.io';

    expect(getPlaygroundDbInfo()).toEqual({
      mode: 'turso',
      connectionString: 'libsql://example.turso.io'
    });
  });
});
