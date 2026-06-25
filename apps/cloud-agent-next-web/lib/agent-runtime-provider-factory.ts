import {
  ClaudeAgentAdapter,
  CodexAgentAdapter,
  DEFAULT_CLAUDE_AGENT_DOCKER_IMAGE,
  DEFAULT_CODEX_AGENT_DOCKER_IMAGE,
  DockerClaudeAgentAdapter,
  DockerCodexAgentAdapter,
  materializeCodexHomeAuth,
  resolveCodexAgentConfig,
  resolveClaudeAgentConfig,
  type AgentAdapter,
  type ClaudeAgentConfigInput
} from '@agent-infra/cloud-agent-runtime';

import {
  createDurablePermissionBrokerFromEnv,
  shouldUseDurablePermissionBroker
} from './durable-permission-broker';
import { readCodexDockerInnerSandboxMode, readWebClaudeAgentTimeoutMs, readWebCodexAgentTimeoutMs } from './agent-runtime-config';
import { createDbProviderTranscriptStore } from './provider-transcript-store';
import type { resolveCloudWorkspaceRuntimePaths } from './workspace-runtime';

type RuntimePaths = ReturnType<typeof resolveCloudWorkspaceRuntimePaths> & {
  providerConfigDir: string;
};

export type AgentExecutionMode = 'docker' | 'local';

export type ProviderAdapterFactoryResult =
  | {
      adapter: AgentAdapter;
    }
  | {
      fallbackContent: string;
    };

export async function createCodexAdapterForTurn(input: {
  credentialsDir: string;
  env: Record<string, string | undefined>;
  executionMode: AgentExecutionMode;
  guestCredentialsDir: string;
  runtimePaths: RuntimePaths;
}): Promise<ProviderAdapterFactoryResult> {
  const codexConfig = resolveCodexAgentConfig({
    configDir: input.runtimePaths.providerConfigDir,
    defaultTimeoutMs: readWebCodexAgentTimeoutMs(input.env),
    env: input.env
  });
  await materializeCodexHomeAuth({
    authMode: codexConfig.authMode,
    configDir: input.runtimePaths.providerConfigDir,
    sourceHome: codexConfig.codexHomeAuthSource
  });

  if (!codexConfig.configured) {
    return {
      fallbackContent: [
        'CodexAgentAdapter is wired, but CODEX_API_KEY / OPENAI_API_KEY / DEEPSEEK_API_KEY is empty.',
        'For DeepSeek smoke, set DEEPSEEK_API_KEY or reuse ANTHROPIC_API_KEY with ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic, then restart the dev server.'
      ].join('\n')
    };
  }

  return {
    adapter:
      input.executionMode === 'docker'
        ? new DockerCodexAgentAdapter({
            ...codexConfig.adapterOptions,
            guestWorkspacePath: input.runtimePaths.guestWorkspacePath,
            hostConfigDir: input.runtimePaths.providerConfigDir,
            hostCredentialsDir: input.credentialsDir,
            guestCredentialsDir: input.guestCredentialsDir,
            hostWorkspacePath: input.runtimePaths.hostWorkspacePath,
            image: input.env.CLOUD_AGENT_CODEX_DOCKER_IMAGE?.trim() || DEFAULT_CODEX_AGENT_DOCKER_IMAGE,
            sandboxMode: readCodexDockerInnerSandboxMode(input.env),
            transcriptStore: createDbProviderTranscriptStore()
          })
        : new CodexAgentAdapter({
            ...codexConfig.adapterOptions,
            transcriptStore: createDbProviderTranscriptStore(),
            workingDirectory: input.runtimePaths.hostWorkspacePath
          })
  };
}

export function createClaudeAdapterForTurn(input: {
  credentialsDir: string;
  env: Record<string, string | undefined>;
  executionMode: AgentExecutionMode;
  guestCredentialsDir: string;
  mcpServers: ClaudeAgentConfigInput['mcpServers'];
  runtimePaths: RuntimePaths;
  skills: string[] | null;
  toolAllowlist: string[] | null;
}): ProviderAdapterFactoryResult {
  const claudeConfig = resolveClaudeAgentConfig({
    clientApp: 'agent-infra/cloud-agent-next-web',
    configDir: input.runtimePaths.providerConfigDir,
    defaultTimeoutMs: readWebClaudeAgentTimeoutMs(input.env),
    enableBashTool: true,
    env: input.env,
    mcpServers: input.mcpServers,
    skills: input.skills,
    strictMcpConfig: true,
    toolAllowlist: input.toolAllowlist
  });

  if (!claudeConfig.configured) {
    return {
      fallbackContent: [
        'ClaudeAgentAdapter is wired, but ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN is empty.',
        'Add it to apps/cloud-agent-next-web/.env.local or configure a workspace secret ref and restart the dev server.'
      ].join('\n')
    };
  }

  const permissionBroker = shouldUseDurablePermissionBroker(input.env)
    ? createDurablePermissionBrokerFromEnv(input.env)
    : undefined;

  return {
    adapter:
      input.executionMode === 'docker'
        ? new DockerClaudeAgentAdapter({
            ...claudeConfig.adapterOptions,
            guestWorkspacePath: input.runtimePaths.guestWorkspacePath,
            hostConfigDir: input.runtimePaths.providerConfigDir,
            hostCredentialsDir: input.credentialsDir,
            guestCredentialsDir: input.guestCredentialsDir,
            hostWorkspacePath: input.runtimePaths.hostWorkspacePath,
            image: input.env.CLOUD_AGENT_CLAUDE_DOCKER_IMAGE?.trim() || DEFAULT_CLAUDE_AGENT_DOCKER_IMAGE,
            permissionBroker,
            transcriptStore: createDbProviderTranscriptStore()
          })
        : new ClaudeAgentAdapter({
            ...claudeConfig.adapterOptions,
            cwd: input.runtimePaths.hostWorkspacePath,
            permissionBroker,
            transcriptStore: createDbProviderTranscriptStore()
          })
  };
}
