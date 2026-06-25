import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LocalWorkspaceStorageProvider } from '../src/local-workspace-storage-provider';
import type { RuntimeScope, WorkspaceSnapshotRef } from '../src/types';

const scope: RuntimeScope = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  workspaceId: 'workspace-1',
  threadId: 'thread-1',
  runId: 'run-1'
};

async function createTempRoot() {
  return await mkdtemp(path.join(os.tmpdir(), 'agent-infra-local-storage-'));
}

describe('LocalWorkspaceStorageProvider', () => {
  it('materializes a snapshot into an isolated workspace and persists a new snapshot', async () => {
    const rootDir = await createTempRoot();
    try {
      const snapshotDir = path.join(rootDir, 'snapshots', 'workspace-1', 'base');
      await mkdir(snapshotDir, { recursive: true });
      await writeFile(path.join(snapshotDir, 'README.md'), 'base\n');

      const provider = new LocalWorkspaceStorageProvider({ rootDir });
      const baseSnapshot: WorkspaceSnapshotRef = {
        id: 'base',
        storageProvider: 'local',
        storageKey: 'snapshots/workspace-1/base'
      };

      const materialization = await provider.materialize({ scope, snapshot: baseSnapshot });
      await writeFile(path.join(materialization.workspacePath, 'README.md'), 'changed\n');
      await writeFile(path.join(materialization.workspacePath, 'new.txt'), 'new\n');

      const nextSnapshot = await provider.persistChanges({
        scope,
        materialization,
        changes: []
      });
      const rematerialized = await provider.materialize({ scope, snapshot: nextSnapshot });

      await expect(readFile(path.join(rematerialized.workspacePath, 'README.md'), 'utf8')).resolves.toBe('changed\n');
      await expect(readFile(path.join(rematerialized.workspacePath, 'new.txt'), 'utf8')).resolves.toBe('new\n');
      expect(nextSnapshot.storageProvider).toBe('local');
      expect(nextSnapshot.contentHash).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('rejects snapshots outside the provider namespace', async () => {
    const rootDir = await createTempRoot();
    try {
      const provider = new LocalWorkspaceStorageProvider({ rootDir });

      await expect(
        provider.materialize({
          scope,
          snapshot: {
            id: 'foreign',
            storageProvider: 's3',
            storageKey: 'snapshots/workspace-1/base'
          }
        })
      ).rejects.toThrow('Snapshot belongs to s3');
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });
});
