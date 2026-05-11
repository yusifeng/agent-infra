import { afterEach, describe, expect, it } from 'vitest';

import { buildPlaygroundStartupSummary } from '../src/startup-summary.js';

const originalNodeEnv = process.env.NODE_ENV;
const originalDbMode = process.env.PLAYGROUND_DB_MODE;

function restoreEnv() {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }

  if (originalDbMode === undefined) {
    delete process.env.PLAYGROUND_DB_MODE;
  } else {
    process.env.PLAYGROUND_DB_MODE = originalDbMode;
  }
}

describe('buildPlaygroundStartupSummary', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('marks the db mode as forced when PLAYGROUND_DB_MODE is set', () => {
    process.env.NODE_ENV = 'development';
    process.env.PLAYGROUND_DB_MODE = 'sqlite';

    const summary = buildPlaygroundStartupSummary({
      dbInfo: {
        mode: 'sqlite',
        connectionString: 'file:/tmp/playground.db'
      },
      envFiles: ['apps/playground-fastify-server/.env']
    });

    expect(summary).toEqual({
      dbMode: 'sqlite',
      dbConnection: 'file:/tmp/playground.db',
      dbModeForced: true,
      envFiles: ['apps/playground-fastify-server/.env'],
      nodeEnv: 'development'
    });
  });

  it('marks the db mode as not forced when PLAYGROUND_DB_MODE is absent', () => {
    delete process.env.PLAYGROUND_DB_MODE;
    process.env.NODE_ENV = 'production';

    const summary = buildPlaygroundStartupSummary({
      dbInfo: {
        mode: 'turso',
        connectionString: 'libsql://example.turso.io'
      },
      envFiles: ['.env']
    });

    expect(summary.dbModeForced).toBe(false);
    expect(summary.nodeEnv).toBe('production');
  });

  it('redacts credentials from non-sqlite connection strings', () => {
    delete process.env.PLAYGROUND_DB_MODE;

    const summary = buildPlaygroundStartupSummary({
      dbInfo: {
        mode: 'postgres',
        connectionString: 'postgres://alice:secret@example.test:5432/agent-infra'
      },
      envFiles: ['.env']
    });

    expect(summary.dbConnection).toBe('postgres://alice:***@example.test:5432/agent-infra');
  });
});
