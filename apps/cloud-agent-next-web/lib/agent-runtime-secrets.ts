import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { RuntimeScope, SecretRef } from '@agent-infra/cloud-agent-runtime';

import { getCloudAgentRepositories } from './db';
import type { AgentProviderId } from './provider-config';
import { createCloudAgentSecretBroker } from './secret-broker-provider';
import { readServerEnv } from './server-env';
import { safePathSegment } from './workspace-runtime';

export async function resolveAgentSecretEnv(input: {
  credentialsDir: string;
  guestCredentialsDir: string;
  provider: AgentProviderId;
  scope: RuntimeScope;
}): Promise<Record<string, string>> {
  const repositories = await getCloudAgentRepositories();
  const secretRefs = (await repositories.workspaceSecretRefRepo.listByWorkspace(input.scope.workspaceId))
    .filter((ref) => ref.status === 'active')
    .map((ref): SecretRef => ({
      id: ref.id,
      name: ref.name,
      scope: ref.scope,
      refKey: ref.refKey,
      targetName: ref.targetName,
      delivery: ref.delivery,
      metadata: null
    }));
  if (secretRefs.length === 0) {
    return {};
  }

  const usesProxyDelivery = secretRefs.some((ref) => ref.delivery === 'proxy');
  const proxyExchangeUrl = usesProxyDelivery ? readSecretProxyExchangeUrl() : null;
  if (usesProxyDelivery && !proxyExchangeUrl) {
    throw new Error('CLOUD_AGENT_SECRET_PROXY_URL is required when a workspace secret uses delivery=proxy.');
  }

  const broker = createCloudAgentSecretBroker({
    provider: input.provider,
    scope: input.scope
  });
  const secrets = await broker.resolve({
    scope: input.scope,
    refs: secretRefs,
    purpose: 'agent'
  });
  const env: Record<string, string> = {};
  if (proxyExchangeUrl) {
    env.CLOUD_AGENT_SECRET_PROXY_URL = proxyExchangeUrl;
  }

  for (const secret of secrets) {
    if ((secret.delivery === 'env' || secret.delivery === 'proxy') && secret.name && secret.value) {
      env[secret.name] = secret.value;
      continue;
    }

    if (secret.delivery === 'file' && secret.name && secret.value) {
      const fileName = secretFileName(secret.name, secret.ref.id);
      await writeFile(path.join(input.credentialsDir, fileName), secret.value, { mode: 0o600 });
      env[secret.name] = path.posix.join(input.guestCredentialsDir, fileName);
    }
  }

  return env;
}

function readSecretProxyExchangeUrl(): string | null {
  return readServerEnv().CLOUD_AGENT_SECRET_PROXY_URL?.trim() || null;
}

function secretFileName(targetName: string, refId: string): string {
  const safeTarget = safePathSegment(targetName.toLowerCase());
  const safeRef = safePathSegment(refId.toLowerCase());
  return `${safeTarget}-${safeRef}`;
}
