import { describe, expect, it, vi } from 'vitest';

import type { PlaygroundThreadCatalogRow } from '@/features/thread-catalog/repo/thread-catalog-repo';
import type { PlaygroundAppServices } from './playground-base-services';
import {
  buildUnauthorizedResponse,
  resolveThreadRuntimeBinding
} from './playground-thread-access';

function catalogRow(overrides: Partial<PlaygroundThreadCatalogRow> = {}): PlaygroundThreadCatalogRow {
  return {
    threadId: 'thread-1',
    appId: 'playground-runtime-pi',
    ownerUserId: 'user-1',
    pinnedAt: null,
    runtimeProvider: null,
    runtimeModel: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides
  };
}

describe('playground thread access helpers', () => {
  it('returns a stable unauthorized response shape', async () => {
    const response = buildUnauthorizedResponse();

    await expect(response.json()).resolves.toEqual({ error: 'UNAUTHORIZED' });
    expect(response.status).toBe(401);
  });

  it('prefers catalog runtime binding over latest run fallback', async () => {
    const listByThread = vi.fn();
    const services = {
      repos: {
        runRepo: {
          listByThread
        }
      }
    } as unknown as PlaygroundAppServices;

    await expect(
      resolveThreadRuntimeBinding(
        services,
        'thread-1',
        catalogRow({ runtimeProvider: 'deepseek', runtimeModel: 'deepseek-chat' })
      )
    ).resolves.toEqual({
      provider: 'deepseek',
      model: 'deepseek-chat'
    });
    expect(listByThread).not.toHaveBeenCalled();
  });

  it('falls back to the latest run runtime binding when catalog is unset', async () => {
    const services = {
      repos: {
        runRepo: {
          listByThread: vi.fn().mockResolvedValue([
            {
              provider: 'openai',
              model: 'gpt-4o-mini'
            }
          ])
        }
      }
    } as unknown as PlaygroundAppServices;

    await expect(resolveThreadRuntimeBinding(services, 'thread-1', catalogRow())).resolves.toEqual({
      provider: 'openai',
      model: 'gpt-4o-mini'
    });
  });
});
