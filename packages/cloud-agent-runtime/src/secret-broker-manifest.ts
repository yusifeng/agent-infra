export type SecretBrokerProviderKind = 'env' | 'file-materializer' | 'kms' | 'proxy' | 'vault';

export interface SecretBrokerProviderManifest {
  description: string;
  kind: SecretBrokerProviderKind;
  productionTarget: boolean;
  requiredEnv: string[];
  status: 'planned' | 'supported';
}

export interface SecretBrokerProviderDiagnostics {
  configuredKind: SecretBrokerProviderKind;
  error: string | null;
  providers: SecretBrokerProviderManifest[];
  ready: boolean;
}

const SECRET_BROKER_PROVIDER_MANIFESTS: SecretBrokerProviderManifest[] = [
  {
    description: 'Local env-backed broker for development and internal smoke tests. Values are issued only from allowlisted env refs.',
    kind: 'env',
    productionTarget: false,
    requiredEnv: [],
    status: 'supported'
  },
  {
    description: 'Vault-backed broker for scoped, audited, short-lived credentials.',
    kind: 'vault',
    productionTarget: true,
    requiredEnv: ['VAULT_ADDR', 'VAULT_ROLE_ID'],
    status: 'planned'
  },
  {
    description: 'KMS or cloud secret manager broker for tenant/workspace scoped credentials.',
    kind: 'kms',
    productionTarget: true,
    requiredEnv: ['CLOUD_SECRET_MANAGER_PROJECT'],
    status: 'planned'
  },
  {
    description: 'Proxy-token broker that gives sandboxes scoped access through an audited service proxy.',
    kind: 'proxy',
    productionTarget: true,
    requiredEnv: ['CLOUD_AGENT_SECRET_PROXY_URL'],
    status: 'planned'
  },
  {
    description: 'Short-lived file materializer for tools that require file-based credentials inside the sandbox.',
    kind: 'file-materializer',
    productionTarget: true,
    requiredEnv: ['CLOUD_AGENT_SECRET_MATERIALIZER_ROOT'],
    status: 'planned'
  }
];

export function getSecretBrokerProviderManifests(): SecretBrokerProviderManifest[] {
  return SECRET_BROKER_PROVIDER_MANIFESTS;
}

export function getSecretBrokerProviderDiagnostics(kind: SecretBrokerProviderKind): SecretBrokerProviderDiagnostics {
  const manifest = SECRET_BROKER_PROVIDER_MANIFESTS.find((candidate) => candidate.kind === kind) ?? null;
  const error =
    manifest && manifest.status === 'supported'
      ? null
      : manifest
        ? secretBrokerProviderNotImplementedMessage(kind)
        : `Unknown secret broker provider: ${kind}`;

  return {
    configuredKind: kind,
    error,
    providers: SECRET_BROKER_PROVIDER_MANIFESTS,
    ready: error === null
  };
}

export function isSecretBrokerProviderKind(value: string | undefined): value is SecretBrokerProviderKind {
  return value === 'env' || value === 'file-materializer' || value === 'kms' || value === 'proxy' || value === 'vault';
}

export function secretBrokerProviderNotImplementedMessage(kind: SecretBrokerProviderKind): string {
  const manifest = SECRET_BROKER_PROVIDER_MANIFESTS.find((candidate) => candidate.kind === kind);
  const requiredEnv = manifest?.requiredEnv.length ? ` Required env: ${manifest.requiredEnv.join(', ')}.` : '';
  return `Secret broker provider "${kind}" is not implemented yet.${requiredEnv}`;
}
