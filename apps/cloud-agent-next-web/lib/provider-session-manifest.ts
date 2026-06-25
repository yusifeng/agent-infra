import type { ProviderSessionRecoveryProviderManifestDto } from '@agent-infra/contracts';

export const PROVIDER_RECOVERY_MANIFESTS: ProviderSessionRecoveryProviderManifestDto[] = [
  {
    provider: 'claude',
    strategies: [
      {
        action: 'resume',
        status: 'supported',
        notes: 'Uses provider session binding as the Claude resume/session hint.'
      },
      {
        action: 'archive_and_restart',
        status: 'supported',
        notes: 'Archives the active binding and retries without provider resume after resume failure.'
      },
      {
        action: 'replay_transcript',
        status: 'planned',
        notes: 'Replay plan and recovery hint are durable; provider-specific transcript injection is not implemented yet.'
      },
      {
        action: 'compact',
        status: 'planned',
        notes: 'Provider-neutral compact continuity is active-binding backed; provider-specific compact execution is not implemented yet.'
      },
      {
        action: 'fork',
        status: 'manual',
        notes: 'Control-plane lifecycle state is recorded; provider-specific fork execution is not implemented yet.'
      }
    ]
  },
  {
    provider: 'codex',
    strategies: [
      {
        action: 'resume',
        status: 'supported',
        notes: 'Codex adapter resumes provider thread ids through the Codex SDK resumeThread path.'
      },
      {
        action: 'archive_and_restart',
        status: 'supported',
        notes: 'Provider binding can be archived and execution can restart from durable product state.'
      },
      {
        action: 'replay_transcript',
        status: 'planned',
        notes: 'Raw transcript storage is available; Codex-specific transcript replay is not implemented yet.'
      },
      {
        action: 'compact',
        status: 'planned',
        notes: 'Provider-neutral compact continuity is active-binding backed; Codex-specific compact execution is not implemented yet.'
      },
      {
        action: 'fork',
        status: 'manual',
        notes: 'Control-plane lifecycle state is recorded; Codex-specific fork execution is not implemented yet.'
      }
    ]
  }
];
