import type {
  ProviderTranscriptEntry,
  ProviderTranscriptEntryInput,
  ProviderTranscriptKey,
  ProviderTranscriptStore,
  RuntimeScope,
  JsonValue
} from '@agent-infra/cloud-agent-runtime';
import type { ProviderTranscriptEntry as CoreProviderTranscriptEntry } from '@agent-infra/core';

import { withCloudAgentTransaction, getCloudAgentRepositories } from './db';

export class DbProviderTranscriptStore implements ProviderTranscriptStore {
  async append(input: {
    scope: RuntimeScope;
    key: ProviderTranscriptKey;
    entries: ProviderTranscriptEntryInput[];
  }): Promise<ProviderTranscriptEntry[]> {
    return withCloudAgentTransaction(async (repositories) => {
      const appended: CoreProviderTranscriptEntry[] = [];
      for (const entry of input.entries) {
        appended.push(
          await repositories.providerTranscriptRepo.append({
            workspaceId: input.scope.workspaceId,
            threadId: input.scope.threadId ?? null,
            runId: entry.runId ?? input.scope.runId ?? null,
            provider: input.key.provider,
            providerSessionId: input.key.providerSessionId,
            providerProjectKey: input.key.providerProjectKey ?? null,
            providerEntryId: entry.providerEntryId ?? null,
            entryType: entry.entryType,
            rawJson: entry.rawJson
          })
        );
      }

      return appended.map((entry) => toRuntimeEntry(entry, input.scope));
    });
  }

  async load(input: { scope: RuntimeScope; key: ProviderTranscriptKey }): Promise<ProviderTranscriptEntry[]> {
    const repositories = await getCloudAgentRepositories();
    const entries = await repositories.providerTranscriptRepo.listByProviderSession({
      provider: input.key.provider,
      providerSessionId: input.key.providerSessionId,
      providerProjectKey: input.key.providerProjectKey ?? null
    });

    return entries
      .filter((entry) => entry.workspaceId === input.scope.workspaceId)
      .filter((entry) => !input.scope.threadId || !entry.threadId || entry.threadId === input.scope.threadId)
      .map((entry) => toRuntimeEntry(entry, input.scope));
  }
}

export function createDbProviderTranscriptStore(): ProviderTranscriptStore {
  return new DbProviderTranscriptStore();
}

function toRuntimeEntry(entry: CoreProviderTranscriptEntry, scope: RuntimeScope): ProviderTranscriptEntry {
  return {
    id: entry.id,
    scope: {
      ...scope,
      workspaceId: entry.workspaceId,
      threadId: entry.threadId ?? scope.threadId ?? null,
      runId: entry.runId ?? scope.runId ?? null
    },
    key: {
      provider: entry.provider,
      providerSessionId: entry.providerSessionId,
      providerProjectKey: entry.providerProjectKey ?? null
    },
    ordinal: entry.ordinal,
    entryType: entry.entryType,
    rawJson: entry.rawJson as JsonValue,
    runId: entry.runId ?? null,
    providerEntryId: entry.providerEntryId ?? null,
    createdAt: entry.createdAt
  };
}
