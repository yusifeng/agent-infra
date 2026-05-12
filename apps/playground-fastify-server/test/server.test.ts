import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { AgentInfraRuntimePort } from '@agent-infra/app';
import { createDbConfigFromEnv } from '@agent-infra/db';
import type { RuntimePiRuntime } from '@agent-infra/runtime-pi/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildPlaygroundServer } from '../src/app.js';
import { APP_ID } from '../src/constants.js';
import { bootstrapPlaygroundAuthSchema } from '../src/features/auth/repo/schema.js';
import type { AuthEmailSender, SendSignupCodeEmailInput } from '../src/features/auth/service/email-sender.js';
import type { ThreadTitleGenerator } from '../src/features/thread-title/auto-thread-title.js';
import { PlaygroundThreadCatalogRepo } from '../src/features/thread-catalog/repo/thread-catalog-repo.js';
import { bootstrapPlaygroundThreadCatalog } from '../src/features/thread-catalog/repo/schema.js';
import { createPlaygroundAppServices } from '../src/playground-base-services.js';
import { getPlaygroundMeta, type PlaygroundMeta } from '../src/playground-meta.js';
import { createDurableChatBaseServices } from '@agent-infra/durable-chat-server';

const envKeys = ['SQLITE_PATH', 'DATABASE_URL', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'] as const;

class RecordingAuthEmailSender implements AuthEmailSender {
  readonly sent: SendSignupCodeEmailInput[] = [];

  async sendSignupCodeEmail(input: SendSignupCodeEmailInput) {
    this.sent.push(input);
  }
}

class RecordingThreadTitleGenerator implements ThreadTitleGenerator {
  readonly calls: Array<{ sourceText: string }> = [];

  constructor(private readonly nextTitle: string | null = '自动生成标题') {}

  async generateTitle(input: { sourceText: string }) {
    this.calls.push(input);
    return this.nextTitle;
  }
}

class FailingThreadTitleGenerator implements ThreadTitleGenerator {
  readonly calls: Array<{ sourceText: string }> = [];

  async generateTitle(input: { sourceText: string }) {
    this.calls.push(input);
    throw new Error('title generation failed');
  }
}

class DeferredThreadTitleGenerator implements ThreadTitleGenerator {
  readonly calls: Array<{ sourceText: string }> = [];
  private resolveNext: ((value: string | null) => void) | null = null;

  async generateTitle(input: { sourceText: string }) {
    this.calls.push(input);
    return await new Promise<string | null>((resolve) => {
      this.resolveNext = resolve;
    });
  }

  resolve(value: string | null) {
    if (!this.resolveNext) {
      throw new Error('No pending title generation to resolve');
    }

    const resolve = this.resolveNext;
    this.resolveNext = null;
    resolve(value);
  }
}

function parseSsePayloads(body: string) {
  return body
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const dataLine = block
        .split('\n')
        .find((line) => line.startsWith('data:'));

      if (!dataLine) {
        throw new Error(`Missing data line in SSE block: ${block}`);
      }

      return JSON.parse(dataLine.slice('data:'.length).trim());
    });
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

function createFakeDurableRuntime(mode: 'success' | 'failure' = 'success'): RuntimePiRuntime {
  return {
    async prepare(input) {
      return {
        provider: input?.provider ?? 'deepseek',
        model: input?.model ?? 'deepseek-v4-flash'
      };
    },
    async runTurn(ctx, input, options) {
      const runningRun = await ctx.runRepo.updateStatus(input.runId, 'running', {
        startedAt: new Date('2026-04-10T01:00:00.000Z')
      });
      await options?.onPersistedUpdate?.({ run: runningRun });

      const assistantMessage = await ctx.messageRepo.create({
        id: `assistant-${input.runId}`,
        threadId: input.threadId,
        runId: input.runId,
        role: 'assistant',
        seq: await ctx.messageRepo.nextSeq(input.threadId),
        status: 'created',
        metadata: null
      });

      await options?.onLiveAssistantUpdate?.({
        messageId: assistantMessage.id,
        kind: 'assistant_delta',
        textDelta: mode === 'success' ? 'Hello from fake runtime' : ''
      });

      if (mode === 'success') {
        await ctx.messageRepo.createPart({
          id: `part-${input.runId}`,
          messageId: assistantMessage.id,
          partIndex: 0,
          type: 'text',
          textValue: 'Hello from fake runtime',
          jsonValue: null
        });
        await ctx.messageRepo.updateStatus(assistantMessage.id, 'completed');

        const completedRun = await ctx.runRepo.updateStatus(input.runId, 'completed', {
          finishedAt: new Date('2026-04-10T01:00:05.000Z')
        });
        await options?.onPersistedUpdate?.({ run: completedRun });
        return;
      }

      await ctx.messageRepo.updateStatus(assistantMessage.id, 'failed');
      const failedRun = await ctx.runRepo.updateStatus(input.runId, 'failed', {
        error: 'fake runtime failure',
        finishedAt: new Date('2026-04-10T01:00:05.000Z')
      });
      await options?.onPersistedUpdate?.({ run: failedRun });
    }
  };
}

async function createTestServer(options: {
  runtimeMode?: 'success' | 'failure';
  metaOverride?: Partial<PlaygroundMeta>;
  threadTitleGenerator?: ThreadTitleGenerator | null;
}) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'playground-fastify-server-test-'));
  const sqlitePath = path.join(tempDir, 'test.db');

  const serverBundle = await withSqlitePath(sqlitePath, async () => {
    const dbConfig = createDbConfigFromEnv();
    await dbConfig.bootstrapSchema();
    const base = await createDurableChatBaseServices(dbConfig);
    await bootstrapPlaygroundAuthSchema(dbConfig);
    await bootstrapPlaygroundThreadCatalog(dbConfig);
    const emailSender = new RecordingAuthEmailSender();
    const durableRuntime = createFakeDurableRuntime(options.runtimeMode);
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
    const meta = {
      ...getPlaygroundMeta({}, base.dbInfo),
      ...options.metaOverride,
      dbInfo: base.dbInfo
    };
    const built = await buildPlaygroundServer({
      loadEnv: false,
      envFiles: ['test.env'],
      logger: false,
      getAppServices: async () => appServices,
      getRuntimeServices: async () => ({
        ...appServices,
        durableRuntime
      }),
      getRuntimeMeta: () => meta,
      emailSender,
      authConfig: {
        codeSecret: 'test-auth-code-secret',
        sessionTtlMs: 1000 * 60 * 60 * 24 * 30,
        signupCodeTtlMs: 1000 * 60 * 10,
        signupCodeCooldownMs: 1000 * 60,
        maxChallengeAttempts: 5,
        sessionCookieName: 'sid',
        secureCookies: false,
        allowedOrigins: new Set(['http://localhost:5173'])
      },
      threadTitleGenerator: options.threadTitleGenerator
    });

    return {
      app: built.app,
      appServices,
      tempDir,
      emailSender
    };
  });

  return serverBundle;
}

function getSessionCookie(response: { headers: Record<string, unknown> }) {
  const rawSetCookie = response.headers['set-cookie'];
  const cookieValue = Array.isArray(rawSetCookie) ? rawSetCookie[0] : rawSetCookie;

  if (typeof cookieValue !== 'string') {
    throw new Error('Missing set-cookie header');
  }

  return cookieValue.split(';')[0];
}

async function registerAndSignIn(server: Awaited<ReturnType<typeof createTestServer>>, email: string) {
  const requestCode = await server.app.inject({
    method: 'POST',
    url: '/api/auth/email/request-signup-code',
    headers: {
      origin: 'http://localhost:5173'
    },
    payload: {
      email
    }
  });
  expect(requestCode.statusCode).toBe(200);

  const sentEmail = server.emailSender.sent.at(-1);
  if (!sentEmail) {
    throw new Error('Expected signup code email to be sent');
  }

  const signUp = await server.app.inject({
    method: 'POST',
    url: '/api/auth/sign-up',
    headers: {
      origin: 'http://localhost:5173'
    },
    payload: {
      email,
      code: sentEmail.code,
      password: 'correct horse battery staple'
    }
  });

  expect(signUp.statusCode).toBe(200);
  return getSessionCookie(signUp);
}

async function createThread(
  server: Awaited<ReturnType<typeof createTestServer>>,
  sessionCookie: string,
  title: string
) {
  const created = await server.app.inject({
    method: 'POST',
    url: '/api/threads',
    headers: {
      cookie: sessionCookie
    },
    payload: { title }
  });

  expect(created.statusCode).toBe(200);
  return created.json().thread.id as string;
}

async function streamSuccessfulTurn(
  server: Awaited<ReturnType<typeof createTestServer>>,
  sessionCookie: string,
  threadId: string,
  text: string
) {
  const stream = await server.app.inject({
    method: 'POST',
    url: `/api/threads/${threadId}/runs/stream`,
    headers: {
      cookie: sessionCookie
    },
    payload: { text }
  });

  expect(stream.statusCode).toBe(200);
  return parseSsePayloads(stream.body);
}

const activeServers: Array<{ app: Awaited<ReturnType<typeof buildPlaygroundServer>>['app']; tempDir: string }> = [];

afterEach(async () => {
  await Promise.allSettled(
    activeServers.splice(0).map(async ({ app, tempDir }) => {
      await app.close();
      await rm(tempDir, { force: true, recursive: true });
    })
  );
});

describe('playground-fastify-server', () => {
  it('serves site icons via the consumer resource route', async () => {
    const originalFetch = global.fetch;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'image/png' }),
      arrayBuffer: async () => Uint8Array.from([137, 80, 78, 71]).buffer
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const server = await createTestServer({});
      activeServers.push(server);

      const response = await server.app.inject({
        method: 'GET',
        url: '/site-icons/example.com'
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('image/png');
      expect(response.headers['cache-control']).toContain('max-age=');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://www.google.com/s2/favicons?sz=64&domain=example.com',
        expect.objectContaining({
          signal: expect.any(AbortSignal)
        })
      );
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }
  });

  it('rejects invalid site icon hostnames', async () => {
    const server = await createTestServer({});
    activeServers.push(server);

    const response = await server.app.inject({
      method: 'GET',
      url: '/site-icons/not-a-host'
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain('Invalid hostname');
  });

  it('serves health and meta with injected config', async () => {
    const server = await createTestServer({
      metaOverride: {
        configured: true,
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        defaultModelKey: 'deepseek:deepseek-v4-flash',
        runtimeConfigError: null
      }
    });
    activeServers.push(server);

    const health = await server.app.inject({
      method: 'GET',
      url: '/health'
    });
    expect(health.statusCode).toBe(200);
    expect(health.headers['x-request-id']).toBeTruthy();
    expect(health.headers['server-timing']).toContain('total;dur=');
    expect(health.json()).toEqual({
      app: 'playground-fastify-server',
      envFiles: ['test.env'],
      status: 'ok'
    });

    const meta = await server.app.inject({
      method: 'GET',
      url: '/api/meta'
    });
    expect(meta.statusCode).toBe(200);
    expect(meta.headers['x-request-id']).toBeTruthy();
    expect(meta.headers['server-timing']).toContain('meta_resolve;dur=');
    expect(meta.json()).toMatchObject({
      runtimeConfigured: true,
      runtimeProvider: 'deepseek',
      runtimeModel: 'deepseek-v4-flash',
      dbMode: 'sqlite'
    });
  });

  it('reports db info from resolved app services instead of inferring it from unrelated env vars', async () => {
    const originalTursoDatabaseUrl = process.env.TURSO_DATABASE_URL;
    const originalTursoAuthToken = process.env.TURSO_AUTH_TOKEN;
    process.env.TURSO_DATABASE_URL = 'libsql://shadow-from-other-app.turso.io';
    process.env.TURSO_AUTH_TOKEN = 'shadow-token';

    try {
      const server = await createTestServer({});
      activeServers.push(server);

      const meta = await server.app.inject({
        method: 'GET',
        url: '/api/meta'
      });

      expect(meta.statusCode).toBe(200);
      expect(meta.json()).toMatchObject({
        dbMode: 'sqlite'
      });
      expect(meta.json().dbConnection).toContain(`${server.tempDir}/test.db`);
      expect(meta.json().dbConnection).not.toBe('libsql://shadow-from-other-app.turso.io');
    } finally {
      if (originalTursoDatabaseUrl === undefined) {
        delete process.env.TURSO_DATABASE_URL;
      } else {
        process.env.TURSO_DATABASE_URL = originalTursoDatabaseUrl;
      }

      if (originalTursoAuthToken === undefined) {
        delete process.env.TURSO_AUTH_TOKEN;
      } else {
        process.env.TURSO_AUTH_TOKEN = originalTursoAuthToken;
      }
    }
  });

  it('returns a 503 meta payload when the meta provider throws', async () => {
    const server = await createTestServer({});
    await server.app.close();

    const rebuilt = await buildPlaygroundServer({
      loadEnv: false,
      envFiles: ['test.env'],
      logger: false,
      getAppServices: async () => {
        throw new Error('app services should not be called');
      },
      getRuntimeServices: async () => {
        throw new Error('runtime services should not be called');
      },
      getRuntimeMeta: () => {
        throw new Error('meta exploded');
      }
    });
    activeServers.push({
      app: rebuilt.app,
      tempDir: server.tempDir
    });

    const meta = await rebuilt.app.inject({
      method: 'GET',
      url: '/api/meta'
    });
    expect(meta.statusCode).toBe(503);
    expect(meta.json()).toMatchObject({
      runtimeConfigured: false,
      runtimeConfigError: 'meta exploded',
      dbMode: 'unavailable',
      dbConnection: 'unavailable'
    });
  });

  it('returns 401 for protected thread routes without a session', async () => {
    const server = await createTestServer({});
    activeServers.push(server);

    const listThreads = await server.app.inject({
      method: 'GET',
      url: '/api/threads'
    });
    expect(listThreads.statusCode).toBe(401);
    expect(listThreads.json()).toEqual({
      error: 'UNAUTHORIZED'
    });

    const createThreadResponse = await server.app.inject({
      method: 'POST',
      url: '/api/threads',
      payload: {
        title: 'Unauthorized Thread'
      }
    });
    expect(createThreadResponse.statusCode).toBe(401);
    expect(createThreadResponse.json()).toEqual({
      error: 'UNAUTHORIZED'
    });
  });

  it('creates threads, lists them, and loads thread messages', async () => {
    const server = await createTestServer({});
    activeServers.push(server);
    const sessionCookie = await registerAndSignIn(server, 'threads-list@example.com');

    const initialThreads = await server.app.inject({
      method: 'GET',
      url: '/api/threads',
      headers: {
        cookie: sessionCookie
      }
    });
    expect(initialThreads.statusCode).toBe(200);
    expect(initialThreads.headers['server-timing']).toContain('threads_list;dur=');
    expect(initialThreads.json()).toEqual({
      threads: []
    });

    const created = await server.app.inject({
      method: 'POST',
      url: '/api/threads',
      headers: {
        cookie: sessionCookie
      },
      payload: {
        title: 'Integration Thread'
      }
    });
    expect(created.statusCode).toBe(200);
    const threadId = created.json().thread.id as string;

    const threads = await server.app.inject({
      method: 'GET',
      url: '/api/threads',
      headers: {
        cookie: sessionCookie
      }
    });
    expect(threads.json().threads).toHaveLength(1);
    expect(threads.json().threads[0]).toMatchObject({
      id: threadId,
      title: 'Integration Thread',
      runtimeProvider: null,
      runtimeModel: null
    });

    const messages = await server.app.inject({
      method: 'GET',
      url: `/api/threads/${threadId}/messages`,
      headers: {
        cookie: sessionCookie
      }
    });
    expect(messages.statusCode).toBe(200);
    expect(messages.headers['server-timing']).toContain('messages_get;dur=');
    expect(messages.json()).toEqual({
      messages: [],
      activeRun: null
    });
  });

  it('filters policy-only tool attempts from thread messages responses', async () => {
    const server = await createTestServer({});
    activeServers.push(server);
    const sessionCookie = await registerAndSignIn(server, 'policy-filter@example.com');
    const threadId = await createThread(server, sessionCookie, 'Policy Filter Thread');

    await server.appServices.repos.runRepo.create({
      id: 'run-policy-1',
      threadId,
      triggerMessageId: null,
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      status: 'completed',
      usage: null,
      error: null,
      startedAt: new Date('2026-05-11T10:00:00.000Z'),
      finishedAt: new Date('2026-05-11T10:00:02.000Z')
    });

    await server.appServices.repos.messageRepo.create({
      id: 'user-policy-1',
      threadId,
      runId: null,
      role: 'user',
      seq: 1,
      status: 'completed',
      metadata: null
    });
    await server.appServices.repos.messageRepo.createPart({
      id: 'user-policy-1:text',
      messageId: 'user-policy-1',
      partIndex: 0,
      type: 'text',
      textValue: '和我说一说速水玲香这个人物吧',
      jsonValue: null
    });

    await server.appServices.repos.messageRepo.create({
      id: 'tool-policy-call-1',
      threadId,
      runId: 'run-policy-1',
      role: 'tool',
      seq: 2,
      status: 'completed',
      metadata: null
    });
    await server.appServices.repos.messageRepo.createPart({
      id: 'tool-policy-call-1:call',
      messageId: 'tool-policy-call-1',
      partIndex: 0,
      type: 'tool-call',
      textValue: null,
      jsonValue: {
        toolName: 'searchWeb',
        toolCallId: 'call-policy-1',
        input: { query: '速水玲香 人物' }
      }
    });
    await server.appServices.repos.messageRepo.create({
      id: 'tool-policy-result-1',
      threadId,
      runId: 'run-policy-1',
      role: 'tool',
      seq: 3,
      status: 'completed',
      metadata: null
    });
    await server.appServices.repos.messageRepo.createPart({
      id: 'tool-policy-result-1:result',
      messageId: 'tool-policy-result-1',
      partIndex: 0,
      type: 'tool-result',
      textValue: null,
      jsonValue: {
        toolName: 'searchWeb',
        toolCallId: 'call-policy-1',
        details: {
          status: 'blocked_by_policy',
          reason: 'duplicate_query',
          message: 'Search results are already available. Open a selected page instead of starting another search.',
          allowedNextTools: ['openUrl']
        }
      }
    });

    const response = await server.app.inject({
      method: 'GET',
      url: `/api/threads/${threadId}/messages`,
      headers: {
        cookie: sessionCookie
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      messages: [
        expect.objectContaining({
          id: 'user-policy-1',
          role: 'user'
        })
      ],
      activeRun: null
    });
  });

  it('loads a single accessible thread without refetching the full thread list', async () => {
    const server = await createTestServer({});
    activeServers.push(server);
    const sessionCookie = await registerAndSignIn(server, 'thread-get@example.com');

    const created = await server.app.inject({
      method: 'POST',
      url: '/api/threads',
      headers: {
        cookie: sessionCookie
      },
      payload: {
        title: 'Single Thread Read'
      }
    });
    expect(created.statusCode).toBe(200);
    const threadId = created.json().thread.id as string;

    const thread = await server.app.inject({
      method: 'GET',
      url: `/api/threads/${threadId}`,
      headers: {
        cookie: sessionCookie
      }
    });
    expect(thread.statusCode).toBe(200);
    expect(thread.headers['server-timing']).toContain('threads_get;dur=');
    expect(thread.json()).toEqual({
      thread: expect.objectContaining({
        id: threadId,
        title: 'Single Thread Read',
        runtimeProvider: null,
        runtimeModel: null
      })
    });
  });

  it('adds runtime binding columns when bootstrapping an existing sqlite catalog table', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'playground-fastify-server-bootstrap-test-'));
    const sqlitePath = path.join(tempDir, 'test.db');

    try {
      await withSqlitePath(sqlitePath, async () => {
        const dbConfig = createDbConfigFromEnv();
        await dbConfig.bootstrapSchema();
        dbConfig.db.$client.exec(`
          CREATE TABLE IF NOT EXISTS playground_thread_catalog (
            thread_id text PRIMARY KEY NOT NULL,
            app_id text NOT NULL,
            owner_user_id text NOT NULL,
            pinned_at integer,
            created_at integer NOT NULL,
            updated_at integer NOT NULL
          )
        `);

        await bootstrapPlaygroundThreadCatalog(dbConfig);

        const columns = dbConfig.db.$client
          .prepare<{ name: string }, []>('PRAGMA table_info(playground_thread_catalog)')
          .all()
          .map((column) => column.name);

        expect(columns).toContain('runtime_provider');
        expect(columns).toContain('runtime_model');
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('writes the authenticated owner id into the catalog and isolates threads by owner', async () => {
    const server = await createTestServer({});
    activeServers.push(server);

    const ownerCookie = await registerAndSignIn(server, 'owner@example.com');
    const otherCookie = await registerAndSignIn(server, 'other@example.com');
    const threadId = await createThread(server, ownerCookie, 'Owned Thread');

    const ownerMe = await server.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        cookie: ownerCookie
      }
    });
    expect(ownerMe.statusCode).toBe(200);
    const ownerUserId = ownerMe.json().user.id as string;

    const catalogRepo = new PlaygroundThreadCatalogRepo(server.appServices.dbConfig);
    const catalogRow = await catalogRepo.findByThreadId(threadId);
    expect(catalogRow?.ownerUserId).toBe(ownerUserId);

    const otherThreads = await server.app.inject({
      method: 'GET',
      url: '/api/threads',
      headers: {
        cookie: otherCookie
      }
    });
    expect(otherThreads.statusCode).toBe(200);
    expect(otherThreads.json()).toEqual({
      threads: []
    });

    const otherMessages = await server.app.inject({
      method: 'GET',
      url: `/api/threads/${threadId}/messages`,
      headers: {
        cookie: otherCookie
      }
    });
    expect(otherMessages.statusCode).toBe(404);
    expect(otherMessages.json()).toMatchObject({
      error: `thread ${threadId} not found`
    });

    const otherThread = await server.app.inject({
      method: 'GET',
      url: `/api/threads/${threadId}`,
      headers: {
        cookie: otherCookie
      }
    });
    expect(otherThread.statusCode).toBe(404);
    expect(otherThread.json()).toMatchObject({
      error: `thread ${threadId} not found`
    });
  });

  it('renames threads and rejects blank titles', async () => {
    const server = await createTestServer({});
    activeServers.push(server);
    const sessionCookie = await registerAndSignIn(server, 'rename@example.com');

    const threadId = await createThread(server, sessionCookie, 'Original Thread');

    const renamed = await server.app.inject({
      method: 'PATCH',
      url: `/api/threads/${threadId}`,
      headers: {
        cookie: sessionCookie
      },
      payload: {
        title: '  Renamed Thread  '
      }
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.headers['server-timing']).toContain('threads_rename;dur=');
    expect(renamed.json().thread).toMatchObject({
      id: threadId,
      title: 'Renamed Thread'
    });

    const threads = await server.app.inject({
      method: 'GET',
      url: '/api/threads',
      headers: {
        cookie: sessionCookie
      }
    });
    expect(threads.json().threads[0]).toMatchObject({
      id: threadId,
      title: 'Renamed Thread'
    });

    const invalid = await server.app.inject({
      method: 'PATCH',
      url: `/api/threads/${threadId}`,
      headers: {
        cookie: sessionCookie
      },
      payload: {
        title: '   '
      }
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({
      error: 'thread title is required'
    });
  });

  it('archives threads, removes them from list reads, and keeps active shares readable', async () => {
    const server = await createTestServer({});
    activeServers.push(server);
    const sessionCookie = await registerAndSignIn(server, 'archive@example.com');

    const threadId = await createThread(server, sessionCookie, 'Archive me');
    await streamSuccessfulTurn(server, sessionCookie, threadId, 'hello');

    const createdShare = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/shares`,
      headers: {
        cookie: sessionCookie
      }
    });
    const publicId = createdShare.json().share.publicId as string;

    const archived = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/archive`,
      headers: {
        cookie: sessionCookie
      }
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.headers['server-timing']).toContain('threads_archive;dur=');
    expect(archived.json().thread).toMatchObject({
      id: threadId,
      status: 'archived'
    });
    expect(archived.json().thread.archivedAt).toBeTruthy();

    const threads = await server.app.inject({
      method: 'GET',
      url: '/api/threads',
      headers: {
        cookie: sessionCookie
      }
    });
    expect(threads.json().threads).toEqual([]);

    const publicShare = await server.app.inject({
      method: 'GET',
      url: `/api/shares/${publicId}`
    });
    expect(publicShare.statusCode).toBe(200);
    expect(publicShare.json().share.publicId).toBe(publicId);
  });

  it('rejects pin operations for threads outside the playground app scope', async () => {
    const server = await createTestServer({});
    activeServers.push(server);
    const sessionCookie = await registerAndSignIn(server, 'pin-foreign@example.com');

    const foreignThread = await server.appServices.repos.threadRepo.create({
      id: 'foreign-thread',
      appId: 'foreign-app',
      userId: null,
      title: 'Foreign Thread',
      status: 'active',
      metadata: null,
      archivedAt: null
    });

    const pinResponse = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${foreignThread.id}/pin`,
      headers: {
        cookie: sessionCookie
      }
    });
    expect(pinResponse.statusCode).toBe(404);
    expect(pinResponse.json()).toMatchObject({
      error: `thread ${foreignThread.id} not found`
    });

    const unpinResponse = await server.app.inject({
      method: 'DELETE',
      url: `/api/threads/${foreignThread.id}/pin`,
      headers: {
        cookie: sessionCookie
      }
    });
    expect(unpinResponse.statusCode).toBe(404);
    expect(unpinResponse.json()).toMatchObject({
      error: `thread ${foreignThread.id} not found`
    });
  });

  it('streams a successful turn and persists the assistant reply', async () => {
    const server = await createTestServer({});
    activeServers.push(server);
    const sessionCookie = await registerAndSignIn(server, 'stream-success@example.com');

    const created = await server.app.inject({
      method: 'POST',
      url: '/api/threads',
      headers: {
        cookie: sessionCookie
      },
      payload: {
        title: 'Streaming Thread'
      }
    });
    const threadId = created.json().thread.id as string;

    const stream = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/runs/stream`,
      headers: {
        cookie: sessionCookie
      },
      payload: {
        text: 'hello'
      }
    });
    expect(stream.statusCode).toBe(200);
    expect(stream.headers['content-type']).toContain('text/event-stream');
    expect(stream.headers['x-request-id']).toBeTruthy();
    expect(stream.headers['server-timing']).toContain('turns_start_text;dur=');

    const events = parseSsePayloads(stream.body);
    expect(events.map((event) => event.type)).toEqual([
      'run.ready',
      'run.state',
      'run.assistant',
      'run.state',
      'run.completed'
    ]);

    const messages = await server.app.inject({
      method: 'GET',
      url: `/api/threads/${threadId}/messages`,
      headers: {
        cookie: sessionCookie
      }
    });
    expect(messages.statusCode).toBe(200);
    expect(messages.json().messages.map((message: { role: string }) => message.role)).toEqual(['user', 'assistant']);
    expect(messages.json().messages[1].parts[0].textValue).toBe('Hello from fake runtime');

    const catalogRepo = new PlaygroundThreadCatalogRepo(server.appServices.dbConfig);
    const catalogRow = await catalogRepo.findByThreadId(threadId);
    expect(catalogRow).toMatchObject({
      runtimeProvider: 'deepseek',
      runtimeModel: 'deepseek-v4-flash'
    });
  });

  it('binds the thread runtime from the resolved runtime selection on first send', async () => {
    const server = await createTestServer({});
    activeServers.push(server);
    const sessionCookie = await registerAndSignIn(server, 'stream-binding@example.com');
    const threadId = await createThread(server, sessionCookie, 'Binding Thread');

    const stream = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/runs/stream`,
      headers: {
        cookie: sessionCookie
      },
      payload: {
        text: 'hello',
        provider: 'openai',
        model: 'gpt-5.5'
      }
    });
    expect(stream.statusCode).toBe(200);

    const catalogRepo = new PlaygroundThreadCatalogRepo(server.appServices.dbConfig);
    const catalogRow = await catalogRepo.findByThreadId(threadId);
    expect(catalogRow).toMatchObject({
      runtimeProvider: 'openai',
      runtimeModel: 'gpt-5.5'
    });
  });

  it('forces subsequent sends to reuse the existing thread runtime binding', async () => {
    const server = await createTestServer({});
    activeServers.push(server);
    const sessionCookie = await registerAndSignIn(server, 'stream-reuse-binding@example.com');
    const threadId = await createThread(server, sessionCookie, 'Bound Thread');

    const firstStream = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/runs/stream`,
      headers: {
        cookie: sessionCookie
      },
      payload: {
        text: 'bind me',
        provider: 'deepseek',
        model: 'deepseek-v4-pro'
      }
    });
    expect(firstStream.statusCode).toBe(200);

    const secondStream = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/runs/stream`,
      headers: {
        cookie: sessionCookie
      },
      payload: {
        text: 'try to switch',
        provider: 'openai',
        model: 'gpt-5.5'
      }
    });
    expect(secondStream.statusCode).toBe(200);

    const events = parseSsePayloads(secondStream.body);
    expect(events[0]).toMatchObject({
      type: 'run.ready',
      run: expect.objectContaining({
        provider: 'deepseek',
        model: 'deepseek-v4-pro'
      })
    });

    const catalogRepo = new PlaygroundThreadCatalogRepo(server.appServices.dbConfig);
    const catalogRow = await catalogRepo.findByThreadId(threadId);
    expect(catalogRow).toMatchObject({
      runtimeProvider: 'deepseek',
      runtimeModel: 'deepseek-v4-pro'
    });
  });

  it('auto-titles a default-title thread after a completed run', async () => {
    const threadTitleGenerator = new RecordingThreadTitleGenerator('验证码问题排查');
    const server = await createTestServer({
      threadTitleGenerator
    });
    activeServers.push(server);
    const sessionCookie = await registerAndSignIn(server, 'auto-title@example.com');

    const created = await server.app.inject({
      method: 'POST',
      url: '/api/threads',
      headers: {
        cookie: sessionCookie
      },
      payload: {}
    });
    expect(created.statusCode).toBe(200);
    const threadId = created.json().thread.id as string;
    expect(created.json().thread.title).toBe('New Thread');

    const stream = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/runs/stream`,
      headers: {
        cookie: sessionCookie
      },
      payload: {
        text: '这个验证码为什么一直收不到？'
      }
    });
    expect(stream.statusCode).toBe(200);

    await vi.waitFor(async () => {
      expect(threadTitleGenerator.calls).toHaveLength(1);
      const thread = await server.appServices.repos.threadRepo.findById(threadId);
      expect(thread?.title).toBe('验证码问题排查');
    });
  });

  it('does not auto-title a thread that already has a non-default title', async () => {
    const threadTitleGenerator = new RecordingThreadTitleGenerator('不应写回');
    const server = await createTestServer({
      threadTitleGenerator
    });
    activeServers.push(server);
    const sessionCookie = await registerAndSignIn(server, 'auto-title-skip@example.com');

    const threadId = await createThread(server, sessionCookie, '手动标题');
    const stream = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/runs/stream`,
      headers: {
        cookie: sessionCookie
      },
      payload: {
        text: '这是一个已经命名的线程'
      }
    });
    expect(stream.statusCode).toBe(200);

    await vi.waitFor(async () => {
      const thread = await server.appServices.repos.threadRepo.findById(threadId);
      expect(thread?.title).toBe('手动标题');
    });
    expect(threadTitleGenerator.calls).toHaveLength(0);
  });

  it('does not overwrite a user rename that happens before auto-title writeback', async () => {
    const threadTitleGenerator = new DeferredThreadTitleGenerator();
    const server = await createTestServer({
      threadTitleGenerator
    });
    activeServers.push(server);
    const sessionCookie = await registerAndSignIn(server, 'auto-title-race@example.com');

    const created = await server.app.inject({
      method: 'POST',
      url: '/api/threads',
      headers: {
        cookie: sessionCookie
      },
      payload: {}
    });
    expect(created.statusCode).toBe(200);
    const threadId = created.json().thread.id as string;

    const stream = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/runs/stream`,
      headers: {
        cookie: sessionCookie
      },
      payload: {
        text: '我想知道验证码的风控规则'
      }
    });
    expect(stream.statusCode).toBe(200);

    await vi.waitFor(() => {
      expect(threadTitleGenerator.calls).toHaveLength(1);
    });

    const renamed = await server.app.inject({
      method: 'PATCH',
      url: `/api/threads/${threadId}`,
      headers: {
        cookie: sessionCookie
      },
      payload: {
        title: '用户手动标题'
      }
    });
    expect(renamed.statusCode).toBe(200);

    threadTitleGenerator.resolve('自动标题候选');

    await vi.waitFor(async () => {
      const thread = await server.appServices.repos.threadRepo.findById(threadId);
      expect(thread?.title).toBe('用户手动标题');
    });
  });

  it('does not fail the main turn when auto-title generation throws', async () => {
    const threadTitleGenerator = new FailingThreadTitleGenerator();
    const server = await createTestServer({
      threadTitleGenerator
    });
    activeServers.push(server);
    const sessionCookie = await registerAndSignIn(server, 'auto-title-failure@example.com');

    const created = await server.app.inject({
      method: 'POST',
      url: '/api/threads',
      headers: {
        cookie: sessionCookie
      },
      payload: {}
    });
    expect(created.statusCode).toBe(200);
    const threadId = created.json().thread.id as string;

    const stream = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/runs/stream`,
      headers: {
        cookie: sessionCookie
      },
      payload: {
        text: '请解释验证码发送失败的原因'
      }
    });
    expect(stream.statusCode).toBe(200);

    await vi.waitFor(() => {
      expect(threadTitleGenerator.calls).toHaveLength(1);
    });

    const messages = await server.app.inject({
      method: 'GET',
      url: `/api/threads/${threadId}/messages`,
      headers: {
        cookie: sessionCookie
      }
    });
    expect(messages.statusCode).toBe(200);

    const thread = await server.appServices.repos.threadRepo.findById(threadId);
    expect(thread?.title).toBe('New Thread');
  });

  it('emits run.failed when the runtime marks the run as failed', async () => {
    const server = await createTestServer({
      runtimeMode: 'failure'
    });
    activeServers.push(server);
    const sessionCookie = await registerAndSignIn(server, 'stream-failure@example.com');

    const created = await server.app.inject({
      method: 'POST',
      url: '/api/threads',
      headers: {
        cookie: sessionCookie
      },
      payload: {
        title: 'Failing Stream Thread'
      }
    });
    const threadId = created.json().thread.id as string;

    const stream = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/runs/stream`,
      headers: {
        cookie: sessionCookie
      },
      payload: {
        text: 'hello'
      }
    });
    expect(stream.statusCode).toBe(200);

    const events = parseSsePayloads(stream.body);
    expect(events.at(-1)).toMatchObject({
      type: 'run.failed',
      error: 'fake runtime failure'
    });
  });

  it('rejects web-search turns when Tavily is unavailable', async () => {
    const previousTavilyApiKey = process.env.TAVILY_API_KEY;
    delete process.env.TAVILY_API_KEY;

    try {
      const server = await createTestServer({});
      activeServers.push(server);
      const sessionCookie = await registerAndSignIn(server, 'web-search@example.com');

      const created = await server.app.inject({
        method: 'POST',
        url: '/api/threads',
        headers: {
          cookie: sessionCookie
        },
        payload: {
          title: 'Web Search Unavailable'
        }
      });
      const threadId = created.json().thread.id as string;

      const stream = await server.app.inject({
        method: 'POST',
        url: `/api/threads/${threadId}/runs/stream`,
        headers: {
          cookie: sessionCookie
        },
        payload: {
          text: '搜索 Claude 新闻',
          webSearchEnabled: true
        }
      });

      expect(stream.statusCode).toBe(503);
      expect(stream.json()).toMatchObject({
        error: 'Web search is unavailable because TAVILY_API_KEY is not configured.'
      });
    } finally {
      if (previousTavilyApiKey === undefined) {
        delete process.env.TAVILY_API_KEY;
      } else {
        process.env.TAVILY_API_KEY = previousTavilyApiKey;
      }
    }
  });

  it('creates a thread share and returns it as the current share', async () => {
    const server = await createTestServer({});
    activeServers.push(server);
    const sessionCookie = await registerAndSignIn(server, 'share-current@example.com');

    const threadId = await createThread(server, sessionCookie, 'Shareable Thread');
    await streamSuccessfulTurn(server, sessionCookie, threadId, 'hello');

    const createdShare = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/shares`,
      headers: {
        cookie: sessionCookie
      }
    });
    expect(createdShare.statusCode).toBe(200);
    expect(createdShare.headers['server-timing']).toContain('shares_create;dur=');

    const createdBody = createdShare.json();
    expect(createdBody.share).toMatchObject({
      sourceThreadId: threadId,
      scopeType: 'thread',
      status: 'active'
    });
    expect(createdBody.share.publicId).toBeTruthy();

    const currentShare = await server.app.inject({
      method: 'GET',
      url: `/api/threads/${threadId}/shares/current`,
      headers: {
        cookie: sessionCookie
      }
    });
    expect(currentShare.statusCode).toBe(200);
    expect(currentShare.headers['server-timing']).toContain('shares_current;dur=');
    expect(currentShare.json()).toEqual({
      share: createdBody.share
    });
  });

  it('returns a public thread snapshot for an active share', async () => {
    const server = await createTestServer({});
    activeServers.push(server);
    const sessionCookie = await registerAndSignIn(server, 'share-public@example.com');

    const threadId = await createThread(server, sessionCookie, 'Public Share Thread');
    await streamSuccessfulTurn(server, sessionCookie, threadId, 'hello');

    const createdShare = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/shares`,
      headers: {
        cookie: sessionCookie
      }
    });
    const publicId = createdShare.json().share.publicId as string;

    const publicShare = await server.app.inject({
      method: 'GET',
      url: `/api/shares/${publicId}`
    });
    expect(publicShare.statusCode).toBe(200);
    expect(publicShare.headers['server-timing']).toContain('shares_public;dur=');
    expect(publicShare.json()).toMatchObject({
      share: {
        publicId,
        scopeType: 'thread',
        status: 'active',
        snapshot: {
          payloadFormat: 'messages_v1',
          payloadVersion: 1,
          title: 'Public Share Thread'
        }
      }
    });
    expect(publicShare.json().share.snapshot.messages.map((message: { role: string }) => message.role)).toEqual([
      'user',
      'assistant'
    ]);
  });

  it('filters policy-only tool attempts from public share snapshots', async () => {
    const server = await createTestServer({});
    activeServers.push(server);
    const sessionCookie = await registerAndSignIn(server, 'share-policy-filter@example.com');
    const threadId = await createThread(server, sessionCookie, 'Public Share Policy Filter');

    await server.appServices.repos.runRepo.create({
      id: 'run-share-policy-1',
      threadId,
      triggerMessageId: null,
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      status: 'completed',
      usage: null,
      error: null,
      startedAt: new Date('2026-05-11T10:00:00.000Z'),
      finishedAt: new Date('2026-05-11T10:00:02.000Z')
    });

    await server.appServices.repos.messageRepo.create({
      id: 'share-user-1',
      threadId,
      runId: null,
      role: 'user',
      seq: 1,
      status: 'completed',
      metadata: null
    });
    await server.appServices.repos.messageRepo.createPart({
      id: 'share-user-1:text',
      messageId: 'share-user-1',
      partIndex: 0,
      type: 'text',
      textValue: '和我说一说速水玲香这个人物吧',
      jsonValue: null
    });

    await server.appServices.repos.messageRepo.create({
      id: 'share-tool-policy-call-1',
      threadId,
      runId: 'run-share-policy-1',
      role: 'tool',
      seq: 2,
      status: 'completed',
      metadata: null
    });
    await server.appServices.repos.messageRepo.createPart({
      id: 'share-tool-policy-call-1:call',
      messageId: 'share-tool-policy-call-1',
      partIndex: 0,
      type: 'tool-call',
      textValue: null,
      jsonValue: {
        toolName: 'searchWeb',
        toolCallId: 'call-share-policy-1',
        input: { query: '速水玲香 人物' }
      }
    });
    await server.appServices.repos.messageRepo.create({
      id: 'share-tool-policy-result-1',
      threadId,
      runId: 'run-share-policy-1',
      role: 'tool',
      seq: 3,
      status: 'completed',
      metadata: null
    });
    await server.appServices.repos.messageRepo.createPart({
      id: 'share-tool-policy-result-1:result',
      messageId: 'share-tool-policy-result-1',
      partIndex: 0,
      type: 'tool-result',
      textValue: null,
      jsonValue: {
        toolName: 'searchWeb',
        toolCallId: 'call-share-policy-1',
        details: {
          status: 'redirected_by_policy',
          message: 'Search results are already available. Open a selected page instead of starting another search.',
          suggestedToolCall: {
            name: 'openUrl',
            args: { url: 'https://example.com/character' }
          }
        }
      }
    });

    const createdShare = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/shares`,
      headers: {
        cookie: sessionCookie
      }
    });
    const publicId = createdShare.json().share.publicId as string;

    const publicShare = await server.app.inject({
      method: 'GET',
      url: `/api/shares/${publicId}`
    });

    expect(publicShare.statusCode).toBe(200);
    expect(publicShare.json().share.snapshot.messages).toEqual([
      expect.objectContaining({
        role: 'user'
      })
    ]);
  });

  it('revokes a share and makes subsequent public reads return 410', async () => {
    const server = await createTestServer({});
    activeServers.push(server);
    const sessionCookie = await registerAndSignIn(server, 'share-revoke@example.com');

    const threadId = await createThread(server, sessionCookie, 'Revokable Share Thread');
    await streamSuccessfulTurn(server, sessionCookie, threadId, 'hello');

    const createdShare = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/shares`,
      headers: {
        cookie: sessionCookie
      }
    });
    const publicId = createdShare.json().share.publicId as string;

    const revoked = await server.app.inject({
      method: 'POST',
      url: `/api/shares/${publicId}/revoke`,
      headers: {
        cookie: sessionCookie
      }
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.headers['server-timing']).toContain('shares_revoke;dur=');
    expect(revoked.json().share).toMatchObject({
      publicId,
      status: 'revoked'
    });

    const publicShare = await server.app.inject({
      method: 'GET',
      url: `/api/shares/${publicId}`
    });
    expect(publicShare.statusCode).toBe(410);
    expect(publicShare.json()).toMatchObject({
      error: `chat share ${publicId} has been revoked`
    });
  });

  it('rejects share creation when the thread has an active run', async () => {
    const server = await createTestServer({});
    activeServers.push(server);
    const sessionCookie = await registerAndSignIn(server, 'share-active-run@example.com');

    const threadId = await createThread(server, sessionCookie, 'Busy Share Thread');
    const started = await server.appServices.app.turns.startText({
      threadId,
      text: 'hello'
    });

    const createdShare = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/shares`,
      headers: {
        cookie: sessionCookie
      }
    });
    expect(createdShare.statusCode).toBe(409);
    expect(createdShare.json()).toMatchObject({
      error: `thread ${threadId} has an active run`
    });
    await server.appServices.app.runs.getTimeline({ runId: started.run.id });
  });
});
