import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { AgentInfraRuntimePort } from '@agent-infra/app';
import { createDbConfigFromEnv } from '@agent-infra/db';
import { createDurableChatBaseServices } from '@agent-infra/durable-chat-server';
import type { RuntimePiRuntime } from '@agent-infra/runtime-pi/types';
import { afterEach, describe, expect, it } from 'vitest';

import { buildPlaygroundServer } from '../src/app.js';
import { bootstrapPlaygroundAuthSchema } from '../src/features/auth/repo/schema.js';
import type {
  AuthEmailSender,
  SendPasswordResetCodeEmailInput,
  SendSignupCodeEmailInput
} from '../src/features/auth/service/email-sender.js';
import { createPlaygroundAppServices } from '../src/playground-base-services.js';
import { bootstrapPlaygroundThreadCatalog } from '../src/features/thread-catalog/repo/schema.js';

const envKeys = ['SQLITE_PATH', 'DATABASE_URL', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'] as const;
const activeServers: Array<{ app: Awaited<ReturnType<typeof buildPlaygroundServer>>['app']; tempDir: string }> = [];

function createFakeDurableRuntime(): RuntimePiRuntime {
  return {
    async prepare(input) {
      return {
        provider: input?.provider ?? 'deepseek',
        model: input?.model ?? 'deepseek-v4-flash'
      };
    },
    async generateText(input) {
      return {
        provider: input.provider ?? 'deepseek',
        model: input.model ?? 'deepseek-v4-flash',
        text: input.userPrompt
      };
    },
    async runTurn() {}
  };
}

class RecordingAuthEmailSender implements AuthEmailSender {
  readonly signupSent: SendSignupCodeEmailInput[] = [];
  readonly resetSent: SendPasswordResetCodeEmailInput[] = [];

  async sendSignupCodeEmail(input: SendSignupCodeEmailInput) {
    this.signupSent.push(input);
  }

  async sendPasswordResetCodeEmail(input: SendPasswordResetCodeEmailInput) {
    this.resetSent.push(input);
  }
}

class FailingAuthEmailSender implements AuthEmailSender {
  async sendSignupCodeEmail() {
    throw new Error('email unavailable');
  }

  async sendPasswordResetCodeEmail() {
    throw new Error('email unavailable');
  }
}

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

function getSessionCookie(response: { headers: Record<string, unknown> }) {
  const rawSetCookie = response.headers['set-cookie'];
  const cookieValue = Array.isArray(rawSetCookie) ? rawSetCookie[0] : rawSetCookie;

  if (typeof cookieValue !== 'string') {
    throw new Error('Missing set-cookie header');
  }

  return cookieValue.split(';')[0];
}

async function createAuthTestServer(
  emailSender: AuthEmailSender = new RecordingAuthEmailSender(),
  authConfigOverride: Partial<{
    codeSecret: string;
    sessionTtlMs: number;
    signupCodeTtlMs: number;
    signupCodeCooldownMs: number;
    maxChallengeAttempts: number;
    sessionCookieName: string;
    secureCookies: boolean;
    allowedOrigins: Set<string>;
  }> = {},
  now: () => Date = () => new Date()
) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'playground-fastify-auth-routes-'));
  const sqlitePath = path.join(tempDir, 'test.db');

  const serverBundle = await withSqlitePath(sqlitePath, async () => {
    const dbConfig = createDbConfigFromEnv();
    await dbConfig.bootstrapSchema();
    const base = await createDurableChatBaseServices(dbConfig);
    await bootstrapPlaygroundAuthSchema(dbConfig);
    await bootstrapPlaygroundThreadCatalog(dbConfig);

    const durableRuntime = createFakeDurableRuntime();
    const runtimePort: AgentInfraRuntimePort = {
      async prepare(input) {
        return durableRuntime.prepare(input);
      },
      async generateText(input) {
        return durableRuntime.generateText(input);
      },
      async runTextTurn(repositories, input) {
        await durableRuntime.runTurn(
          {
            runRepo: repositories.runRepo,
            messageRepo: repositories.messageRepo,
            toolRepo: repositories.toolRepo,
            runEventRepo: repositories.runEventRepo
          },
          input
        );
      }
    };

    const appServices = createPlaygroundAppServices(base, runtimePort);
    const built = await buildPlaygroundServer({
      loadEnv: false,
      envFiles: ['test.env'],
      logger: false,
      getAppServices: async () => appServices,
      getRuntimeServices: async () => ({
        ...appServices,
        durableRuntime
      }),
      emailSender,
      authConfig: {
        codeSecret: 'test-auth-code-secret',
        sessionTtlMs: 1000 * 60 * 60 * 24 * 30,
        signupCodeTtlMs: 1000 * 60 * 10,
        signupCodeCooldownMs: 1000 * 60,
        maxChallengeAttempts: 5,
        sessionCookieName: 'sid',
        secureCookies: false,
        allowedOrigins: new Set(['http://localhost:5173']),
        ...authConfigOverride
      },
      now
    });

    return {
      app: built.app,
      tempDir,
      emailSender
    };
  });

  activeServers.push({
    app: serverBundle.app,
    tempDir: serverBundle.tempDir
  });

  return serverBundle;
}

afterEach(async () => {
  while (activeServers.length > 0) {
    const server = activeServers.pop();
    if (!server) {
      continue;
    }

    await server.app.close();
    await rm(server.tempDir, { recursive: true, force: true });
  }
});

describe('auth routes', () => {
  it('sends a signup code, signs up, resolves /me, logs out, and signs in again', async () => {
    const server = await createAuthTestServer();

    const requestCode = await server.app.inject({
      method: 'POST',
      url: '/api/auth/email/request-signup-code',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'User@example.com'
      }
    });

    expect(requestCode.statusCode).toBe(200);
    expect(server.emailSender.signupSent).toHaveLength(1);
    expect(server.emailSender.signupSent[0]).toMatchObject({
      toEmail: 'user@example.com'
    });

    const signUp = await server.app.inject({
      method: 'POST',
      url: '/api/auth/sign-up',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com',
        code: server.emailSender.signupSent[0].code,
        password: 'correct horse battery staple'
      }
    });

    expect(signUp.statusCode).toBe(200);
    expect(signUp.json()).toMatchObject({
      user: {
        email: 'user@example.com'
      }
    });

    const sessionCookie = getSessionCookie(signUp);
    const meAfterSignUp = await server.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        cookie: sessionCookie
      }
    });

    expect(meAfterSignUp.statusCode).toBe(200);
    expect(meAfterSignUp.json()).toMatchObject({
      user: {
        email: 'user@example.com'
      }
    });

    const logout = await server.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: {
        origin: 'http://localhost:5173',
        cookie: sessionCookie
      }
    });

    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toEqual({ ok: true });

    const meAfterLogout = await server.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        cookie: sessionCookie
      }
    });
    expect(meAfterLogout.json()).toEqual({ user: null });

    const invalidSignIn = await server.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com',
        password: 'wrong password'
      }
    });
    expect(invalidSignIn.statusCode).toBe(401);
    expect(invalidSignIn.json()).toEqual({ error: 'INVALID_CREDENTIALS' });

    const signIn = await server.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com',
        password: 'correct horse battery staple'
      }
    });

    expect(signIn.statusCode).toBe(200);
    expect(signIn.json()).toMatchObject({
      user: {
        email: 'user@example.com'
      }
    });
  });

  it('rate-limits repeated signup code requests within the cooldown window', async () => {
    const server = await createAuthTestServer();

    const first = await server.app.inject({
      method: 'POST',
      url: '/api/auth/email/request-signup-code',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com'
      }
    });

    const second = await server.app.inject({
      method: 'POST',
      url: '/api/auth/email/request-signup-code',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com'
      }
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.json()).toEqual({
      ok: false,
      error: 'RATE_LIMITED'
    });
  });

  it('does not leave a cooldown-blocking challenge behind when email delivery fails', async () => {
    const server = await createAuthTestServer(new FailingAuthEmailSender());

    const first = await server.app.inject({
      method: 'POST',
      url: '/api/auth/email/request-signup-code',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com'
      }
    });

    const second = await server.app.inject({
      method: 'POST',
      url: '/api/auth/email/request-signup-code',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com'
      }
    });

    expect(first.statusCode).toBe(503);
    expect(first.json()).toEqual({
      ok: false,
      error: 'AUTH_EMAIL_UNAVAILABLE'
    });
    expect(second.statusCode).toBe(503);
    expect(second.json()).toEqual({
      ok: false,
      error: 'AUTH_EMAIL_UNAVAILABLE'
    });
  });

  it('rejects expired signup codes', async () => {
    const server = await createAuthTestServer(new RecordingAuthEmailSender(), {
      signupCodeTtlMs: -1
    });

    const requestCode = await server.app.inject({
      method: 'POST',
      url: '/api/auth/email/request-signup-code',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com'
      }
    });

    expect(requestCode.statusCode).toBe(200);

    const code = server.emailSender instanceof RecordingAuthEmailSender ? server.emailSender.signupSent[0]?.code : null;
    if (!code) {
      throw new Error('Missing signup code');
    }

    const signUp = await server.app.inject({
      method: 'POST',
      url: '/api/auth/sign-up',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com',
        code,
        password: 'correct horse battery staple'
      }
    });

    expect(signUp.statusCode).toBe(400);
    expect(signUp.json()).toEqual({
      error: 'CODE_EXPIRED'
    });
  });

  it('rejects incorrect signup codes', async () => {
    const server = await createAuthTestServer();

    const requestCode = await server.app.inject({
      method: 'POST',
      url: '/api/auth/email/request-signup-code',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com'
      }
    });

    expect(requestCode.statusCode).toBe(200);

    const signUp = await server.app.inject({
      method: 'POST',
      url: '/api/auth/sign-up',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com',
        code: '000000',
        password: 'correct horse battery staple'
      }
    });

    expect(signUp.statusCode).toBe(400);
    expect(signUp.json()).toEqual({
      error: 'INVALID_CODE'
    });
  });

  it('rejects signup after the challenge exceeds the max attempt limit', async () => {
    const server = await createAuthTestServer(new RecordingAuthEmailSender(), {
      maxChallengeAttempts: 2
    });

    const requestCode = await server.app.inject({
      method: 'POST',
      url: '/api/auth/email/request-signup-code',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com'
      }
    });

    expect(requestCode.statusCode).toBe(200);

    const correctCode = server.emailSender instanceof RecordingAuthEmailSender ? server.emailSender.signupSent[0]?.code : null;
    if (!correctCode) {
      throw new Error('Missing signup code');
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const invalidAttempt = await server.app.inject({
        method: 'POST',
        url: '/api/auth/sign-up',
        headers: {
          origin: 'http://localhost:5173'
        },
        payload: {
          email: 'user@example.com',
          code: '000000',
          password: 'correct horse battery staple'
        }
      });

      expect(invalidAttempt.statusCode).toBe(400);
      expect(invalidAttempt.json()).toEqual({
        error: 'INVALID_CODE'
      });
    }

    const finalAttempt = await server.app.inject({
      method: 'POST',
      url: '/api/auth/sign-up',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com',
        code: correctCode,
        password: 'correct horse battery staple'
      }
    });

    expect(finalAttempt.statusCode).toBe(400);
    expect(finalAttempt.json()).toEqual({
      error: 'INVALID_CODE'
    });
  });

  it('rejects state-changing auth requests that omit Origin', async () => {
    const server = await createAuthTestServer();

    const response = await server.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in',
      payload: {
        email: 'user@example.com',
        password: 'anything'
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      ok: false,
      error: 'ORIGIN_NOT_ALLOWED'
    });
  });

  it('only accepts the configured cookie name when resolving auth sessions', async () => {
    const server = await createAuthTestServer(new RecordingAuthEmailSender(), {
      sessionCookieName: '__Host-sid'
    });

    const requestCode = await server.app.inject({
      method: 'POST',
      url: '/api/auth/email/request-signup-code',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com'
      }
    });
    expect(requestCode.statusCode).toBe(200);

    const code = server.emailSender instanceof RecordingAuthEmailSender ? server.emailSender.signupSent[0]?.code : null;
    if (!code) {
      throw new Error('Missing signup code');
    }

    const signUp = await server.app.inject({
      method: 'POST',
      url: '/api/auth/sign-up',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com',
        code,
        password: 'correct horse battery staple'
      }
    });

    const configuredCookie = getSessionCookie(signUp);
    const token = configuredCookie.split('=')[1];

    const configuredCookieMe = await server.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        cookie: configuredCookie
      }
    });
    expect(configuredCookieMe.json()).toMatchObject({
      user: {
        email: 'user@example.com'
      }
    });

    const fallbackCookieMe = await server.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        cookie: `sid=${token}`
      }
    });
    expect(fallbackCookieMe.json()).toEqual({ user: null });
  });

  it('returns a generic success response for password reset code requests when the email is unknown', async () => {
    const server = await createAuthTestServer(new RecordingAuthEmailSender());

    const response = await server.app.inject({
      method: 'POST',
      url: '/api/auth/email/request-password-reset-code',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'missing@example.com'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(server.emailSender.resetSent).toHaveLength(0);
  });

  it('resets the password, revokes old sessions, and requires a fresh sign-in', async () => {
    const server = await createAuthTestServer(new RecordingAuthEmailSender());

    const requestSignupCode = await server.app.inject({
      method: 'POST',
      url: '/api/auth/email/request-signup-code',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com'
      }
    });
    expect(requestSignupCode.statusCode).toBe(200);

    const signupCode = server.emailSender.signupSent[0]?.code;
    if (!signupCode) {
      throw new Error('Missing signup code');
    }

    const signUp = await server.app.inject({
      method: 'POST',
      url: '/api/auth/sign-up',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com',
        code: signupCode,
        password: 'old-password-123'
      }
    });
    expect(signUp.statusCode).toBe(200);

    const oldSessionCookie = getSessionCookie(signUp);

    const requestResetCode = await server.app.inject({
      method: 'POST',
      url: '/api/auth/email/request-password-reset-code',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com'
      }
    });
    expect(requestResetCode.statusCode).toBe(200);
    expect(requestResetCode.json()).toEqual({ ok: true });

    const resetCode = server.emailSender.resetSent[0]?.code;
    if (!resetCode) {
      throw new Error('Missing reset code');
    }

    const resetPassword = await server.app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      headers: {
        origin: 'http://localhost:5173',
        cookie: oldSessionCookie
      },
      payload: {
        email: 'user@example.com',
        code: resetCode,
        newPassword: 'new-password-456'
      }
    });
    expect(resetPassword.statusCode).toBe(200);
    expect(resetPassword.json()).toEqual({ ok: true });

    const meAfterReset = await server.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        cookie: oldSessionCookie
      }
    });
    expect(meAfterReset.json()).toEqual({ user: null });

    const signInWithOldPassword = await server.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com',
        password: 'old-password-123'
      }
    });
    expect(signInWithOldPassword.statusCode).toBe(401);
    expect(signInWithOldPassword.json()).toEqual({ error: 'INVALID_CREDENTIALS' });

    const signInWithNewPassword = await server.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com',
        password: 'new-password-456'
      }
    });
    expect(signInWithNewPassword.statusCode).toBe(200);
    expect(signInWithNewPassword.json()).toMatchObject({
      user: {
        email: 'user@example.com'
      }
    });
  });

  it('rejects incorrect password reset codes', async () => {
    const server = await createAuthTestServer(new RecordingAuthEmailSender());

    const requestSignupCode = await server.app.inject({
      method: 'POST',
      url: '/api/auth/email/request-signup-code',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com'
      }
    });
    expect(requestSignupCode.statusCode).toBe(200);

    const signupCode = server.emailSender.signupSent[0]?.code;
    if (!signupCode) {
      throw new Error('Missing signup code');
    }

    const signUp = await server.app.inject({
      method: 'POST',
      url: '/api/auth/sign-up',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com',
        code: signupCode,
        password: 'correct horse battery staple'
      }
    });
    expect(signUp.statusCode).toBe(200);

    const requestResetCode = await server.app.inject({
      method: 'POST',
      url: '/api/auth/email/request-password-reset-code',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com'
      }
    });
    expect(requestResetCode.statusCode).toBe(200);

    const resetPassword = await server.app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com',
        code: '000000',
        newPassword: 'updated-password'
      }
    });
    expect(resetPassword.statusCode).toBe(400);
    expect(resetPassword.json()).toEqual({
      ok: false,
      error: 'INVALID_CODE'
    });
  });

  it('rejects expired password reset codes', async () => {
    let currentTime = new Date('2026-05-11T00:00:00.000Z');
    const server = await createAuthTestServer(new RecordingAuthEmailSender(), {}, () => currentTime);

    const requestSignupCode = await server.app.inject({
      method: 'POST',
      url: '/api/auth/email/request-signup-code',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com'
      }
    });
    expect(requestSignupCode.statusCode).toBe(200);

    const signupCode = server.emailSender.signupSent[0]?.code;
    if (!signupCode) {
      throw new Error('Missing signup code');
    }

    const signUp = await server.app.inject({
      method: 'POST',
      url: '/api/auth/sign-up',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com',
        code: signupCode,
        password: 'correct horse battery staple'
      }
    });
    expect(signUp.statusCode).toBe(200);

    const requestResetCode = await server.app.inject({
      method: 'POST',
      url: '/api/auth/email/request-password-reset-code',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com'
      }
    });
    expect(requestResetCode.statusCode).toBe(200);

    const resetCode = server.emailSender.resetSent[0]?.code;
    if (!resetCode) {
      throw new Error('Missing reset code');
    }

    currentTime = new Date(currentTime.getTime() + 1000 * 60 * 11);

    const resetPassword = await server.app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      headers: {
        origin: 'http://localhost:5173'
      },
      payload: {
        email: 'user@example.com',
        code: resetCode,
        newPassword: 'updated-password'
      }
    });
    expect(resetPassword.statusCode).toBe(400);
    expect(resetPassword.json()).toEqual({
      ok: false,
      error: 'CODE_EXPIRED'
    });
  });
});
