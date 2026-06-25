import {
  DockerSandboxProvider,
  EnvironmentSecretBroker,
  getSecretBrokerProviderDiagnostics,
  LocalWorkspaceStorageProvider
} from '@agent-infra/cloud-agent-runtime';

import { DbProviderTranscriptStore } from './provider-transcript-store';
import { readCloudAgentSecretBrokerProviderKind } from './secret-broker-provider';

export interface RuntimeServiceStatus {
  generatedAt: string;
  app: string;
  capabilities: Array<{
    name: string;
    status: 'ready' | 'manual';
    description: string;
  }>;
}

export function getRuntimeServiceStatus(): RuntimeServiceStatus {
  const secretBrokerDiagnostics = getSecretBrokerProviderDiagnostics(readCloudAgentSecretBrokerProviderKind());
  return {
    generatedAt: new Date().toISOString(),
    app: 'cloud-agent-next-web',
    capabilities: [
      {
        name: LocalWorkspaceStorageProvider.name,
        status: 'ready',
        description: 'Materializes and persists local filesystem workspace snapshots.'
      },
      {
        name: DockerSandboxProvider.name,
        status: 'manual',
        description: 'Creates Docker-backed run sandboxes when Docker is available on the host.'
      },
      {
        name: DbProviderTranscriptStore.name,
        status: 'ready',
        description: 'Persists opaque provider transcript entries for resume, audit, and drill-down.'
      },
      {
        name: EnvironmentSecretBroker.name,
        status: secretBrokerDiagnostics.ready ? 'ready' : 'manual',
        description: secretBrokerDiagnostics.ready
          ? 'Resolves allowlisted env-backed secret refs into short-lived audited credentials.'
          : secretBrokerDiagnostics.error ?? 'Secret broker provider requires implementation.'
      }
    ]
  };
}
