import type {
  JsonValue,
  ProviderTranscriptStore,
  RuntimeScope
} from './types.js';

export interface AppendProviderTranscriptEntryInput {
  entryType: string;
  provider: string;
  providerEntryId?: string | null;
  providerProjectKey?: string | null;
  providerSessionId: string | null | undefined;
  rawJson: JsonValue;
  runId?: string | null;
  scope: RuntimeScope;
  transcriptStore?: ProviderTranscriptStore | null;
}

export async function appendProviderTranscriptEntry(input: AppendProviderTranscriptEntryInput): Promise<void> {
  if (!input.transcriptStore || !input.providerSessionId) {
    return;
  }

  await input.transcriptStore.append({
    scope: input.scope,
    key: {
      provider: input.provider,
      providerProjectKey: input.providerProjectKey ?? null,
      providerSessionId: input.providerSessionId
    },
    entries: [
      {
        entryType: input.entryType,
        providerEntryId: input.providerEntryId ?? null,
        rawJson: input.rawJson,
        runId: input.runId ?? input.scope.runId ?? null
      }
    ]
  });
}
