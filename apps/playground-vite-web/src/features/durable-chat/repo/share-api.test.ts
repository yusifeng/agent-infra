import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
const readJsonRecordOrEmpty = vi.fn();
const emitApiDiagnostic = vi.fn();
const readResponseDiagnostics = vi.fn();
const readApiError = vi.fn();

vi.stubGlobal('fetch', fetchMock);

vi.mock('@agent-infra/durable-chat-client', () => ({
  readJsonRecordOrEmpty,
  emitApiDiagnostic,
  readResponseDiagnostics,
  readApiError
}));

describe('share api repo facade', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    readJsonRecordOrEmpty.mockReset();
    emitApiDiagnostic.mockReset();
    readResponseDiagnostics.mockReset();
    readApiError.mockReset();
    readResponseDiagnostics.mockReturnValue({
      requestId: 'req-1',
      serverTiming: 'total;dur=5',
      serverTimingEntries: [{ name: 'total', durationMs: 5 }]
    });
    readApiError.mockImplementation((raw) => (typeof raw?.error === 'string' ? raw.error : null));
  });

  it('creates a thread snapshot share', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200
    });
    readJsonRecordOrEmpty.mockResolvedValue({
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
    });

    const { createThreadSnapshotShare } = await import('@/features/durable-chat/repo/share-api');
    const signal = new AbortController().signal;
    const result = await createThreadSnapshotShare('thread-1', signal);

    expect(fetchMock).toHaveBeenCalledWith('/api/threads/thread-1/shares', {
      method: 'POST',
      signal
    });
    expect(result.ok).toBe(true);
    expect(result.data.share?.publicId).toBe('public-1');
  });

  it('loads the current thread share state', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200
    });
    readJsonRecordOrEmpty.mockResolvedValue({
      share: null
    });

    const { fetchCurrentThreadShare } = await import('@/features/durable-chat/repo/share-api');
    const result = await fetchCurrentThreadShare('thread-1');

    expect(fetchMock).toHaveBeenCalledWith('/api/threads/thread-1/shares/current', {
      signal: undefined
    });
    expect(result.data.share).toBeNull();
  });

  it('loads a public share snapshot and surfaces public errors', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 410
    });
    readJsonRecordOrEmpty.mockResolvedValue({
      error: 'chat share public-1 has been revoked'
    });

    const { fetchThreadSnapshotShare } = await import('@/features/durable-chat/repo/share-api');
    const result = await fetchThreadSnapshotShare('public-1');

    expect(fetchMock).toHaveBeenCalledWith('/api/shares/public-1', {
      signal: undefined
    });
    expect(result).toMatchObject({
      ok: false,
      status: 410,
      error: 'chat share public-1 has been revoked'
    });
  });

  it('revokes a public share', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200
    });
    readJsonRecordOrEmpty.mockResolvedValue({
      share: {
        id: 'share-1',
        publicId: 'public-1',
        sourceThreadId: 'thread-1',
        scopeType: 'thread',
        status: 'revoked',
        snapshotId: 'snapshot-1',
        createdAt: '2026-05-09T00:00:00.000Z',
        revokedAt: '2026-05-09T01:00:00.000Z'
      }
    });

    const { revokeThreadSnapshotShare } = await import('@/features/durable-chat/repo/share-api');
    const result = await revokeThreadSnapshotShare('public-1');

    expect(fetchMock).toHaveBeenCalledWith('/api/shares/public-1/revoke', {
      method: 'POST',
      signal: undefined
    });
    expect(result.data.share?.status).toBe('revoked');
    expect(emitApiDiagnostic).toHaveBeenCalled();
  });
});
