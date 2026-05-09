import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { AgentInfraRuntimePort } from '@agent-infra/app';
import { createDbConfigFromEnv } from '@agent-infra/db';
import type { RuntimePiRuntime } from '@agent-infra/runtime-pi/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildPlaygroundServer } from '../src/app.js';
import { createPlaygroundAppServices } from '../src/playground-base-services.js';
import { getPlaygroundMeta, type PlaygroundMeta } from '../src/playground-meta.js';
import { createDurableChatBaseServices } from '@agent-infra/durable-chat-server';

const envKeys = ['SQLITE_PATH', 'DATABASE_URL', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'] as const;

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
}) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'playground-fastify-server-test-'));
  const sqlitePath = path.join(tempDir, 'test.db');

  const serverBundle = await withSqlitePath(sqlitePath, async () => {
    const dbConfig = createDbConfigFromEnv();
    await dbConfig.bootstrapSchema();
    const base = await createDurableChatBaseServices(dbConfig);
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
      getRuntimeMeta: () => meta
    });

    return {
      app: built.app,
      appServices,
      tempDir
    };
  });

  return serverBundle;
}

async function createThread(server: Awaited<ReturnType<typeof createTestServer>>, title: string) {
  const created = await server.app.inject({
    method: 'POST',
    url: '/api/threads',
    payload: { title }
  });

  expect(created.statusCode).toBe(200);
  return created.json().thread.id as string;
}

async function streamSuccessfulTurn(server: Awaited<ReturnType<typeof createTestServer>>, threadId: string, text: string) {
  const stream = await server.app.inject({
    method: 'POST',
    url: `/api/threads/${threadId}/runs/stream`,
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

  it('creates threads, lists them, and loads thread messages', async () => {
    const server = await createTestServer({});
    activeServers.push(server);

    const initialThreads = await server.app.inject({
      method: 'GET',
      url: '/api/threads'
    });
    expect(initialThreads.statusCode).toBe(200);
    expect(initialThreads.headers['server-timing']).toContain('threads_list;dur=');
    expect(initialThreads.json()).toEqual({
      threads: []
    });

    const created = await server.app.inject({
      method: 'POST',
      url: '/api/threads',
      payload: {
        title: 'Integration Thread'
      }
    });
    expect(created.statusCode).toBe(200);
    const threadId = created.json().thread.id as string;

    const threads = await server.app.inject({
      method: 'GET',
      url: '/api/threads'
    });
    expect(threads.json().threads).toHaveLength(1);
    expect(threads.json().threads[0]).toMatchObject({
      id: threadId,
      title: 'Integration Thread'
    });

    const messages = await server.app.inject({
      method: 'GET',
      url: `/api/threads/${threadId}/messages`
    });
    expect(messages.statusCode).toBe(200);
    expect(messages.headers['server-timing']).toContain('messages_get;dur=');
    expect(messages.json()).toEqual({
      messages: [],
      activeRun: null
    });
  });

  it('renames threads and rejects blank titles', async () => {
    const server = await createTestServer({});
    activeServers.push(server);

    const threadId = await createThread(server, 'Original Thread');

    const renamed = await server.app.inject({
      method: 'PATCH',
      url: `/api/threads/${threadId}`,
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
      url: '/api/threads'
    });
    expect(threads.json().threads[0]).toMatchObject({
      id: threadId,
      title: 'Renamed Thread'
    });

    const invalid = await server.app.inject({
      method: 'PATCH',
      url: `/api/threads/${threadId}`,
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

    const threadId = await createThread(server, 'Archive me');
    await streamSuccessfulTurn(server, threadId, 'hello');

    const createdShare = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/shares`
    });
    const publicId = createdShare.json().share.publicId as string;

    const archived = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/archive`
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
      url: '/api/threads'
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
      url: `/api/threads/${foreignThread.id}/pin`
    });
    expect(pinResponse.statusCode).toBe(404);
    expect(pinResponse.json()).toMatchObject({
      error: `thread ${foreignThread.id} not found`
    });

    const unpinResponse = await server.app.inject({
      method: 'DELETE',
      url: `/api/threads/${foreignThread.id}/pin`
    });
    expect(unpinResponse.statusCode).toBe(404);
    expect(unpinResponse.json()).toMatchObject({
      error: `thread ${foreignThread.id} not found`
    });
  });

  it('streams a successful turn and persists the assistant reply', async () => {
    const server = await createTestServer({});
    activeServers.push(server);

    const created = await server.app.inject({
      method: 'POST',
      url: '/api/threads',
      payload: {
        title: 'Streaming Thread'
      }
    });
    const threadId = created.json().thread.id as string;

    const stream = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/runs/stream`,
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
      url: `/api/threads/${threadId}/messages`
    });
    expect(messages.statusCode).toBe(200);
    expect(messages.json().messages.map((message: { role: string }) => message.role)).toEqual(['user', 'assistant']);
    expect(messages.json().messages[1].parts[0].textValue).toBe('Hello from fake runtime');
  });

  it('emits run.failed when the runtime marks the run as failed', async () => {
    const server = await createTestServer({
      runtimeMode: 'failure'
    });
    activeServers.push(server);

    const created = await server.app.inject({
      method: 'POST',
      url: '/api/threads',
      payload: {
        title: 'Failing Stream Thread'
      }
    });
    const threadId = created.json().thread.id as string;

    const stream = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/runs/stream`,
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

      const created = await server.app.inject({
        method: 'POST',
        url: '/api/threads',
        payload: {
          title: 'Web Search Unavailable'
        }
      });
      const threadId = created.json().thread.id as string;

      const stream = await server.app.inject({
        method: 'POST',
        url: `/api/threads/${threadId}/runs/stream`,
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

    const threadId = await createThread(server, 'Shareable Thread');
    await streamSuccessfulTurn(server, threadId, 'hello');

    const createdShare = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/shares`
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
      url: `/api/threads/${threadId}/shares/current`
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

    const threadId = await createThread(server, 'Public Share Thread');
    await streamSuccessfulTurn(server, threadId, 'hello');

    const createdShare = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/shares`
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

  it('revokes a share and makes subsequent public reads return 410', async () => {
    const server = await createTestServer({});
    activeServers.push(server);

    const threadId = await createThread(server, 'Revokable Share Thread');
    await streamSuccessfulTurn(server, threadId, 'hello');

    const createdShare = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/shares`
    });
    const publicId = createdShare.json().share.publicId as string;

    const revoked = await server.app.inject({
      method: 'POST',
      url: `/api/shares/${publicId}/revoke`
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

    const threadId = await createThread(server, 'Busy Share Thread');
    const started = await server.appServices.app.turns.startText({
      threadId,
      text: 'hello'
    });

    const createdShare = await server.app.inject({
      method: 'POST',
      url: `/api/threads/${threadId}/shares`
    });
    expect(createdShare.statusCode).toBe(409);
    expect(createdShare.json()).toMatchObject({
      error: `thread ${threadId} has an active run`
    });
    await server.appServices.app.runs.getTimeline({ runId: started.run.id });
  });
});
