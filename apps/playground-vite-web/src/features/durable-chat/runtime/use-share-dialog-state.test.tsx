import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useShareDialogState } from '@/features/durable-chat/runtime/use-share-dialog-state';

const shareApiMocks = vi.hoisted(() => ({
  createThreadSnapshotShare: vi.fn(),
  fetchCurrentThreadShare: vi.fn(),
  revokeThreadSnapshotShare: vi.fn()
}));

const helperMocks = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn()
}));

vi.mock('@/features/durable-chat/repo/share-api', () => ({
  createThreadSnapshotShare: (...args: unknown[]) => shareApiMocks.createThreadSnapshotShare(...args),
  fetchCurrentThreadShare: (...args: unknown[]) => shareApiMocks.fetchCurrentThreadShare(...args),
  revokeThreadSnapshotShare: (...args: unknown[]) => shareApiMocks.revokeThreadSnapshotShare(...args)
}));

vi.mock('@/features/durable-chat/components/helpers', () => ({
  copyTextToClipboard: (...args: unknown[]) => helperMocks.copyTextToClipboard(...args)
}));

describe('useShareDialogState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shareApiMocks.fetchCurrentThreadShare.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        share: null
      }
    });
  });

  it('creates and copies a thread share', async () => {
    shareApiMocks.createThreadSnapshotShare.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        share: {
          id: 'share-1',
          publicId: 'public-1',
          sourceThreadId: 'thread-1',
          scopeType: 'thread',
          status: 'active',
          snapshotId: 'snapshot-1',
          createdAt: '2026-05-09T00:00:00.000Z',
          revokedAt: null
        }
      }
    });

    const { result } = renderHook(() =>
      useShareDialogState()
    );

    act(() => {
      result.current.onOpenForThread('thread-1');
    });

    await waitFor(() => {
      expect(result.current.targetThreadId).toBe('thread-1');
      expect(result.current.loadingCurrentShare).toBe(false);
    });

    act(() => {
      result.current.onCreateOrCopy();
    });

    await waitFor(() => {
      expect(helperMocks.copyTextToClipboard).toHaveBeenCalledWith(expect.stringContaining('/share/public-1'));
    });

    expect(result.current.currentShare?.publicId).toBe('public-1');
    expect(result.current.copied).toBe(true);
  });

  it('revokes an existing share and clears the current share state', async () => {
    shareApiMocks.fetchCurrentThreadShare.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        share: {
          id: 'share-1',
          publicId: 'public-1',
          sourceThreadId: 'thread-1',
          scopeType: 'thread',
          status: 'active',
          snapshotId: 'snapshot-1',
          createdAt: '2026-05-09T00:00:00.000Z',
          revokedAt: null
        }
      }
    });
    shareApiMocks.revokeThreadSnapshotShare.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        share: {
          id: 'share-1',
          publicId: 'public-1',
          sourceThreadId: 'thread-1',
          scopeType: 'thread',
          status: 'revoked',
          snapshotId: 'snapshot-1',
          createdAt: '2026-05-09T00:00:00.000Z',
          revokedAt: '2026-05-09T00:05:00.000Z'
        }
      }
    });

    const { result } = renderHook(() =>
      useShareDialogState()
    );

    act(() => {
      result.current.onOpenForThread('thread-1');
    });

    await waitFor(() => {
      expect(result.current.currentShare?.publicId).toBe('public-1');
    });

    act(() => {
      result.current.onRevoke();
    });

    await waitFor(() => {
      expect(result.current.currentShare).toBeNull();
    });
  });
});
