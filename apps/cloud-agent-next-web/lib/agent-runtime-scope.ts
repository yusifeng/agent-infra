import { mkdir, rm } from 'node:fs/promises';

import type { RuntimeScope } from '@agent-infra/cloud-agent-runtime';

import type { CloudAgentUser } from './auth';
import type { AgentProviderId } from './provider-config';
import type { CloudThread } from './thread-store';
import {
  CLOUD_AGENT_TENANT_ID,
  resolveCloudWorkspaceRuntimePaths,
  resolveRunCredentialsDir
} from './workspace-runtime';

export type ProviderRuntimePaths = ReturnType<typeof resolveCloudWorkspaceRuntimePaths> & {
  providerConfigDir: string;
};

export interface PreparedRuntimeScope {
  credentialsDir: string;
  runtimePaths: ProviderRuntimePaths;
  scope: RuntimeScope;
}

export async function prepareRuntimeScope(input: {
  provider: AgentProviderId;
  runId?: string | null;
  thread: CloudThread;
  user: CloudAgentUser;
}): Promise<PreparedRuntimeScope> {
  const runtimePaths = resolveCloudWorkspaceRuntimePaths({
    userId: input.user.id,
    workspaceId: input.thread.workspaceId,
    provider: input.provider
  });
  if (!runtimePaths.providerConfigDir) {
    throw new Error(`Missing provider config directory for provider: ${input.provider}`);
  }

  const providerRuntimePaths: ProviderRuntimePaths = {
    ...runtimePaths,
    providerConfigDir: runtimePaths.providerConfigDir
  };
  const scope: RuntimeScope = {
    tenantId: CLOUD_AGENT_TENANT_ID,
    userId: input.user.id,
    workspaceId: providerRuntimePaths.workspaceId,
    threadId: input.thread.id,
    runId: input.runId ?? null
  };
  const credentialsDir = resolveRunCredentialsDir(providerRuntimePaths.credentialsDir, input.runId);
  if (input.runId) {
    await rm(credentialsDir, { force: true, recursive: true });
  }
  await Promise.all([
    mkdir(providerRuntimePaths.hostWorkspacePath, { recursive: true }),
    mkdir(providerRuntimePaths.providerConfigDir, { recursive: true }),
    mkdir(credentialsDir, { recursive: true })
  ]);

  return {
    credentialsDir,
    runtimePaths: providerRuntimePaths,
    scope
  };
}
