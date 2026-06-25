import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { WorkspaceChangeSet, WorkspaceFileChange } from '@agent-infra/core';
import type { WorkspaceChangeSetDto, WorkspaceFileChangeDto } from '@agent-infra/contracts';
import { hashFile, resolveInside } from '@agent-infra/cloud-agent-runtime';

import { getCloudAgentRepositories } from './db';
import { resolveCloudWorkspaceRuntimePaths } from './workspace-runtime';

const CLOUD_AGENT_APP_ID = 'cloud-agent-next-web';

export interface WorkspaceChangeSetWithFilesDto extends WorkspaceChangeSetDto {
  fileChanges: WorkspaceFileChangeDto[];
}

export async function listWorkspaceChangeSetsForOwner(input: {
  includeResolved?: boolean;
  ownerUserId: string;
}): Promise<WorkspaceChangeSetWithFilesDto[]> {
  const repositories = await getCloudAgentRepositories();
  const workspaces = await repositories.workspaceRepo.listByUser({
    appId: CLOUD_AGENT_APP_ID,
    userId: input.ownerUserId
  });
  const snapshots = await Promise.all(
    workspaces.map(async (workspace) => {
      const changeSets = await repositories.workspaceChangeSetRepo.listByWorkspace(workspace.id, {
        includeResolved: input.includeResolved
      });
      return Promise.all(
        changeSets.map(async (changeSet) => ({
          ...toWorkspaceChangeSetDto(changeSet),
          fileChanges: (await repositories.workspaceFileChangeRepo.listByChangeSet(changeSet.id)).map(toWorkspaceFileChangeDto)
        }))
      );
    })
  );

  return snapshots.flat().sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function resolveWorkspaceChangeSetForOwner(input: {
  action: 'discard' | 'merge' | 'rollback';
  actorId: string;
  changeSetId: string;
  ownerUserId: string;
  reason?: string | null;
}): Promise<WorkspaceChangeSetWithFilesDto | null> {
  const repositories = await getCloudAgentRepositories();
  const changeSet = await repositories.workspaceChangeSetRepo.findById(input.changeSetId);
  if (!changeSet) {
    return null;
  }

  const workspace = await repositories.workspaceRepo.findById(changeSet.workspaceId);
  if (!workspace || workspace.appId !== CLOUD_AGENT_APP_ID || workspace.userId !== input.ownerUserId || workspace.status !== 'active') {
    return null;
  }

  const fileChanges = await repositories.workspaceFileChangeRepo.listByChangeSet(changeSet.id);
  let rollbackResult: WorkspaceRollbackResult | null = null;
  if (input.action === 'rollback') {
    rollbackResult = await rollbackWorkspaceFileChanges({
      changes: fileChanges,
      ownerUserId: input.ownerUserId,
      workspaceId: changeSet.workspaceId
    });
  }

  const status = input.action === 'merge' ? 'merged' : 'discarded';
  const resolved = await repositories.workspaceChangeSetRepo.updateStatus(changeSet.id, status, {
    metadata: {
      ...(changeSet.metadata ?? {}),
      resolvedAction: input.action,
      resolvedByActorId: input.actorId,
      resolvedReason: input.reason ?? null,
      rollback: rollbackResult
    },
    resolvedAt: new Date()
  });

  return {
    ...toWorkspaceChangeSetDto(resolved),
    fileChanges: (await repositories.workspaceFileChangeRepo.listByChangeSet(resolved.id)).map(toWorkspaceFileChangeDto)
  };
}

interface WorkspaceRollbackResult {
  restoredFiles: string[];
}

async function rollbackWorkspaceFileChanges(input: {
  changes: WorkspaceFileChange[];
  ownerUserId: string;
  workspaceId: string;
}): Promise<WorkspaceRollbackResult> {
  const repositories = await getCloudAgentRepositories();
  const runtimePaths = resolveCloudWorkspaceRuntimePaths({
    userId: input.ownerUserId,
    workspaceId: input.workspaceId
  });
  const restoredFiles: string[] = [];
  const restoredAt = new Date();

  for (const change of input.changes) {
    const snapshot = readRollbackSnapshot(change);
    if (!snapshot) {
      throw new Error(`workspace change ${change.id} for ${change.path} cannot be rolled back from stored snapshots`);
    }

    const filePath = resolveInside(runtimePaths.hostWorkspacePath, change.path);
    if (change.changeType === 'created') {
      await rm(filePath, { force: true });
      try {
        await repositories.workspaceFileIndexRepo.markDeleted({
          workspaceId: input.workspaceId,
          path: change.path,
          deletedAt: restoredAt
        });
      } catch {
        await repositories.workspaceFileIndexRepo.upsert({
          workspaceId: input.workspaceId,
          path: change.path,
          kind: 'file',
          sizeBytes: null,
          mimeType: null,
          contentHash: null,
          previewCapability: null,
          metadata: {
            source: 'workspace_change_rollback',
            rolledBackChangeId: change.id,
            rolledBackChangeSetId: change.changeSetId
          },
          deletedAt: restoredAt
        });
      }
      restoredFiles.push(change.path);
      continue;
    }

    if (snapshot.beforeText == null) {
      throw new Error(`workspace change ${change.id} for ${change.path} is missing before snapshot`);
    }

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, snapshot.beforeText, 'utf8');
    await repositories.workspaceFileIndexRepo.upsert({
      workspaceId: input.workspaceId,
      path: change.path,
      kind: 'file',
      sizeBytes: Buffer.byteLength(snapshot.beforeText, 'utf8'),
      mimeType: 'text/plain',
      contentHash: await hashFile(filePath),
      previewCapability: 'text',
      metadata: {
        source: 'workspace_change_rollback',
        rolledBackChangeId: change.id,
        rolledBackChangeSetId: change.changeSetId
      },
      deletedAt: null
    });
    restoredFiles.push(change.path);
  }

  return { restoredFiles };
}

function readRollbackSnapshot(change: WorkspaceFileChange): { beforeText: string | null } | null {
  const metadata = change.metadata;
  if (!isRecord(metadata) || !isRecord(metadata.diff) || !isRecord(metadata.diff.snapshot)) {
    return null;
  }

  const snapshot = metadata.diff.snapshot;
  if (snapshot.kind !== 'small_text' || snapshot.beforeTruncated === true || snapshot.afterTruncated === true) {
    return null;
  }

  const beforeText = snapshot.beforeText == null ? null : typeof snapshot.beforeText === 'string' ? snapshot.beforeText : undefined;
  return beforeText === undefined ? null : { beforeText };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toWorkspaceChangeSetDto(changeSet: WorkspaceChangeSet): WorkspaceChangeSetDto {
  return {
    id: changeSet.id,
    workspaceId: changeSet.workspaceId,
    threadId: changeSet.threadId,
    runId: changeSet.runId,
    status: changeSet.status,
    baseSnapshotId: changeSet.baseSnapshotId,
    nextSnapshotId: changeSet.nextSnapshotId,
    metadata: changeSet.metadata,
    createdAt: changeSet.createdAt.toISOString(),
    updatedAt: changeSet.updatedAt.toISOString(),
    resolvedAt: changeSet.resolvedAt?.toISOString() ?? null
  };
}

function toWorkspaceFileChangeDto(change: WorkspaceFileChange): WorkspaceFileChangeDto {
  return {
    id: change.id,
    changeSetId: change.changeSetId,
    workspaceId: change.workspaceId,
    threadId: change.threadId,
    runId: change.runId,
    path: change.path,
    changeType: change.changeType,
    beforeContentHash: change.beforeContentHash,
    afterContentHash: change.afterContentHash,
    artifactId: change.artifactId,
    metadata: change.metadata,
    diff: null,
    createdAt: change.createdAt.toISOString()
  };
}
