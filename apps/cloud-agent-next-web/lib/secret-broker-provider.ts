import {
  EnvironmentSecretBroker,
  getSecretBrokerProviderDiagnostics,
  isSecretBrokerProviderKind,
  secretBrokerProviderNotImplementedMessage,
  verifySecretProxyToken,
  type RuntimeScope,
  type SecretBroker,
  type SecretBrokerAuditEvent,
  type SecretBrokerProviderDiagnostics,
  type SecretBrokerProviderKind,
  type SecretProxyTokenClaims
} from '@agent-infra/cloud-agent-runtime';

import type { AgentProviderId } from './provider-config';
import { appendCloudRunEvent } from './run-store';
import { readServerEnv } from './server-env';

export function getCloudAgentSecretBrokerDiagnostics(): SecretBrokerProviderDiagnostics {
  return getSecretBrokerProviderDiagnostics(readCloudAgentSecretBrokerProviderKind());
}

export class CloudAgentSecretProxyExchangeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason: string
  ) {
    super(message);
    this.name = 'CloudAgentSecretProxyExchangeError';
  }
}

export interface CloudAgentSecretProxyExchangeResult {
  expiresAt: string;
  purpose: SecretProxyTokenClaims['purpose'];
  refId: string;
  refName: string;
  scope: RuntimeScope;
  targetName: string;
  value: string;
}

export async function exchangeCloudAgentSecretProxyToken(input: {
  token: string;
}): Promise<CloudAgentSecretProxyExchangeResult> {
  const env = readServerEnv();
  const signingKey = readSecretProxySigningKey(env);
  if (!signingKey) {
    throw new CloudAgentSecretProxyExchangeError('Secret proxy signing key is not configured.', 503, 'missing_signing_key');
  }

  if (!readSecretDeliveryAllowlist(env).includes('proxy')) {
    throw new CloudAgentSecretProxyExchangeError('Secret proxy delivery is not allowlisted.', 403, 'proxy_delivery_not_allowlisted');
  }

  const verification = verifySecretProxyToken({
    signingKey,
    token: input.token
  });
  if (!verification.ok) {
    throw new CloudAgentSecretProxyExchangeError('Secret proxy token is invalid.', 401, verification.reason);
  }

  const { claims } = verification;
  const envName = readProxyEnvName(claims.refKey);
  if (!envName) {
    await recordProxyExchangeRejected(claims, 'unsupported proxy token refKey');
    throw new CloudAgentSecretProxyExchangeError('Secret proxy token refKey is unsupported.', 403, 'unsupported_ref_key');
  }

  const allowedEnvVars = readSecretEnvAllowlist(env);
  if (!allowedEnvVars.includes(envName)) {
    await recordProxyExchangeRejected(claims, `env secret is not allowlisted: ${envName}`);
    throw new CloudAgentSecretProxyExchangeError('Secret proxy ref is not allowlisted.', 403, 'env_secret_not_allowlisted');
  }

  const value = env[envName];
  if (!value) {
    await recordProxyExchangeRejected(claims, `env secret is not available: ${envName}`);
    throw new CloudAgentSecretProxyExchangeError('Secret proxy ref is unavailable.', 404, 'env_secret_unavailable');
  }

  await recordProxyExchangeIssued(claims);
  return {
    expiresAt: claims.exp,
    purpose: claims.purpose,
    refId: claims.refId,
    refName: claims.refName,
    scope: claims.scope,
    targetName: claims.targetName,
    value
  };
}

export function createCloudAgentSecretBroker(input: {
  provider: AgentProviderId;
  scope: RuntimeScope;
}): SecretBroker {
  const kind = readCloudAgentSecretBrokerProviderKind();
  if (kind !== 'env') {
    throw new Error(secretBrokerProviderNotImplementedMessage(kind));
  }

  const env = readServerEnv();
  return new EnvironmentSecretBroker({
    allowedDeliveries: readSecretDeliveryAllowlist(env),
    allowedEnvVars: readSecretEnvAllowlist(env),
    auditSink: {
      record(event) {
        return recordSecretBrokerAuditEvent(input.provider, event);
      }
    },
    defaultTtlMs: readSecretTtlMs(env),
    env,
    proxyTokenSigningKey: readSecretProxySigningKey(env)
  });
}

export function readCloudAgentSecretBrokerProviderKind(): SecretBrokerProviderKind {
  const configured = readServerEnv().CLOUD_AGENT_SECRET_BROKER_PROVIDER?.trim().toLowerCase();
  if (!configured) {
    return 'env';
  }

  if (isSecretBrokerProviderKind(configured)) {
    return configured;
  }

  throw new Error(`Unknown CLOUD_AGENT_SECRET_BROKER_PROVIDER: ${configured}`);
}

async function recordSecretBrokerAuditEvent(provider: AgentProviderId, event: SecretBrokerAuditEvent): Promise<void> {
  if (!event.scope.threadId || !event.scope.runId) {
    return;
  }

  await appendCloudRunEvent({
    threadId: event.scope.threadId,
    runId: event.scope.runId,
    type: 'secret_broker_audit',
    payload: {
      schemaVersion: 1,
      type: 'secret_broker_audit',
      provider,
      workspaceId: event.scope.workspaceId,
      threadId: event.scope.threadId,
      runId: event.scope.runId,
      purpose: event.purpose,
      refId: event.refId,
      refName: event.refName,
      refKey: event.refKey ?? null,
      delivery: event.delivery ?? null,
      targetName: event.targetName ?? null,
      decision: event.decision,
      reason: event.reason ?? null,
      issuedAt: event.issuedAt.toISOString(),
      expiresAt: event.expiresAt?.toISOString() ?? null
    }
  });
}

async function recordProxyExchangeIssued(claims: SecretProxyTokenClaims): Promise<void> {
  await recordProxyExchangeAuditEvent(claims, 'issued', 'proxy token exchanged');
}

async function recordProxyExchangeRejected(claims: SecretProxyTokenClaims, reason: string): Promise<void> {
  await recordProxyExchangeAuditEvent(claims, 'rejected', reason);
}

async function recordProxyExchangeAuditEvent(
  claims: SecretProxyTokenClaims,
  decision: 'issued' | 'rejected',
  reason: string
): Promise<void> {
  if (!claims.scope.threadId || !claims.scope.runId) {
    return;
  }

  await appendCloudRunEvent({
    threadId: claims.scope.threadId,
    runId: claims.scope.runId,
    type: 'secret_broker_audit',
    payload: {
      schemaVersion: 1,
      type: 'secret_broker_audit',
      provider: null,
      workspaceId: claims.scope.workspaceId,
      threadId: claims.scope.threadId,
      runId: claims.scope.runId,
      purpose: claims.purpose,
      refId: claims.refId,
      refName: claims.refName,
      refKey: claims.refKey,
      delivery: 'proxy',
      targetName: claims.targetName,
      decision,
      reason,
      issuedAt: new Date().toISOString(),
      expiresAt: claims.exp
    }
  });
}

function readProxyEnvName(refKey: string): string | null {
  if (!refKey.startsWith('env:')) {
    return null;
  }

  const envName = refKey.slice('env:'.length).trim();
  return envName || null;
}

function readSecretDeliveryAllowlist(env: Record<string, string | undefined>): Array<'env' | 'file' | 'proxy'> {
  const configured = splitCsv(env.CLOUD_AGENT_SECRET_DELIVERY_ALLOWLIST);
  if (configured.length === 0) {
    return ['env'];
  }

  return configured.filter((value): value is 'env' | 'file' | 'proxy' => value === 'env' || value === 'file' || value === 'proxy');
}

function readSecretEnvAllowlist(env: Record<string, string | undefined>): string[] {
  const configured = splitCsv(env.CLOUD_AGENT_SECRET_ENV_ALLOWLIST);
  return configured.length > 0 ? configured : [];
}

function readSecretTtlMs(env: Record<string, string | undefined>): number {
  const value = Number(env.CLOUD_AGENT_SECRET_TTL_MS?.trim());
  return Number.isFinite(value) && value > 0 ? value : 5 * 60 * 1000;
}

function readSecretProxySigningKey(env: Record<string, string | undefined>): string | undefined {
  const value = env.CLOUD_AGENT_SECRET_PROXY_SIGNING_KEY?.trim();
  return value || undefined;
}

function splitCsv(value: string | undefined): string[] {
  return value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}
