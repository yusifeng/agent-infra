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
import type { AuthEmailSender, SendSignupCodeEmailInput } from '../src/features/auth/service/email-sender.js';
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
    async runTurn() {}
  };
}

class RecordingAuthEmailSender implements AuthEmailSender {
  readonly sent: SendSignupCodeEmailInput[] = [];

  async sendSignupCodeEmail(input: SendSignupCodeEmailInput) {
    this.sent.push(input);
  }
}

class FailingAuthEmailSender implements AuthEmailSender {
  async sendSignupCodeEmail() {
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
  }> = {}
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
      }
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
    expect(server.emailSender.sent).toHaveLength(1);
    expect(server.emailSender.sent[0]).toMatchObject({
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
        code: server.emailSender.sent[0].code,
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

    const code = server.emailSender instanceof RecordingAuthEmailSender ? server.emailSender.sent[0]?.code : null;
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
});
