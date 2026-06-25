import type { AgentProfile } from '@agent-infra/core';
import { parseDockerContainerRuntime, type DockerContainerRuntime } from '@agent-infra/cloud-agent-runtime';

import type { AgentProviderId } from './provider-config';

const DEFAULT_WEB_CLAUDE_AGENT_TIMEOUT_MS = 120_000;
const DEFAULT_WEB_CODEX_AGENT_TIMEOUT_MS = 120_000;

export function readWebClaudeAgentTimeoutMs(env: Record<string, string | undefined>): number {
  const configured = Number(env.CLOUD_AGENT_WEB_CLAUDE_TIMEOUT_MS?.trim());
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_WEB_CLAUDE_AGENT_TIMEOUT_MS;
}

export function readWebCodexAgentTimeoutMs(env: Record<string, string | undefined>): number {
  const configured = Number(env.CLOUD_AGENT_WEB_CODEX_TIMEOUT_MS?.trim());
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_WEB_CODEX_AGENT_TIMEOUT_MS;
}

export function readAgentExecutionMode(
  provider: AgentProviderId,
  env: Record<string, string | undefined>,
  profile: AgentProfile | null
): 'docker' | 'local' {
  if (provider === 'codex') {
    return readCodexExecutionMode(env, profile);
  }

  return readClaudeExecutionMode(env, profile);
}

export function readCodexDockerInnerSandboxMode(
  env: Record<string, string | undefined>
): 'danger-full-access' | 'read-only' | 'workspace-write' {
  const value = env.CLOUD_AGENT_CODEX_DOCKER_INNER_SANDBOX_MODE?.trim();
  if (value === 'read-only' || value === 'workspace-write' || value === 'danger-full-access') {
    return value;
  }

  return 'danger-full-access';
}

export function readDockerRuntime(env: Record<string, string | undefined>): DockerContainerRuntime | undefined {
  return parseDockerContainerRuntime(env.CLOUD_AGENT_DOCKER_RUNTIME);
}

function readClaudeExecutionMode(
  env: Record<string, string | undefined>,
  profile: AgentProfile | null
): 'docker' | 'local' {
  if (profile?.sandboxMode === 'local' || profile?.sandboxMode === 'docker') {
    return profile.sandboxMode;
  }

  return env.CLOUD_AGENT_CLAUDE_EXECUTION?.trim() === 'local' ? 'local' : 'docker';
}

function readCodexExecutionMode(
  env: Record<string, string | undefined>,
  profile: AgentProfile | null
): 'docker' | 'local' {
  if (profile?.sandboxMode === 'local' || profile?.sandboxMode === 'docker') {
    return profile.sandboxMode;
  }

  return env.CLOUD_AGENT_CODEX_EXECUTION?.trim() === 'local' ? 'local' : 'docker';
}
