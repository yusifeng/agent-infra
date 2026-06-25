import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { copyDirectory, ensureDirectoryExists, hashDirectory, resolveInside } from './filesystem.js';
import type {
  RuntimeScope,
  StorageProvider,
  WorkspaceChange,
  WorkspaceMaterialization,
  WorkspaceSnapshotRef
} from './types.js';

export interface LocalWorkspaceStorageProviderOptions {
  rootDir: string;
  name?: string;
}

export class LocalWorkspaceStorageProvider implements StorageProvider {
  readonly name: string;
  private readonly rootDir: string;

  constructor(options: LocalWorkspaceStorageProviderOptions) {
    this.name = options.name ?? 'local';
    this.rootDir = path.resolve(options.rootDir);
  }

  async materialize(input: { scope: RuntimeScope; snapshot: WorkspaceSnapshotRef }): Promise<WorkspaceMaterialization> {
    this.assertOwnsSnapshot(input.snapshot);

    const sourceDir = resolveInside(this.rootDir, input.snapshot.storageKey);
    await ensureDirectoryExists(sourceDir);

    const materializedKey = path.join('.materialized', input.scope.workspaceId, randomUUID());
    const workspacePath = resolveInside(this.rootDir, materializedKey);
    await copyDirectory(sourceDir, workspacePath);

    return {
      snapshot: input.snapshot,
      workspacePath,
      cleanup: async () => {
        await rm(workspacePath, { force: true, recursive: true });
      }
    };
  }

  async persistChanges(input: {
    scope: RuntimeScope;
    materialization: WorkspaceMaterialization;
    changes: WorkspaceChange[];
  }): Promise<WorkspaceSnapshotRef> {
    await ensureDirectoryExists(input.materialization.workspacePath);

    const snapshotId = `local-${Date.now()}-${randomUUID()}`;
    const storageKey = path.join('snapshots', input.scope.workspaceId, snapshotId);
    const targetDir = resolveInside(this.rootDir, storageKey);
    await mkdir(path.dirname(targetDir), { recursive: true });
    await copyDirectory(input.materialization.workspacePath, targetDir);

    return {
      id: snapshotId,
      storageProvider: this.name,
      storageKey,
      version: snapshotId,
      contentHash: await hashDirectory(targetDir)
    };
  }

  private assertOwnsSnapshot(snapshot: WorkspaceSnapshotRef): void {
    if (snapshot.storageProvider !== this.name) {
      throw new Error(`Snapshot belongs to ${snapshot.storageProvider}, not ${this.name}`);
    }
  }
}
