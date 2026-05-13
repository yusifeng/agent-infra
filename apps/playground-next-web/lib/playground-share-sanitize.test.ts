import { describe, expect, it } from 'vitest';

import type { PublicChatShareResult } from '@agent-infra/app';

import { sanitizePublicShareForUi } from './playground-share-sanitize';

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
      messages: [
        {
          id: 'shared-message-1',
          runId: 'shared-run-1',
          role: 'assistant',
          seq: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          parts: [
            {
              id: 'shared-part-1',
              messageId: 'shared-message-1',
              partIndex: 0,
              type: 'tool-call',
              textValue: null,
              jsonValue: {
                toolCallId: 'shared-tool-call-1'
              },
              createdAt: '2026-01-01T00:00:00.000Z'
            },
            {
              id: 'shared-part-2',
              messageId: 'shared-message-1',
              partIndex: 1,
              type: 'tool-result',
              textValue: null,
              jsonValue: {
                toolCallId: 'shared-tool-call-1',
                details: {
                  status: 'blocked_by_policy'
                }
              },
              createdAt: '2026-01-01T00:00:00.000Z'
            },
            {
              id: 'shared-part-3',
              messageId: 'shared-message-1',
              partIndex: 2,
              type: 'text',
              textValue: 'Visible answer',
              jsonValue: null,
              createdAt: '2026-01-01T00:00:00.000Z'
            }
          ]
        }
      ]
    }
  };
}

describe('share sanitization', () => {
  it('removes policy-blocked tool call pairs from public shares', () => {
    const sanitized = sanitizePublicShareForUi(publicShareResult());

    expect(sanitized.snapshot.messages).toHaveLength(1);
    expect(sanitized.snapshot.messages[0]?.parts).toEqual([
      expect.objectContaining({
        id: 'shared-part-3',
        type: 'text',
        textValue: 'Visible answer'
      })
    ]);
  });
});
