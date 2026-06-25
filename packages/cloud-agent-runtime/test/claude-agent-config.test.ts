import { describe, expect, it } from 'vitest';

import { resolveClaudeAgentConfig } from '../src/claude-agent-config';

describe('resolveClaudeAgentConfig', () => {
  it('maps DeepSeek-compatible Claude Code env to a minimal subprocess env', () => {
    const config = resolveClaudeAgentConfig({
      clientApp: 'test-app',
      configDir: '/tmp/claude-config',
      env: {
        ANTHROPIC_API_KEY: 'sk-test',
        ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
        HOME: '/home/test',
        PATH: '/bin',
        TMPDIR: '/tmp'
      }
    });

    expect(config.configured).toBe(true);
    expect(config.isDeepSeek).toBe(true);
    expect(config.model).toBe('deepseek-v4-flash');
    expect(config.tokenSource).toBe('ANTHROPIC_API_KEY');
    expect(config.adapterOptions.permissionMode).toBe('acceptEdits');
    expect(config.adapterOptions.thinking).toEqual({ type: 'disabled' });
    expect(config.adapterOptions.tools).toEqual([]);
    expect(config.adapterOptions.timeoutMs).toBe(5_000);
    expect(config.adapterOptions.env).toMatchObject({
      ANTHROPIC_AUTH_TOKEN: 'sk-test',
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
      ANTHROPIC_MODEL: 'deepseek-v4-flash',
      CLAUDE_AGENT_SDK_CLIENT_APP: 'test-app',
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      CLAUDE_CONFIG_DIR: '/tmp/claude-config'
    });
    expect(config.adapterOptions.env?.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('prefers native Anthropic API key naming outside DeepSeek mode', () => {
    const config = resolveClaudeAgentConfig({
      clientApp: 'test-app',
      configDir: '/tmp/claude-config',
      env: {
        ANTHROPIC_API_KEY: 'sk-ant-test',
        CLAUDE_AGENT_TIMEOUT_MS: '9000'
      }
    });

    expect(config.configured).toBe(true);
    expect(config.isDeepSeek).toBe(false);
    expect(config.adapterOptions.permissionMode).toBe('acceptEdits');
    expect(config.adapterOptions.timeoutMs).toBe(9_000);
    expect(config.adapterOptions.env).toMatchObject({
      ANTHROPIC_API_KEY: 'sk-ant-test',
      CLAUDE_AGENT_SDK_CLIENT_APP: 'test-app',
      CLAUDE_CONFIG_DIR: '/tmp/claude-config'
    });
  });

  it('maps custom Claude Code gateways to ANTHROPIC_AUTH_TOKEN', () => {
    const config = resolveClaudeAgentConfig({
      clientApp: 'test-app',
      configDir: '/tmp/claude-config',
      env: {
        ANTHROPIC_API_KEY: 'sk-router-test',
        ANTHROPIC_BASE_URL: 'https://anyrouter.top'
      }
    });

    expect(config.configured).toBe(true);
    expect(config.isCustomBaseUrl).toBe(true);
    expect(config.isDeepSeek).toBe(false);
    expect(config.model).toBeUndefined();
    expect(config.tokenSource).toBe('ANTHROPIC_API_KEY');
    expect(config.adapterOptions.env).toMatchObject({
      ANTHROPIC_AUTH_TOKEN: 'sk-router-test',
      ANTHROPIC_BASE_URL: 'https://anyrouter.top',
      CLAUDE_AGENT_SDK_CLIENT_APP: 'test-app',
      CLAUDE_CONFIG_DIR: '/tmp/claude-config'
    });
    expect(config.adapterOptions.env?.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('enables the minimal workspace file tool set for agent runs', () => {
    const config = resolveClaudeAgentConfig({
      clientApp: 'test-app',
      configDir: '/tmp/claude-config',
      enableBashTool: true,
      env: {
        ANTHROPIC_API_KEY: 'sk-test',
        ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic'
      }
    });

    expect(config.adapterOptions.allowedTools).toEqual(['Bash', 'Read', 'Write', 'Edit']);
    expect(config.adapterOptions.tools).toEqual(['Bash', 'Read', 'Write', 'Edit']);
    expect(config.adapterOptions.includePartialMessages).toBe(true);
    expect(config.adapterOptions.maxTurns).toBeUndefined();
  });

  it('uses an explicit workspace tool allowlist when provided', () => {
    const config = resolveClaudeAgentConfig({
      clientApp: 'test-app',
      configDir: '/tmp/claude-config',
      enableBashTool: true,
      env: {
        ANTHROPIC_API_KEY: 'sk-test'
      },
      toolAllowlist: ['Read', 'Edit']
    });

    expect(config.adapterOptions.allowedTools).toEqual(['Read', 'Edit']);
    expect(config.adapterOptions.tools).toEqual(['Read', 'Edit']);
  });

  it('does not pre-approve workspace tools in default permission mode', () => {
    const config = resolveClaudeAgentConfig({
      clientApp: 'test-app',
      configDir: '/tmp/claude-config',
      enableBashTool: true,
      env: {
        ANTHROPIC_API_KEY: 'sk-test',
        CLAUDE_AGENT_PERMISSION_MODE: 'default'
      }
    });

    expect(config.adapterOptions.allowedTools).toBeUndefined();
    expect(config.adapterOptions.permissionMode).toBe('default');
    expect(config.adapterOptions.tools).toEqual(['Bash', 'Read', 'Write', 'Edit']);
  });

  it('passes explicit MCP servers and skills into the SDK options', () => {
    const config = resolveClaudeAgentConfig({
      clientApp: 'test-app',
      configDir: '/tmp/claude-config',
      env: {
        ANTHROPIC_API_KEY: 'sk-test'
      },
      mcpServers: {
        docs: {
          type: 'http',
          url: 'https://mcp.example.com'
        }
      },
      skills: ['repo-review'],
      strictMcpConfig: true
    });

    expect(config.adapterOptions.mcpServers).toEqual({
      docs: {
        type: 'http',
        url: 'https://mcp.example.com'
      }
    });
    expect(config.adapterOptions.skills).toEqual(['repo-review']);
    expect(config.adapterOptions.strictMcpConfig).toBe(true);
  });
});
