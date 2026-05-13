import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { DbConfig } from '@agent-infra/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthEmailChallengeRepo } from '../repo/auth-email-challenge-repo';
import { AuthSessionRepo } from '../repo/auth-session-repo';
import { bootstrapPlaygroundAuthSchema } from '../repo/schema';
import type { PlaygroundAuthConfig } from './auth-config';
import { PlaygroundAuthService } from './auth-service';
import type { AuthEmailSender, SendPasswordResetCodeEmailInput, SendSignupCodeEmailInput } from './email-sender';

type SentEmail =
  | ({ purpose: 'sign_up' } & SendSignupCodeEmailInput)
  | ({ purpose: 'reset_password' } & SendPasswordResetCodeEmailInput);
type SqliteClient = {
  close(): void;
  pragma(statement: string): unknown;
};
type SqliteDatabaseConstructor = new (path: string) => SqliteClient;

const authConfig: PlaygroundAuthConfig = {
  codeSecret: 'auth-service-test-secret',
  sessionTtlMs: 1000 * 60 * 60,
  signupCodeTtlMs: 1000 * 60 * 10,
  signupCodeCooldownMs: 1000 * 60,
  maxChallengeAttempts: 3,
  sessionCookieName: 'sid',
  secureCookies: false,
  allowedOrigins: new Set()
};
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3') as SqliteDatabaseConstructor;

function createEmailSender(sentEmails: SentEmail[]): AuthEmailSender {
  return {
    sendSignupCodeEmail: vi.fn(async (input) => {
      sentEmails.push({ purpose: 'sign_up', ...input });
    }),
    sendPasswordResetCodeEmail: vi.fn(async (input) => {
      sentEmails.push({ purpose: 'reset_password', ...input });
    })
  };
}

function createSqliteTestDbConfig(sqlitePath: string): DbConfig {
  const sqlite = new Database(sqlitePath);
  sqlite.pragma('foreign_keys = ON');

  return {
    mode: 'sqlite',
    db: drizzle(sqlite as never),
    connectionString: `file:${sqlitePath}`,
    sqlitePath,
    bootstrapSchema: async () => {}
  };
}

describe('PlaygroundAuthService', () => {
  let dbConfig: DbConfig;
  let sentEmails: SentEmail[];
  let service: PlaygroundAuthService;
  let tempDir = '';
  let now = new Date('2026-05-14T00:00:00.000Z');

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'playground-auth-service-'));

    dbConfig = createSqliteTestDbConfig(path.join(tempDir, 'auth-service.db'));
    await dbConfig.bootstrapSchema();
    await bootstrapPlaygroundAuthSchema(dbConfig);
    sentEmails = [];
    now = new Date('2026-05-14T00:00:00.000Z');
    service = new PlaygroundAuthService(dbConfig, authConfig, createEmailSender(sentEmails), () => now);
  });

  afterEach(async () => {
    if (dbConfig.mode === 'sqlite') {
      dbConfig.db.$client.close();
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it('enforces signup code cooldown without sending another email', async () => {
    await expect(service.requestSignupCode('User@Example.com')).resolves.toEqual({ ok: true });
    await expect(service.requestSignupCode('user@example.com')).resolves.toEqual({ ok: false, error: 'RATE_LIMITED' });

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]).toMatchObject({ purpose: 'sign_up', toEmail: 'user@example.com' });
  });

  it('tracks invalid signup code attempts on the latest challenge', async () => {
    await service.requestSignupCode('user@example.com');
    const challenges = new AuthEmailChallengeRepo(dbConfig);
    const latestChallenge = await challenges.findLatestByEmailAndPurpose('user@example.com', 'sign_up');

    await expect(
      service.signUp({
        email: 'user@example.com',
        code: '000000',
        password: 'password-1'
      })
    ).resolves.toEqual({ ok: false, error: 'INVALID_CODE' });

    await expect(challenges.findLatestByEmailAndPurpose('user@example.com', 'sign_up')).resolves.toMatchObject({
      id: latestChallenge?.id,
      attemptCount: 1
    });
  });

  it('rejects expired signup challenges', async () => {
    await service.requestSignupCode('user@example.com');
    const code = sentEmails[0].code;
    now = new Date('2026-05-14T00:11:00.000Z');

    await expect(
      service.signUp({
        email: 'user@example.com',
        code,
        password: 'password-1'
      })
    ).resolves.toEqual({ ok: false, error: 'CODE_EXPIRED' });
  });

  it('consumes a signup challenge and creates a session', async () => {
    await service.requestSignupCode('user@example.com');
    const code = sentEmails[0].code;

    const result = await service.signUp({
      email: 'user@example.com',
      code,
      password: 'password-1',
      ipAddress: '203.0.113.7',
      userAgent: 'vitest'
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    await expect(service.getCurrentUser(result.data.sessionToken)).resolves.toMatchObject({
      id: result.data.user.id,
      email: 'user@example.com'
    });
    await expect(new AuthEmailChallengeRepo(dbConfig).findLatestByEmailAndPurpose('user@example.com', 'sign_up')).resolves.toMatchObject({
      consumedAt: now
    });
  });

  it('resets password, consumes the reset challenge, and revokes existing sessions', async () => {
    await service.requestSignupCode('user@example.com');
    const signupCode = sentEmails[0].code;
    const signupResult = await service.signUp({
      email: 'user@example.com',
      code: signupCode,
      password: 'old-password'
    });
    if (!signupResult.ok) {
      throw new Error('expected signup to succeed');
    }

    now = new Date('2026-05-14T00:02:00.000Z');
    await service.requestPasswordResetCode('user@example.com');
    const resetCode = sentEmails.find((email) => email.purpose === 'reset_password')?.code;
    expect(resetCode).toBeDefined();

    await expect(
      service.resetPassword({
        email: 'user@example.com',
        code: resetCode ?? '',
        newPassword: 'new-password'
      })
    ).resolves.toEqual({ ok: true });

    await expect(service.getCurrentUser(signupResult.data.sessionToken)).resolves.toBeNull();
    await expect(
      new AuthEmailChallengeRepo(dbConfig).findLatestByEmailAndPurpose('user@example.com', 'reset_password')
    ).resolves.toMatchObject({ consumedAt: now });
    await expect(new AuthSessionRepo(dbConfig).findActiveByTokenHash('not-a-real-token-hash', now)).resolves.toBeNull();
    await expect(service.signIn({ email: 'user@example.com', password: 'new-password' })).resolves.toMatchObject({
      ok: true
    });
  });
});
