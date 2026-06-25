import { describe, expect, it } from 'vitest';

import {
  EnvironmentSecretBroker,
  SecretBrokerResolutionError,
  verifySecretProxyToken,
  type SecretBrokerAuditEvent
} from '../src/environment-secret-broker';
import type { RuntimeScope } from '../src/types';

const scope: RuntimeScope = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  workspaceId: 'workspace-1',
  threadId: 'thread-1',
  runId: 'run-1'
};

describe('EnvironmentSecretBroker', () => {
  it('issues short-lived env secrets from allowlisted refs and audits without raw values', async () => {
    const auditEvents: SecretBrokerAuditEvent[] = [];
    const broker = new EnvironmentSecretBroker({
      env: { ANTHROPIC_API_KEY: 'sk-test-secret' },
      allowedEnvVars: ['ANTHROPIC_API_KEY'],
      allowedDeliveries: ['env'],
      defaultTtlMs: 60_000,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      auditSink: {
        record(event) {
          auditEvents.push(event);
        }
      }
    });

    const [secret] = await broker.resolve({
      scope,
      purpose: 'agent',
      refs: [
        {
          id: 'secret-1',
          name: 'Claude API key',
          scope: 'workspace',
          refKey: 'env:ANTHROPIC_API_KEY',
          targetName: 'ANTHROPIC_API_KEY',
          delivery: 'env'
        }
      ]
    });

    expect(secret).toMatchObject({
      delivery: 'env',
      name: 'ANTHROPIC_API_KEY',
      value: 'sk-test-secret'
    });
    expect(secret?.expiresAt?.toISOString()).toBe('2026-01-01T00:01:00.000Z');
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      decision: 'issued',
      refId: 'secret-1',
      refKey: 'env:ANTHROPIC_API_KEY',
      targetName: 'ANTHROPIC_API_KEY'
    });
    expect(JSON.stringify(auditEvents)).not.toContain('sk-test-secret');
  });

  it('fails closed when an env secret is not allowlisted', async () => {
    const auditEvents: SecretBrokerAuditEvent[] = [];
    const broker = new EnvironmentSecretBroker({
      env: { OPENAI_API_KEY: 'sk-openai' },
      allowedEnvVars: ['ANTHROPIC_API_KEY'],
      auditSink: {
        record(event) {
          auditEvents.push(event);
        }
      }
    });

    await expect(
      broker.resolve({
        scope,
        purpose: 'agent',
        refs: [
          {
            id: 'secret-1',
            name: 'OpenAI API key',
            scope: 'workspace',
            refKey: 'env:OPENAI_API_KEY'
          }
        ]
      })
    ).rejects.toBeInstanceOf(SecretBrokerResolutionError);
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      decision: 'rejected',
      reason: 'env secret is not allowlisted: OPENAI_API_KEY'
    });
    expect(JSON.stringify(auditEvents)).not.toContain('sk-openai');
  });

  it('requires delivery allowlist before returning a secret value', async () => {
    const broker = new EnvironmentSecretBroker({
      env: { TOOL_TOKEN: 'secret-tool-token' },
      allowedEnvVars: ['TOOL_TOKEN'],
      allowedDeliveries: ['env']
    });

    await expect(
      broker.resolve({
        scope,
        purpose: 'tool',
        refs: [
          {
            id: 'secret-tool-token',
            name: 'Tool token',
            scope: 'workspace',
            refKey: 'env:TOOL_TOKEN',
            delivery: 'file'
          }
        ]
      })
    ).rejects.toThrow('secret delivery is not allowlisted: file');
  });

  it('issues allowlisted file secrets without putting raw values in audit events', async () => {
    const auditEvents: SecretBrokerAuditEvent[] = [];
    const broker = new EnvironmentSecretBroker({
      env: { GOOGLE_CREDENTIALS_JSON: '{"type":"service_account"}' },
      allowedEnvVars: ['GOOGLE_CREDENTIALS_JSON'],
      allowedDeliveries: ['file'],
      auditSink: {
        record(event) {
          auditEvents.push(event);
        }
      }
    });

    const [secret] = await broker.resolve({
      scope,
      purpose: 'tool',
      refs: [
        {
          id: 'secret-google-credentials',
          name: 'Google credentials',
          scope: 'workspace',
          refKey: 'env:GOOGLE_CREDENTIALS_JSON',
          targetName: 'GOOGLE_APPLICATION_CREDENTIALS',
          delivery: 'file'
        }
      ]
    });

    expect(secret).toMatchObject({
      delivery: 'file',
      name: 'GOOGLE_APPLICATION_CREDENTIALS',
      value: '{"type":"service_account"}'
    });
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      decision: 'issued',
      delivery: 'file',
      targetName: 'GOOGLE_APPLICATION_CREDENTIALS'
    });
    expect(JSON.stringify(auditEvents)).not.toContain('service_account');
  });

  it('issues scoped proxy tokens without exposing raw secret values', async () => {
    const auditEvents: SecretBrokerAuditEvent[] = [];
    const broker = new EnvironmentSecretBroker({
      env: { PRIVATE_API_TOKEN: 'raw-private-token' },
      allowedEnvVars: ['PRIVATE_API_TOKEN'],
      allowedDeliveries: ['proxy'],
      defaultTtlMs: 60_000,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      proxyTokenSigningKey: 'proxy-signing-key',
      auditSink: {
        record(event) {
          auditEvents.push(event);
        }
      }
    });

    const [secret] = await broker.resolve({
      scope,
      purpose: 'tool',
      refs: [
        {
          id: 'secret-private-api',
          name: 'Private API token',
          scope: 'workspace',
          refKey: 'env:PRIVATE_API_TOKEN',
          targetName: 'PRIVATE_API_PROXY_TOKEN',
          delivery: 'proxy'
        }
      ]
    });

    expect(secret?.delivery).toBe('proxy');
    expect(secret?.name).toBe('PRIVATE_API_PROXY_TOKEN');
    expect(secret?.value).toMatch(/^cagp\.v1\./);
    expect(secret?.value).not.toContain('raw-private-token');
    const payload = JSON.parse(Buffer.from(secret?.value?.split('.')[2] ?? '', 'base64url').toString('utf8'));
    expect(payload).toMatchObject({
      aud: 'cloud-agent-secret-proxy',
      purpose: 'tool',
      refId: 'secret-private-api',
      refKey: 'env:PRIVATE_API_TOKEN',
      targetName: 'PRIVATE_API_PROXY_TOKEN'
    });
    expect(payload.scope).toEqual(scope);
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      decision: 'issued',
      delivery: 'proxy',
      targetName: 'PRIVATE_API_PROXY_TOKEN'
    });
    expect(JSON.stringify(auditEvents)).not.toContain('raw-private-token');
  });

  it('verifies scoped proxy tokens without resolving raw secret values', async () => {
    const broker = new EnvironmentSecretBroker({
      env: { PRIVATE_API_TOKEN: 'raw-private-token' },
      allowedEnvVars: ['PRIVATE_API_TOKEN'],
      allowedDeliveries: ['proxy'],
      defaultTtlMs: 60_000,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      proxyTokenSigningKey: 'proxy-signing-key'
    });

    const [secret] = await broker.resolve({
      scope,
      purpose: 'tool',
      refs: [
        {
          id: 'secret-private-api',
          name: 'Private API token',
          scope: 'workspace',
          refKey: 'env:PRIVATE_API_TOKEN',
          targetName: 'PRIVATE_API_PROXY_TOKEN',
          delivery: 'proxy'
        }
      ]
    });

    const verified = verifySecretProxyToken({
      now: new Date('2026-01-01T00:00:30.000Z'),
      signingKey: 'proxy-signing-key',
      token: secret?.value ?? ''
    });

    expect(verified).toMatchObject({
      ok: true,
      claims: {
        purpose: 'tool',
        refId: 'secret-private-api',
        refKey: 'env:PRIVATE_API_TOKEN',
        targetName: 'PRIVATE_API_PROXY_TOKEN'
      }
    });
    expect(JSON.stringify(verified)).not.toContain('raw-private-token');
  });

  it('rejects expired or tampered proxy tokens', async () => {
    const broker = new EnvironmentSecretBroker({
      env: { PRIVATE_API_TOKEN: 'raw-private-token' },
      allowedEnvVars: ['PRIVATE_API_TOKEN'],
      allowedDeliveries: ['proxy'],
      defaultTtlMs: 60_000,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      proxyTokenSigningKey: 'proxy-signing-key'
    });

    const [secret] = await broker.resolve({
      scope,
      purpose: 'tool',
      refs: [
        {
          id: 'secret-private-api',
          name: 'Private API token',
          scope: 'workspace',
          refKey: 'env:PRIVATE_API_TOKEN',
          targetName: 'PRIVATE_API_PROXY_TOKEN',
          delivery: 'proxy'
        }
      ]
    });
    const token = secret?.value ?? '';
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[2] ?? '', 'base64url').toString('utf8'));
    payload.targetName = 'DIFFERENT_TARGET';
    const tamperedToken = `cagp.v1.${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}.${parts[3]}`;

    expect(
      verifySecretProxyToken({
        now: new Date('2026-01-01T00:02:00.000Z'),
        signingKey: 'proxy-signing-key',
        token
      })
    ).toMatchObject({
      ok: false,
      reason: 'expired'
    });
    expect(
      verifySecretProxyToken({
        now: new Date('2026-01-01T00:00:30.000Z'),
        signingKey: 'proxy-signing-key',
        token: tamperedToken
      })
    ).toMatchObject({
      ok: false,
      reason: 'invalid_signature'
    });
  });

  it('fails closed for proxy delivery when no signing key is configured', async () => {
    const auditEvents: SecretBrokerAuditEvent[] = [];
    const broker = new EnvironmentSecretBroker({
      env: { PRIVATE_API_TOKEN: 'raw-private-token' },
      allowedEnvVars: ['PRIVATE_API_TOKEN'],
      allowedDeliveries: ['proxy'],
      auditSink: {
        record(event) {
          auditEvents.push(event);
        }
      }
    });

    await expect(
      broker.resolve({
        scope,
        purpose: 'tool',
        refs: [
          {
            id: 'secret-private-api',
            name: 'Private API token',
            scope: 'workspace',
            refKey: 'env:PRIVATE_API_TOKEN',
            targetName: 'PRIVATE_API_PROXY_TOKEN',
            delivery: 'proxy'
          }
        ]
      })
    ).rejects.toThrow('proxy token signing key is not configured');
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      decision: 'rejected',
      delivery: 'proxy',
      reason: 'proxy token signing key is not configured'
    });
    expect(JSON.stringify(auditEvents)).not.toContain('raw-private-token');
  });
});
