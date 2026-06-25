import { describe, expect, it } from 'vitest';

import {
  InMemoryProviderTranscriptStore,
  appendProviderTranscriptEntry,
  type RuntimeScope
} from '../src/index.js';

const scope: RuntimeScope = {
  tenantId: 'tenant',
  userId: 'user',
  workspaceId: 'workspace',
  threadId: 'thread',
  runId: 'run'
};

describe('appendProviderTranscriptEntry', () => {
  it('appends a normalized provider transcript entry key', async () => {
    const transcriptStore = new InMemoryProviderTranscriptStore();

    await appendProviderTranscriptEntry({
      entryType: 'message',
      provider: 'claude',
      providerEntryId: 'provider-entry',
      providerProjectKey: 'project',
      providerSessionId: 'provider-session',
      rawJson: { type: 'message' },
      scope,
      transcriptStore
    });

    const entries = await transcriptStore.load({
      scope,
      key: {
        provider: 'claude',
        providerProjectKey: 'project',
        providerSessionId: 'provider-session'
      }
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.entryType).toBe('message');
    expect(entries[0]?.providerEntryId).toBe('provider-entry');
    expect(entries[0]?.runId).toBe('run');
  });

  it('does nothing without a transcript store or provider session', async () => {
    await expect(
      appendProviderTranscriptEntry({
        entryType: 'message',
        provider: 'claude',
        providerSessionId: null,
        rawJson: { type: 'message' },
        scope,
        transcriptStore: null
      })
    ).resolves.toBeUndefined();
  });
});
