import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import type {
  RuntimeScope,
  ScopedSecret,
  SecretBroker,
  SecretBrokerAuditEvent,
  SecretBrokerAuditSink,
  SecretRef
} from './types.js';

export interface EnvironmentSecretBrokerOptions {
  env?: Record<string, string | undefined>;
  allowedEnvVars?: string[];
  allowedDeliveries?: ScopedSecret['delivery'][];
  defaultTtlMs?: number;
  auditSink?: SecretBrokerAuditSink;
  now?: () => Date;
  proxyTokenSigningKey?: string;
}

export interface SecretProxyTokenClaims {
  aud: 'cloud-agent-secret-proxy';
  exp: string;
  iat: string;
  jti: string;
  purpose: 'agent' | 'mcp' | 'tool' | 'storage';
  refId: string;
  refKey: string;
  refName: string;
  scope: RuntimeScope;
  targetName: string;
  v: 1;
}

export type SecretProxyTokenVerificationResult =
  | {
      claims: SecretProxyTokenClaims;
      ok: true;
    }
  | {
      claims?: SecretProxyTokenClaims | null;
      ok: false;
      reason: 'expired' | 'invalid_audience' | 'invalid_format' | 'invalid_signature' | 'invalid_version';
    };

export class SecretBrokerResolutionError extends Error {
  constructor(
    message: string,
    readonly auditEvent: SecretBrokerAuditEvent
  ) {
    super(message);
    this.name = 'SecretBrokerResolutionError';
  }
}

export class EnvironmentSecretBroker implements SecretBroker {
  private readonly env: Record<string, string | undefined>;
  private readonly allowedEnvVars: Set<string> | null;
  private readonly allowedDeliveries: Set<ScopedSecret['delivery']>;
  private readonly defaultTtlMs: number;
  private readonly auditSink?: SecretBrokerAuditSink;
  private readonly now: () => Date;
  private readonly proxyTokenSigningKey?: string;

  constructor(options: EnvironmentSecretBrokerOptions = {}) {
    this.env = options.env ?? {};
    this.allowedEnvVars = options.allowedEnvVars ? new Set(options.allowedEnvVars) : null;
    this.allowedDeliveries = new Set(options.allowedDeliveries ?? ['env']);
    this.defaultTtlMs = options.defaultTtlMs ?? 5 * 60 * 1000;
    this.auditSink = options.auditSink;
    this.now = options.now ?? (() => new Date());
    this.proxyTokenSigningKey = options.proxyTokenSigningKey;
  }

  async resolve(input: {
    scope: RuntimeScope;
    refs: SecretRef[];
    purpose: 'agent' | 'mcp' | 'tool' | 'storage';
  }): Promise<ScopedSecret[]> {
    const resolved: ScopedSecret[] = [];

    for (const ref of input.refs) {
      resolved.push(await this.resolveOne(input.scope, input.purpose, ref));
    }

    return resolved;
  }

  private async resolveOne(
    scope: RuntimeScope,
    purpose: 'agent' | 'mcp' | 'tool' | 'storage',
    ref: SecretRef
  ): Promise<ScopedSecret> {
    const refKey = readSecretRefKey(ref);
    if (!refKey) {
      return this.reject(scope, purpose, ref, null, null, null, 'secret ref is missing refKey');
    }

    if (!refKey.startsWith('env:')) {
      return this.reject(scope, purpose, ref, refKey, null, null, `unsupported secret refKey scheme: ${refKey}`);
    }

    const envName = refKey.slice('env:'.length);
    if (!envName) {
      return this.reject(scope, purpose, ref, refKey, null, null, 'secret refKey env name is empty');
    }

    if (this.allowedEnvVars && !this.allowedEnvVars.has(envName)) {
      return this.reject(scope, purpose, ref, refKey, null, null, `env secret is not allowlisted: ${envName}`);
    }

    const delivery = readSecretDelivery(ref);
    const targetName = readSecretTargetName(ref);
    if (!this.allowedDeliveries.has(delivery)) {
      return this.reject(scope, purpose, ref, refKey, delivery, targetName, `secret delivery is not allowlisted: ${delivery}`);
    }

    const value = this.env[envName];
    if (!value) {
      return this.reject(scope, purpose, ref, refKey, delivery, targetName, `env secret is not available: ${envName}`);
    }

    const issuedAt = this.now();
    const expiresAt = new Date(issuedAt.getTime() + this.defaultTtlMs);
    const scopedValue =
      delivery === 'proxy'
        ? this.createProxyToken({
            expiresAt,
            issuedAt,
            purpose,
            ref,
            refKey,
            scope,
            targetName
          })
        : value;
    if (!scopedValue) {
      return this.reject(scope, purpose, ref, refKey, delivery, targetName, 'proxy token signing key is not configured');
    }

    await this.audit({
      scope,
      purpose,
      refId: ref.id,
      refName: ref.name,
      refKey,
      delivery,
      targetName,
      decision: 'issued',
      reason: null,
      issuedAt,
      expiresAt
    });

    return {
      ref,
      delivery,
      name: targetName,
      value: scopedValue,
      expiresAt
    };
  }

  private createProxyToken(input: {
    expiresAt: Date;
    issuedAt: Date;
    purpose: 'agent' | 'mcp' | 'tool' | 'storage';
    ref: SecretRef;
    refKey: string;
    scope: RuntimeScope;
    targetName: string;
  }): string | null {
    if (!this.proxyTokenSigningKey) {
      return null;
    }

    const payload = {
      aud: 'cloud-agent-secret-proxy',
      exp: input.expiresAt.toISOString(),
      iat: input.issuedAt.toISOString(),
      jti: randomUUID(),
      purpose: input.purpose,
      refId: input.ref.id,
      refKey: input.refKey,
      refName: input.ref.name,
      scope: input.scope,
      targetName: input.targetName,
      v: 1
    };
    const encodedPayload = base64Url(JSON.stringify(payload));
    const signature = createHmac('sha256', this.proxyTokenSigningKey).update(encodedPayload).digest('base64url');
    return `cagp.v1.${encodedPayload}.${signature}`;
  }

  private async reject(
    scope: RuntimeScope,
    purpose: 'agent' | 'mcp' | 'tool' | 'storage',
    ref: SecretRef,
    refKey: string | null,
    delivery: ScopedSecret['delivery'] | null,
    targetName: string | null,
    reason: string
  ): Promise<never> {
    const auditEvent: SecretBrokerAuditEvent = {
      scope,
      purpose,
      refId: ref.id,
      refName: ref.name,
      refKey,
      delivery,
      targetName,
      decision: 'rejected',
      reason,
      issuedAt: this.now(),
      expiresAt: null
    };
    await this.audit(auditEvent);
    throw new SecretBrokerResolutionError(reason, auditEvent);
  }

  private async audit(event: SecretBrokerAuditEvent): Promise<void> {
    await this.auditSink?.record(event);
  }
}

function readSecretRefKey(ref: SecretRef): string | null {
  return ref.refKey ?? readStringMetadata(ref, 'refKey');
}

function readSecretTargetName(ref: SecretRef): string {
  return ref.targetName ?? readStringMetadata(ref, 'targetName') ?? ref.name;
}

function readSecretDelivery(ref: SecretRef): ScopedSecret['delivery'] {
  const delivery = ref.delivery ?? readStringMetadata(ref, 'delivery');
  return delivery === 'file' || delivery === 'proxy' ? delivery : 'env';
}

function readStringMetadata(ref: SecretRef, key: string): string | null {
  const value = ref.metadata?.[key];
  return typeof value === 'string' ? value : null;
}

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

export function verifySecretProxyToken(input: {
  now?: Date;
  signingKey: string;
  token: string;
}): SecretProxyTokenVerificationResult {
  const parts = input.token.split('.');
  if (parts.length !== 4 || parts[0] !== 'cagp' || parts[1] !== 'v1' || !parts[2] || !parts[3]) {
    return { ok: false, reason: 'invalid_format' };
  }

  const expectedSignature = createHmac('sha256', input.signingKey).update(parts[2]).digest('base64url');
  if (!safeEqual(expectedSignature, parts[3])) {
    return { ok: false, reason: 'invalid_signature' };
  }

  const claims = readProxyTokenClaims(parts[2]);
  if (!claims) {
    return { ok: false, reason: 'invalid_format' };
  }
  if (claims.v !== 1) {
    return { claims, ok: false, reason: 'invalid_version' };
  }
  if (claims.aud !== 'cloud-agent-secret-proxy') {
    return { claims, ok: false, reason: 'invalid_audience' };
  }

  const expiresAt = Date.parse(claims.exp);
  if (!Number.isFinite(expiresAt) || expiresAt <= (input.now ?? new Date()).getTime()) {
    return { claims, ok: false, reason: 'expired' };
  }

  return {
    claims,
    ok: true
  };
}

function readProxyTokenClaims(encodedPayload: string): SecretProxyTokenClaims | null {
  try {
    const value = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    return isSecretProxyTokenClaims(value) ? value : null;
  } catch {
    return null;
  }
}

function isSecretProxyTokenClaims(value: unknown): value is SecretProxyTokenClaims {
  if (!isRecord(value) || !isRecord(value.scope)) {
    return false;
  }

  return (
    value.aud === 'cloud-agent-secret-proxy' &&
    typeof value.exp === 'string' &&
    typeof value.iat === 'string' &&
    typeof value.jti === 'string' &&
    isSecretPurpose(value.purpose) &&
    typeof value.refId === 'string' &&
    typeof value.refKey === 'string' &&
    typeof value.refName === 'string' &&
    typeof value.targetName === 'string' &&
    value.v === 1 &&
    typeof value.scope.tenantId === 'string' &&
    typeof value.scope.userId === 'string' &&
    typeof value.scope.workspaceId === 'string' &&
    (typeof value.scope.threadId === 'string' || value.scope.threadId == null) &&
    (typeof value.scope.runId === 'string' || value.scope.runId == null)
  );
}

function isSecretPurpose(value: unknown): value is SecretProxyTokenClaims['purpose'] {
  return value === 'agent' || value === 'mcp' || value === 'tool' || value === 'storage';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
