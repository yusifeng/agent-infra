import { resolveCodexAgentConfig } from '@agent-infra/cloud-agent-runtime';

import { readServerEnv } from './server-env';
import { resolveCloudWorkspaceRuntimePaths } from './workspace-runtime';

export type AgentProviderId = 'claude' | 'codex';

export interface AgentProviderOption {
  id: AgentProviderId;
  label: string;
  status: 'available' | 'planned';
  configured: boolean;
}

export function getAgentProviderOptions(): AgentProviderOption[] {
  const env = readServerEnv();
  const codexConfig = getCodexRuntimeConfig();
  return [
    {
      id: 'claude',
      label: 'Claude Code',
      status: 'available',
      configured: Boolean(env.ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_AUTH_TOKEN?.trim()),
    },
    {
      id: 'codex',
      label: 'Codex',
      status: 'available',
      configured: codexConfig.apiKeyConfigured,
    }
  ];
}

export function getDefaultAgentProvider(): AgentProviderId {
  return 'claude';
}

export function getClaudeRuntimeConfig() {
  const env = readServerEnv();
  return {
    apiKeyConfigured: Boolean(env.ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_AUTH_TOKEN?.trim()),
    baseUrlConfigured: Boolean(env.ANTHROPIC_BASE_URL?.trim()),
    baseUrl: env.ANTHROPIC_BASE_URL?.trim() || null,
    model: env.ANTHROPIC_MODEL?.trim() || null
  };
}

export function getCodexRuntimeConfig() {
  const env = readServerEnv();
  const runtimePaths = resolveCloudWorkspaceRuntimePaths({
    userId: 'admin',
    provider: 'codex'
  });
  const config = resolveCodexAgentConfig({
    configDir: runtimePaths.providerConfigDir ?? '',
    env
  });

  return {
    apiKeyConfigured: config.configured,
    apiKeySource: config.apiKeySource,
    baseUrlConfigured: Boolean(config.baseUrl),
    baseUrl: config.baseUrl,
    isDeepSeek: config.isDeepSeek,
    model: config.model ?? null
  };
}
