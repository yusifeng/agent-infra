import { describe, expect, it } from 'vitest';

import {
  normalizeCreateThreadShareResponse,
  normalizePublicChatShareResponse,
  normalizeRevokeChatShareResponse,
  normalizeThreadShareStateResponse
} from '@/features/durable-chat/schema/share-snapshot';

describe('share snapshot schema', () => {
  it('normalizes create thread share responses', () => {
    const response = normalizeCreateThreadShareResponse({
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

    expect(response).toEqual({
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
  });

  it('normalizes current share state with explicit null share', () => {
    const response = normalizeThreadShareStateResponse({
      share: null
    });

    expect(response).toEqual({
      share: null
    });
  });

  it('normalizes public share snapshots and preserves share-local search bundles', () => {
    const response = normalizePublicChatShareResponse({
      share: {
        publicId: 'public-1',
        scopeType: 'thread',
        status: 'active',
        createdAt: '2026-05-09T00:00:00.000Z',
        snapshot: {
          payloadFormat: 'messages_v1',
          payloadVersion: 1,
          title: 'Shared Thread',
          messages: [
            {
              id: 'shared-message-1',
              runId: 'shared-run-1',
              role: 'assistant',
              seq: 2,
              createdAt: '2026-05-09T00:00:01.000Z',
              parts: [
                {
                  id: 'shared-part-1',
                  messageId: 'shared-message-1',
                  partIndex: 0,
                  type: 'text',
                  textValue: 'hello',
                  createdAt: '2026-05-09T00:00:01.000Z'
                }
              ]
            }
          ],
          searchBundles: {
            'shared-tool-call-1': {
              toolCallId: 'shared-tool-call-1',
              toolName: 'searchWeb'
            }
          }
        }
      }
    });

    expect(response.share?.snapshot.messages[0]).toMatchObject({
      id: 'shared-message-1',
      runId: 'shared-run-1',
      role: 'assistant'
    });
    expect(response.share?.snapshot.searchBundles).toEqual({
      'shared-tool-call-1': {
        toolCallId: 'shared-tool-call-1',
        toolName: 'searchWeb'
      }
    });
  });

  it('normalizes revoke responses and surfaces api errors', () => {
    const response = normalizeRevokeChatShareResponse({
      error: 'revoked',
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

    expect(response).toEqual({
      error: 'revoked',
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
  });

  it('rejects out-of-contract enum values during normalization', () => {
    const current = normalizeThreadShareStateResponse({
      share: {
        id: 'share-1',
        publicId: 'public-1',
        sourceThreadId: 'thread-1',
        scopeType: 'segment',
        status: 'expired',
        snapshotId: 'snapshot-1',
        createdAt: '2026-05-09T00:00:00.000Z'
      }
    });
    const publicShare = normalizePublicChatShareResponse({
      share: {
        publicId: 'public-1',
        scopeType: 'thread',
        status: 'revoked',
        createdAt: '2026-05-09T00:00:00.000Z',
        snapshot: {
          payloadFormat: 'messages_v1',
          payloadVersion: 1,
          messages: []
        }
      }
    });

    expect(current.share).toBeUndefined();
    expect(publicShare.share).toBeUndefined();
  });

  it('rejects out-of-contract shared message roles and part types', () => {
    const publicShare = normalizePublicChatShareResponse({
      share: {
        publicId: 'public-1',
        scopeType: 'thread',
        status: 'active',
        createdAt: '2026-05-09T00:00:00.000Z',
        snapshot: {
          payloadFormat: 'messages_v1',
          payloadVersion: 1,
          messages: [
            {
              id: 'shared-message-1',
              role: 'guest',
              seq: 1,
              createdAt: '2026-05-09T00:00:00.000Z',
              parts: []
            },
            {
              id: 'shared-message-2',
              role: 'assistant',
              seq: 2,
              createdAt: '2026-05-09T00:00:01.000Z',
              parts: [
                {
                  id: 'shared-part-1',
                  messageId: 'shared-message-2',
                  partIndex: 0,
                  type: 'html',
                  createdAt: '2026-05-09T00:00:01.000Z'
                }
              ]
            }
          ]
        }
      }
    });

    expect(publicShare.share?.snapshot.messages).toEqual([
      {
        id: 'shared-message-2',
        runId: null,
        role: 'assistant',
        seq: 2,
        createdAt: '2026-05-09T00:00:01.000Z',
        parts: []
      }
    ]);
  });
});
