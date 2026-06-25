import { describe, expect, it } from 'vitest';

import { StaticPermissionBroker } from '../src/static-permission-broker';
import type { PermissionRequest } from '../src/types';

const request: PermissionRequest = {
  scope: {
    tenantId: 'tenant-1',
    userId: 'user-1',
    workspaceId: 'workspace-1',
    threadId: 'thread-1',
    runId: 'run-1'
  },
  provider: 'claude',
  permissionRequestId: 'permission-1',
  toolName: 'Bash',
  input: {
    command: 'pwd'
  }
};

describe('StaticPermissionBroker', () => {
  it('applies explicit per-tool overrides before the default decision', async () => {
    const broker = new StaticPermissionBroker({
      decision: 'denied',
      allowTools: ['Bash'],
      denyTools: ['Write'],
      resolvedByActorId: 'policy'
    });

    await expect(broker.resolve(request)).resolves.toMatchObject({
      decision: 'approved',
      resolvedByActorId: 'policy'
    });
    await expect(broker.resolve({ ...request, toolName: 'Write' })).resolves.toMatchObject({
      decision: 'denied',
      resolvedByActorId: 'policy'
    });
    await expect(broker.resolve({ ...request, toolName: 'Read' })).resolves.toMatchObject({
      decision: 'denied',
      resolvedByActorId: 'policy'
    });
  });
});
