import { describe, expect, it } from 'vitest';

import { resolveCodexAgentConfig } from '../src/codex-agent-config';

describe('resolveCodexAgentConfig', () => {
  it('maps native OpenAI env into Codex adapter options', () => {
    const config = resolveCodexAgentConfig({
      configDir: '/tmp/codex-home',
      env: {
        CODEX_API_KEY: 'sk-codex',
        CODEX_BASE_URL: 'https://api.openai.example',
        CODEX_MODEL: 'gpt-test',
        CODEX_MODEL_REASONING_EFFORT: 'low',
        CODEX_NETWORK_ACCESS_ENABLED: 'true',
        CODEX_SANDBOX_MODE: 'read-only',
        CODEX_APPROVAL_POLICY: 'on-request',
        CODEX_AGENT_TIMEOUT_MS: '9000',
        HOME: '/home/test',
        PATH: '/bin',
        TMPDIR: '/tmp'
      }
    });

    expect(config.configured).toBe(true);
    expect(config.apiKeySource).toBe('CODEX_API_KEY');
    expect(config.baseUrl).toBe('https://api.openai.example');
    expect(config.model).toBe('gpt-test');
    expect(config.isDeepSeek).toBe(false);
    expect(config.adapterOptions).toMatchObject({
      apiKey: 'sk-codex',
      approvalPolicy: 'on-request',
      baseUrl: 'https://api.openai.example',
      model: 'gpt-test',
      modelReasoningEffort: 'low',
      networkAccessEnabled: true,
      sandboxMode: 'read-only',
      skipGitRepoCheck: true,
      timeoutMs: 9_000
    });
    expect(config.adapterOptions.env).toEqual({
      CODEX_HOME: '/tmp/codex-home',
      HOME: '/home/test',
      PATH: '/bin',
      TMPDIR: '/tmp'
    });
  });

  it('uses DeepSeek OpenAI-compatible base URL and cheap flash model by default', () => {
    const config = resolveCodexAgentConfig({
      configDir: '/tmp/codex-home',
      env: {
        DEEPSEEK_API_KEY: 'sk-deepseek'
      }
    });

    expect(config.configured).toBe(true);
    expect(config.apiKeySource).toBe('DEEPSEEK_API_KEY');
    expect(config.baseUrl).toBe('https://api.deepseek.com');
    expect(config.isDeepSeek).toBe(true);
    expect(config.model).toBe('deepseek-v4-flash');
    expect(config.adapterOptions.modelReasoningEffort).toBeUndefined();
    expect(config.adapterOptions.approvalPolicy).toBe('never');
    expect(config.adapterOptions.sandboxMode).toBe('workspace-write');
  });

  it('reuses a DeepSeek Anthropic key without passing the Anthropic base URL to Codex', () => {
    const config = resolveCodexAgentConfig({
      configDir: '/tmp/codex-home',
      env: {
        ANTHROPIC_API_KEY: 'sk-deepseek',
        ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic'
      }
    });

    expect(config.configured).toBe(true);
    expect(config.apiKeySource).toBe('ANTHROPIC_API_KEY');
    expect(config.baseUrl).toBe('https://api.deepseek.com');
    expect(config.isDeepSeek).toBe(true);
    expect(config.adapterOptions.apiKey).toBe('sk-deepseek');
    expect(config.adapterOptions.baseUrl).toBe('https://api.deepseek.com');
  });

  it('normalizes accidentally copied DeepSeek Anthropic base URLs', () => {
    const config = resolveCodexAgentConfig({
      configDir: '/tmp/codex-home',
      env: {
        DEEPSEEK_API_KEY: 'sk-deepseek',
        CODEX_BASE_URL: 'https://api.deepseek.com/anthropic/'
      }
    });

    expect(config.baseUrl).toBe('https://api.deepseek.com');
    expect(config.model).toBe('deepseek-v4-flash');
  });

  it('keeps invalid optional policy values on safe defaults', () => {
    const config = resolveCodexAgentConfig({
      configDir: '/tmp/codex-home',
      env: {
        OPENAI_API_KEY: 'sk-openai',
        CODEX_APPROVAL_POLICY: 'always',
        CODEX_MODEL_REASONING_EFFORT: 'max',
        CODEX_NETWORK_ACCESS_ENABLED: 'no',
        CODEX_SANDBOX_MODE: 'host'
      }
    });

    expect(config.adapterOptions.approvalPolicy).toBe('never');
    expect(config.adapterOptions.modelReasoningEffort).toBeUndefined();
    expect(config.adapterOptions.networkAccessEnabled).toBe(false);
    expect(config.adapterOptions.sandboxMode).toBe('workspace-write');
  });

  it('allows a dev-only Codex home auth cache without an API key', () => {
    const config = resolveCodexAgentConfig({
      configDir: '/tmp/runtime-codex-home',
      env: {
        CODEX_AUTH_MODE: 'codex-home',
        CODEX_HOME: '/Users/test/.codex',
        CODEX_MODEL: 'gpt-5.4',
        ANTHROPIC_AUTH_TOKEN: 'sk-deepseek',
        ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic'
      }
    });

    expect(config.configured).toBe(true);
    expect(config.apiKeySource).toBe('CODEX_HOME_AUTH');
    expect(config.authMode).toBe('codex-home');
    expect(config.codexHomeAuthSource).toBe('/Users/test/.codex');
    expect(config.baseUrl).toBeNull();
    expect(config.isDeepSeek).toBe(false);
    expect(config.adapterOptions.apiKey).toBeUndefined();
    expect(config.adapterOptions.env).toMatchObject({
      CODEX_HOME: '/tmp/runtime-codex-home'
    });
    expect(config.model).toBe('gpt-5.4');
  });

  it('exposes redacted diagnostics without API key or codex home paths', () => {
    const config = resolveCodexAgentConfig({
      configDir: '/tmp/runtime-codex-home',
      env: {
        CODEX_AUTH_MODE: 'codex-home',
        CODEX_HOME: '/Users/test/.codex',
        CODEX_MODEL: 'gpt-5.4',
        OPENAI_API_KEY: 'sk-openai-secret'
      }
    });

    expect(config.diagnostics).toMatchObject({
      apiKeySource: 'OPENAI_API_KEY',
      approvalPolicy: 'never',
      authMode: 'api-key',
      codexHomeAuthSourceConfigured: true,
      configured: true,
      model: 'gpt-5.4',
      sandboxMode: 'workspace-write',
      timeoutMs: 5_000
    });
    const diagnosticsJson = JSON.stringify(config.diagnostics);
    expect(diagnosticsJson).not.toContain('sk-openai-secret');
    expect(diagnosticsJson).not.toContain('/Users/test/.codex');
    expect(diagnosticsJson).not.toContain('/tmp/runtime-codex-home');
  });
});
