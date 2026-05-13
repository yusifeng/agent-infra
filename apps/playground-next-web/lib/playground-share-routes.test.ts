import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PublicChatShareResult } from '@agent-infra/app';

function publicShareResult(): PublicChatShareResult {
  return {
    share: {
      id: 'share-1',
      publicId: 'public-1',
      sourceThreadId: 'thread-1',
      scopeType: 'thread',
      status: 'active',
      snapshotId: 'snapshot-1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      revokedAt: null
    },
    snapshot: {
      payloadFormat: 'messages_v1',
      payloadVersion: 1,
      title: 'Shared thread',
      messages: [],
      searchBundles: null
    }
  };
}

describe('public share route', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/playground-app-services');
    vi.resetModules();
  });

  it('loads public shares without requiring a session', async () => {
    const getPublic = vi.fn().mockResolvedValue(publicShareResult());
    vi.doMock('@/lib/playground-app-services', () => ({
      getPlaygroundAppServices: vi.fn().mockResolvedValue({
        app: {
          shares: {
            getPublic
          }
        }
      })
    }));

    const { GET } = await import('../app/api/shares/[publicId]/route');
    const response = await GET(new Request('http://localhost/api/shares/public-1'), {
      params: Promise.resolve({ publicId: 'public-1' })
    });

    await expect(response.json()).resolves.toEqual({
      share: {
        publicId: 'public-1',
        scopeType: 'thread',
        status: 'active',
        createdAt: '2026-01-01T00:00:00.000Z',
        snapshot: {
          payloadFormat: 'messages_v1',
          payloadVersion: 1,
          title: 'Shared thread',
          messages: [],
          searchBundles: null
        }
      }
    });
    expect(response.status).toBe(200);
    expect(getPublic).toHaveBeenCalledWith({ publicId: 'public-1' });
  });
});
