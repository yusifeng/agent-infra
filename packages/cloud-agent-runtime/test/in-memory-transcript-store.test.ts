import { describe, expect, it } from 'vitest';

import { InMemoryProviderTranscriptStore } from '../src/in-memory-transcript-store';
import type { ProviderTranscriptKey, RuntimeScope } from '../src/types';

const scope: RuntimeScope = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  workspaceId: 'workspace-1',
  threadId: 'thread-1',
  runId: 'run-1'
};

const key: ProviderTranscriptKey = {
  provider: 'claude',
  providerSessionId: 'claude-session-1',
  providerProjectKey: 'workspace-1'
};

describe('InMemoryProviderTranscriptStore', () => {
  it('preserves opaque provider entries in append order', async () => {
    const store = new InMemoryProviderTranscriptStore();
    await store.append({
      scope,
      key,
      entries: [
        {
          entryType: 'system',
          rawJson: { type: 'system', subtype: 'init', nested: { value: 'kept' } }
        }
      ]
    });
    await store.append({
      scope,
      key,
      entries: [
        {
          entryType: 'assistant',
          rawJson: { type: 'assistant', content: [{ type: 'text', text: 'hello' }] }
        }
      ]
    });

    const entries = await store.load({ scope, key });

    expect(entries.map((entry) => entry.ordinal)).toEqual([0, 1]);
    expect(entries.map((entry) => entry.entryType)).toEqual(['system', 'assistant']);
    expect(entries[0]?.rawJson).toEqual({ type: 'system', subtype: 'init', nested: { value: 'kept' } });
  });

  it('keeps subagent transcripts separate from the main transcript', async () => {
    const store = new InMemoryProviderTranscriptStore();
    await store.append({
      scope,
      key,
      entries: [{ entryType: 'assistant', rawJson: { type: 'assistant', content: [] } }]
    });
    await store.append({
      scope,
      key: { ...key, subpath: 'subagents/agent-1' },
      entries: [{ entryType: 'assistant', rawJson: { type: 'assistant', subagent: true } }]
    });

    const mainEntries = await store.load({ scope, key });
    const subagentEntries = await store.load({ scope, key: { ...key, subpath: 'subagents/agent-1' } });

    expect(mainEntries).toHaveLength(1);
    expect(subagentEntries).toHaveLength(1);
    expect(subagentEntries[0]?.rawJson).toEqual({ type: 'assistant', subagent: true });
  });
});
