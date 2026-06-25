import type {
  ProviderTranscriptEntry,
  ProviderTranscriptEntryInput,
  ProviderTranscriptKey,
  ProviderTranscriptStore,
  RuntimeScope
} from './types.js';

function keyToString(key: ProviderTranscriptKey): string {
  return [key.provider, key.providerProjectKey ?? '', key.providerSessionId, key.subpath ?? ''].join('\u001f');
}

function createEntryId(key: ProviderTranscriptKey, ordinal: number): string {
  const subpath = key.subpath ? `${key.subpath}:` : '';
  return `${key.provider}:${key.providerSessionId}:${subpath}${ordinal}`;
}

export class InMemoryProviderTranscriptStore implements ProviderTranscriptStore {
  private readonly entriesByKey = new Map<string, ProviderTranscriptEntry[]>();

  async append(input: {
    scope: RuntimeScope;
    key: ProviderTranscriptKey;
    entries: ProviderTranscriptEntryInput[];
  }): Promise<ProviderTranscriptEntry[]> {
    const storageKey = keyToString(input.key);
    const existing = this.entriesByKey.get(storageKey) ?? [];
    const createdAt = new Date();
    const appended = input.entries.map((entry, index): ProviderTranscriptEntry => {
      const ordinal = existing.length + index;

      return {
        ...entry,
        id: createEntryId(input.key, ordinal),
        scope: { ...input.scope },
        key: { ...input.key },
        ordinal,
        createdAt
      };
    });

    this.entriesByKey.set(storageKey, [...existing, ...appended]);
    return appended;
  }

  async load(input: { scope: RuntimeScope; key: ProviderTranscriptKey }): Promise<ProviderTranscriptEntry[]> {
    const entries = this.entriesByKey.get(keyToString(input.key)) ?? [];
    return entries
      .filter((entry) => entry.scope.tenantId === input.scope.tenantId && entry.scope.workspaceId === input.scope.workspaceId)
      .map((entry) => ({
        ...entry,
        scope: { ...entry.scope },
        key: { ...entry.key }
      }));
  }
}
