import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CLOUD_WORKSPACE_ID,
  DEFAULT_GUEST_WORKSPACE_PATH,
  resolveWorkspaceRuntimePaths
} from '../src/workspace-runtime-paths';

describe('resolveWorkspaceRuntimePaths', () => {
  it('resolves a stable per-user default workspace without using thread id', () => {
    const paths = resolveWorkspaceRuntimePaths({
      dataRoot: '/tmp/cloud-agent-data',
      tenantId: 'local-dev',
      userId: 'admin',
      provider: 'claude'
    });

    expect(paths.workspaceId).toBe(DEFAULT_CLOUD_WORKSPACE_ID);
    expect(paths.guestWorkspacePath).toBe(DEFAULT_GUEST_WORKSPACE_PATH);
    expect(paths.hostWorkspacePath).toContain(path.join('workspaces', 'local-dev-'));
    expect(paths.hostWorkspacePath).toContain(`${path.sep}admin-`);
    expect(paths.hostWorkspacePath).toContain(`${path.sep}default-`);
    expect(paths.providerConfigDir).toContain(path.join('provider-config', 'claude-'));
    expect(paths.credentialsDir).toContain(path.join('credentials', 'local-dev-'));
    expect(paths.privateHostWorkspacePath).toBeUndefined();
  });

  it('can reserve a private run workspace for future process isolation', () => {
    const paths = resolveWorkspaceRuntimePaths({
      dataRoot: '/tmp/cloud-agent-data',
      tenantId: 'local-dev',
      userId: 'admin',
      workspaceId: 'default',
      isolationId: 'run-1'
    });

    expect(paths.privateHostWorkspacePath).toContain(path.join('private-workspaces', 'local-dev-'));
    expect(paths.privateHostWorkspacePath).toContain(`${path.sep}default-`);
    expect(paths.privateHostWorkspacePath).toContain(`${path.sep}run-1-`);
  });
});
