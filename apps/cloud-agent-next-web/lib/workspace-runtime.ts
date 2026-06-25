import path from 'node:path';

import { DEFAULT_CLOUD_WORKSPACE_ID, resolveWorkspaceRuntimePaths } from '@agent-infra/cloud-agent-runtime';

import type { AgentProviderId } from './provider-config';
import { readServerEnv } from './server-env';

export const CLOUD_AGENT_TENANT_ID = 'local-dev';

export function resolveCloudAgentDataDir(): string {
  const configuredDir = readServerEnv().CLOUD_AGENT_DATA_DIR?.trim();
  if (configuredDir) {
    return path.resolve(/* turbopackIgnore: true */ configuredDir);
  }

  return path.join(process.cwd(), '.cloud-agent-data');
}

export function resolveCloudWorkspaceRuntimePaths(input: {
  userId: string;
  workspaceId?: string | null;
  provider?: AgentProviderId | null;
  runId?: string | null;
  isolationId?: string | null;
}) {
  return resolveWorkspaceRuntimePaths({
    dataRoot: resolveCloudAgentDataDir(),
    tenantId: CLOUD_AGENT_TENANT_ID,
    userId: input.userId,
    workspaceId: input.workspaceId || DEFAULT_CLOUD_WORKSPACE_ID,
    provider: input.provider,
    runId: input.runId,
    isolationId: input.isolationId
  });
}

export function resolveRunCredentialsDir(baseCredentialsDir: string, runId: string | null | undefined): string {
  return runId ? path.join(baseCredentialsDir, 'runs', safePathSegment(runId)) : baseCredentialsDir;
}

export function safePathSegment(value: string): string {
  return value.replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'segment';
}
