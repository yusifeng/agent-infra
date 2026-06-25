import type { CloudThread } from './thread-store';

export type ProviderSessionRecoveryStrategy = 'archive_and_restart' | 'compact' | 'replay_transcript';

export function resolveProviderSessionRecoveryStrategy(thread: CloudThread): ProviderSessionRecoveryStrategy {
  const metadata = thread.providerSessionMetadata;
  if (!isRecord(metadata) || (metadata.lifecycleAction !== 'replay' && metadata.lifecycleAction !== 'compact')) {
    return 'archive_and_restart';
  }

  const transcriptReplay = metadata.transcriptReplay;
  if (!isRecord(transcriptReplay)) {
    return 'archive_and_restart';
  }

  const plan = transcriptReplay.plan;
  if (!isRecord(plan) || plan.available !== true) {
    return 'archive_and_restart';
  }

  return metadata.lifecycleAction === 'compact' ? 'compact' : 'replay_transcript';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
