import { readServerEnv } from './server-env';

export type AgentProviderId = 'claude' | 'codex';

export interface AgentProviderOption {
  id: AgentProviderId;
  label: string;
  status: 'available' | 'planned';
  configured: boolean;
}

export function getAgentProviderOptions(): AgentProviderOption[] {
  const env = readServerEnv();
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
      status: 'planned',
      configured: false,
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
