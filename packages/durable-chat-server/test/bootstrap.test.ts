import { describe, expect, it, vi } from 'vitest';

import type { AgentInfraRuntimePort } from '@agent-infra/app';

import { createDurableChatAppServices, createDurableChatBaseServices } from '../src/index';

describe('durable chat server bootstrap', () => {
  it('creates base services from a db config', async () => {
    const bootstrapSchema = vi.fn(async () => {});
    const dbConfig = {
      mode: 'postgres' as const,
      db: {
        transaction: vi.fn(async (callback: (db: unknown) => Promise<string>) => callback({ kind: 'tx' }))
      },
      connectionString: 'postgres://example.test/agent-infra',
      bootstrapSchema
    };

    const services = await createDurableChatBaseServices(dbConfig);

    expect(bootstrapSchema).toHaveBeenCalledTimes(1);
    expect(services.dbInfo).toEqual({
      mode: 'postgres',
      connectionString: 'postgres://example.test/agent-infra'
    });
    expect(services.repos.threadRepo).toBeDefined();
    expect(typeof services.transaction).toBe('function');
  });

  it('creates app services that reuse the injected repositories and transaction', async () => {
    const createThread = vi.fn(async (input: any) => ({
      ...input,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z')
    }));
    const listByApp = vi.fn(async () => []);
    const base = {
      dbConfig: {
        mode: 'sqlite' as const,
        db: {},
        connectionString: 'file:test.db',
        bootstrapSchema: async () => {},
        sqlitePath: '/tmp/test.db'
      },
      dbInfo: {
        mode: 'sqlite' as const,
        connectionString: 'file:test.db'
      },
      repos: {
        threadRepo: {
          create: createThread,
          findById: vi.fn(async () => null),
          listByApp
        },
        runRepo: {
          create: vi.fn(),
          findById: vi.fn(),
          listByThread: vi.fn(),
          updateStatus: vi.fn()
        },
        messageRepo: {
          create: vi.fn(),
          updateStatus: vi.fn(),
          createPart: vi.fn(),
          listByThread: vi.fn(),
          nextSeq: vi.fn()
        },
        toolRepo: {
          create: vi.fn(),
          updateStatus: vi.fn(),
          listByRun: vi.fn()
        },
        runEventRepo: {
          append: vi.fn(),
          listByRun: vi.fn(),
          nextSeq: vi.fn()
        }
      },
      transaction: vi.fn(async (operation) => operation(base.repos))
    };
    const runtime: AgentInfraRuntimePort = {
      prepare: vi.fn(async () => ({ provider: 'deepseek', model: 'deepseek-v4-flash' })),
      runTextTurn: vi.fn(async () => {})
    };

    const services = createDurableChatAppServices(base, runtime, {
      idGenerator: () => 'thread-1',
      now: () => new Date('2026-01-01T00:00:00.000Z')
    });

    const thread = await services.app.threads.create({
      appId: 'playground',
      title: 'Bootstrap thread'
    });

    expect(createThread).toHaveBeenCalledWith({
      id: 'thread-1',
      appId: 'playground',
      title: 'Bootstrap thread',
      userId: null,
      status: 'active',
      metadata: null,
      archivedAt: null
    });
    expect(thread.id).toBe('thread-1');
  });
});
