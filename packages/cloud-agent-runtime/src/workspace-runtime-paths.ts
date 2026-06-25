import { createHash } from 'node:crypto';
import path from 'node:path';

export const DEFAULT_CLOUD_WORKSPACE_ID = 'default';
export const DEFAULT_GUEST_WORKSPACE_PATH = '/workspace';

export interface WorkspaceRuntimePathsInput {
  dataRoot: string;
  tenantId: string;
  userId: string;
  workspaceId?: string | null;
  provider?: string | null;
  runId?: string | null;
  isolationId?: string | null;
  guestWorkspacePath?: string | null;
}

export interface WorkspaceRuntimePaths {
  workspaceId: string;
  hostWorkspacePath: string;
  guestWorkspacePath: string;
  credentialsDir: string;
  providerConfigDir?: string;
  runArtifactsDir?: string;
  privateHostWorkspacePath?: string;
}

export function resolveWorkspaceRuntimePaths(input: WorkspaceRuntimePathsInput): WorkspaceRuntimePaths {
  const dataRoot = path.resolve(input.dataRoot);
  const tenantSegment = toPathSegment(input.tenantId, 'tenant');
  const userSegment = toPathSegment(input.userId, 'user');
  const workspaceId = input.workspaceId?.trim() || DEFAULT_CLOUD_WORKSPACE_ID;
  const workspaceSegment = toPathSegment(workspaceId, 'workspace');
  const guestWorkspacePath = input.guestWorkspacePath?.trim() || DEFAULT_GUEST_WORKSPACE_PATH;

  return {
    workspaceId,
    hostWorkspacePath: path.join(dataRoot, 'workspaces', tenantSegment, userSegment, workspaceSegment),
    guestWorkspacePath,
    credentialsDir: path.join(dataRoot, 'credentials', tenantSegment, userSegment),
    providerConfigDir: input.provider
      ? path.join(dataRoot, 'provider-config', toPathSegment(input.provider, 'provider'), tenantSegment, userSegment, workspaceSegment)
      : undefined,
    runArtifactsDir: input.runId
      ? path.join(dataRoot, 'runs', tenantSegment, userSegment, toPathSegment(input.runId, 'run'))
      : undefined,
    privateHostWorkspacePath: input.isolationId
      ? path.join(
          dataRoot,
          'private-workspaces',
          tenantSegment,
          userSegment,
          workspaceSegment,
          toPathSegment(input.isolationId, 'isolation')
        )
      : undefined
  };
}

function toPathSegment(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Missing path segment: ${fallback}`);
  }

  const readable = trimmed
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const hash = createHash('sha256').update(trimmed).digest('hex').slice(0, 12);

  return `${readable || fallback}-${hash}`;
}
