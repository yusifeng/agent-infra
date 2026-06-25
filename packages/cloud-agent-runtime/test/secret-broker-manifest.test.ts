import { describe, expect, it } from 'vitest';

import {
  getSecretBrokerProviderDiagnostics,
  getSecretBrokerProviderManifests,
  isSecretBrokerProviderKind,
  secretBrokerProviderNotImplementedMessage
} from '../src/secret-broker-manifest';

describe('secret broker provider manifest', () => {
  it('marks env broker as the only currently supported provider', () => {
    expect(getSecretBrokerProviderDiagnostics('env')).toMatchObject({
      configuredKind: 'env',
      error: null,
      ready: true
    });

    expect(getSecretBrokerProviderManifests().filter((provider) => provider.status === 'supported').map((provider) => provider.kind)).toEqual([
      'env'
    ]);
  });

  it('fails fast for planned production secret broker providers', () => {
    expect(getSecretBrokerProviderDiagnostics('vault')).toMatchObject({
      configuredKind: 'vault',
      ready: false,
      error: 'Secret broker provider "vault" is not implemented yet. Required env: VAULT_ADDR, VAULT_ROLE_ID.'
    });
    expect(secretBrokerProviderNotImplementedMessage('proxy')).toContain('CLOUD_AGENT_SECRET_PROXY_URL');
  });

  it('recognizes planned provider names without accepting arbitrary values', () => {
    expect(isSecretBrokerProviderKind('vault')).toBe(true);
    expect(isSecretBrokerProviderKind('kms')).toBe(true);
    expect(isSecretBrokerProviderKind('random')).toBe(false);
  });
});
