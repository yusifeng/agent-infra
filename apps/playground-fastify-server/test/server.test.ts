import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { AgentInfraRuntimePort } from '@agent-infra/app';
import { createDbConfigFromEnv } from '@agent-infra/db';
import type { RuntimePiRuntime } from '@agent-infra/runtime-pi/types';
import { afterEach, describe, expect, it } from 'vitest';

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
        eventType: 'text_delta',
        partialText: mode === 'success' ? 'Hello from fake runtime' : '',
        partialReasoning: null
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
        await options?.onLiveAssistantUpdate?.({
          messageId: assistantMessage.id,
          eventType: 'text_end',
          partialText: 'Hello from fake runtime',
          partialReasoning: null
        });

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
      tempDir
    };
  });

  return serverBundle;
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
});
