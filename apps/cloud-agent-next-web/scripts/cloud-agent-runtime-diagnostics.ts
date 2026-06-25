import {
  readAgentExecutionMode,
  readCodexDockerInnerSandboxMode,
  readDockerRuntime
} from '../lib/agent-runtime-config';
import {
  getClaudeRuntimeConfig,
  getCodexRuntimeConfig,
  getDefaultAgentProvider,
  getAgentProviderOptions,
  type AgentProviderId
} from '../lib/provider-config';
import { getCloudAgentRunQueueDiagnostics } from '../lib/run-queue-provider';
import { readServerEnv } from '../lib/server-env';
import { resolveCloudWorkspaceRuntimePaths } from '../lib/workspace-runtime';

const env = readServerEnv();
const queue = getCloudAgentRunQueueDiagnostics();
const defaultProvider = getDefaultAgentProvider();
const diagnostics = {
  defaultProvider,
  providers: getAgentProviderOptions().map((provider) => ({
    ...provider,
    executionMode: readProviderExecutionMode(provider.id)
  })),
  queue,
  runtime: {
    codexDockerInnerSandboxMode: readCodexDockerInnerSandboxMode(env),
    dockerRuntime: readDockerRuntime(env) ?? 'default',
    forcedEnvKeys: readForcedEnvKeys(),
    knownIssues: [
      'in-process executes runs from the request process and is only for local development.',
      'db-queue requires a separate worker process; use dev:local-worker and worker:local together for local smoke.',
      'A hosted Next control plane cannot share local SQLite with a home worker; use a shared durable DB/queue.',
      'CLOUD_AGENT_DOCKER_RUNTIME=runsc requires a Linux host with gVisor installed and smoke tested.'
    ]
  },
  sdk: {
    claude: getClaudeRuntimeConfig(),
    codex: getCodexRuntimeConfig()
  },
  workspace: {
    adminClaude: readWorkspacePaths('admin', 'claude'),
    adminCodex: readWorkspacePaths('admin', 'codex')
  }
};

console.log(JSON.stringify(diagnostics, null, 2));

function readProviderExecutionMode(provider: AgentProviderId): 'docker' | 'local' {
  return readAgentExecutionMode(provider, env, null);
}

function readWorkspacePaths(userId: string, provider: AgentProviderId) {
  const paths = resolveCloudWorkspaceRuntimePaths({ provider, userId });
  return {
    credentialsDir: paths.credentialsDir,
    guestWorkspacePath: paths.guestWorkspacePath,
    hostWorkspacePath: paths.hostWorkspacePath,
    providerConfigDir: paths.providerConfigDir
  };
}

function readForcedEnvKeys(): string[] {
  return env.CLOUD_AGENT_ENV_FORCE_KEYS?.split(',')
    .map((key) => key.trim())
    .filter(Boolean) ?? [];
}
