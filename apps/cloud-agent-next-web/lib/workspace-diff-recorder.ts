import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';

import {
  diffFileHashes,
  resolveInside,
  scanFileHashes,
  type WorkspaceChange
} from '@agent-infra/cloud-agent-runtime';
import type { WorkspaceChangeSet } from '@agent-infra/core';

import { getCloudAgentRepositories } from './db';
import type { AgentProviderId } from './provider-config';
import type { CloudThread } from './thread-store';
import { resolveCloudWorkspaceRuntimePaths } from './workspace-runtime';

const MAX_WORKSPACE_DIFF_TEXT_BYTES = 64 * 1024;

export interface WorkspaceDiffBaseline {
  hashes: Map<string, string>;
  textSnapshots: Map<string, TextSnapshot>;
  workspacePath: string;
}

interface TextSnapshot {
  text: string;
  truncated: boolean;
}

export async function captureWorkspaceDiffBaseline(input: {
  provider: AgentProviderId;
  thread: CloudThread;
  userId: string;
}): Promise<WorkspaceDiffBaseline> {
  const runtimePaths = resolveCloudWorkspaceRuntimePaths({
    userId: input.userId,
    workspaceId: input.thread.workspaceId,
    provider: input.provider
  });
  await mkdir(runtimePaths.hostWorkspacePath, { recursive: true });

  const hashes = await scanFileHashes(runtimePaths.hostWorkspacePath);

  return {
    hashes,
    textSnapshots: await readTextSnapshots(runtimePaths.hostWorkspacePath, hashes.keys()),
    workspacePath: runtimePaths.hostWorkspacePath
  };
}

export async function persistWorkspaceDiff(input: {
  baseline: WorkspaceDiffBaseline | null;
  provider: AgentProviderId;
  runId: string;
  thread: CloudThread;
}): Promise<void> {
  if (!input.baseline) {
    return;
  }

  const baseline = input.baseline;
  const currentHashes = await scanFileHashes(baseline.workspacePath);
  const changes = diffFileHashes(baseline.hashes, currentHashes);
  if (changes.length === 0) {
    return;
  }

  const repositories = await getCloudAgentRepositories();
  const existingChanges = await repositories.workspaceFileChangeRepo.listByRun(input.runId);
  const missingChanges = changes.filter((change) => {
    return !existingChanges.some((existing) => existing.path === change.path && existing.changeType === change.type);
  });
  if (missingChanges.length === 0) {
    await updateWorkspaceFileIndexFromDiff({
      changes,
      provider: input.provider,
      runId: input.runId,
      thread: input.thread
    });
    return;
  }

  const changeSet = await getOrCreateWorkspaceDiffChangeSet({
    baselineHashes: baseline.hashes,
    changes,
    currentHashes,
    provider: input.provider,
    runId: input.runId,
    thread: input.thread
  });
  await repositories.workspaceFileChangeRepo.createMany(
    await Promise.all(missingChanges.map(async (change) => ({
      changeSetId: changeSet.id,
      workspaceId: input.thread.workspaceId,
      threadId: input.thread.id,
      runId: input.runId,
      path: change.path,
      changeType: change.type,
      beforeContentHash: change.type === 'created' ? null : baseline.hashes.get(change.path) ?? null,
      afterContentHash: change.type === 'deleted' ? null : change.contentHash ?? null,
      artifactId: null,
      metadata: {
        source: 'workspace_diff',
        provider: input.provider,
        diff: await buildPersistedDiff({
          baseline,
          change,
          workspacePath: baseline.workspacePath
        })
      }
    })))
  );

  await updateWorkspaceFileIndexFromDiff({
    changes,
    provider: input.provider,
    runId: input.runId,
    thread: input.thread
  });
}

async function getOrCreateWorkspaceDiffChangeSet(input: {
  baselineHashes: Map<string, string>;
  changes: WorkspaceChange[];
  currentHashes: Map<string, string>;
  provider: AgentProviderId;
  runId: string;
  thread: CloudThread;
}): Promise<WorkspaceChangeSet> {
  const repositories = await getCloudAgentRepositories();
  const existing = (await repositories.workspaceChangeSetRepo.listByRun(input.runId)).find((changeSet) => {
    const metadata = changeSet.metadata;
    return isRecord(metadata) && metadata.source === 'workspace_diff';
  });
  if (existing) {
    return existing;
  }

  const baseManifest = buildWorkspaceManifestRef(input.baselineHashes);
  const nextManifest = buildWorkspaceManifestRef(input.currentHashes);
  return repositories.workspaceChangeSetRepo.create({
    workspaceId: input.thread.workspaceId,
    threadId: input.thread.id,
    runId: input.runId,
    status: 'pending',
    baseSnapshotId: baseManifest.snapshotId,
    nextSnapshotId: nextManifest.snapshotId,
    metadata: {
      source: 'workspace_diff',
      provider: input.provider,
      baseManifest,
      changeCounts: countWorkspaceChanges(input.changes),
      nextManifest
    },
    resolvedAt: null
  });
}

async function updateWorkspaceFileIndexFromDiff(input: {
  changes: WorkspaceChange[];
  provider: AgentProviderId;
  runId: string;
  thread: CloudThread;
}): Promise<void> {
  const repositories = await getCloudAgentRepositories();
  const now = new Date();

  for (const change of input.changes) {
    const metadata = {
      source: 'workspace_diff',
      provider: input.provider,
      lastRunId: input.runId,
      lastThreadId: input.thread.id
    };

    if (change.type === 'deleted') {
      try {
        await repositories.workspaceFileIndexRepo.markDeleted({
          workspaceId: input.thread.workspaceId,
          path: change.path,
          deletedAt: now
        });
      } catch {
        await repositories.workspaceFileIndexRepo.upsert({
          workspaceId: input.thread.workspaceId,
          path: change.path,
          kind: 'file',
          sizeBytes: null,
          mimeType: null,
          contentHash: null,
          previewCapability: null,
          metadata,
          deletedAt: now
        });
      }
      continue;
    }

    await repositories.workspaceFileIndexRepo.upsert({
      workspaceId: input.thread.workspaceId,
      path: change.path,
      kind: 'file',
      sizeBytes: null,
      mimeType: null,
      contentHash: change.contentHash ?? null,
      previewCapability: null,
      metadata,
      deletedAt: null
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildWorkspaceManifestRef(hashes: Map<string, string>): {
  fileCount: number;
  hash: string;
  snapshotId: string;
} {
  const hash = createHash('sha256');
  for (const [filePath, contentHash] of Array.from(hashes.entries()).sort(([left], [right]) => left.localeCompare(right))) {
    hash.update(filePath);
    hash.update('\0');
    hash.update(contentHash);
    hash.update('\n');
  }
  const digest = hash.digest('hex');
  return {
    fileCount: hashes.size,
    hash: digest,
    snapshotId: `workspace-manifest-sha256:${digest}`
  };
}

function countWorkspaceChanges(changes: WorkspaceChange[]): Record<WorkspaceChange['type'], number> {
  return changes.reduce(
    (counts, change) => {
      counts[change.type] += 1;
      return counts;
    },
    { created: 0, deleted: 0, modified: 0 }
  );
}

async function readTextSnapshots(rootDir: string, paths: Iterable<string>): Promise<Map<string, TextSnapshot>> {
  const snapshots = new Map<string, TextSnapshot>();
  for (const filePath of paths) {
    const snapshot = await readSmallUtf8File(resolveInside(rootDir, filePath));
    if (snapshot) {
      snapshots.set(filePath, snapshot);
    }
  }

  return snapshots;
}

async function readSmallUtf8File(filePath: string): Promise<TextSnapshot | null> {
  try {
    const content = await readFile(filePath);
    const truncated = content.byteLength > MAX_WORKSPACE_DIFF_TEXT_BYTES;
    const slice = truncated ? content.subarray(0, MAX_WORKSPACE_DIFF_TEXT_BYTES) : content;
    return {
      text: slice.toString('utf8'),
      truncated
    };
  } catch {
    return null;
  }
}

async function buildPersistedDiff(input: {
  baseline: WorkspaceDiffBaseline;
  change: WorkspaceChange;
  workspacePath: string;
}): Promise<Record<string, unknown>> {
  const before = input.baseline.textSnapshots.get(input.change.path);
  if (input.change.type === 'created') {
    const after = await readSmallUtf8File(resolveInside(input.workspacePath, input.change.path));
    return {
      status: 'unavailable',
      reason: 'created_file_diff_resolved_from_workspace',
      snapshot: buildTextSnapshotPayload(null, after)
    };
  }

  if (!before) {
    return {
      status: 'unavailable',
      reason: 'before_file_content_not_available'
    };
  }

  if (input.change.type === 'deleted') {
    return {
      status: 'available',
      format: 'unified',
      beforePath: input.change.path,
      afterPath: '/dev/null',
      unifiedDiff: buildDeletedFileUnifiedDiff(input.change.path, before.text),
      snapshot: buildTextSnapshotPayload(before, null),
      truncated: before.truncated
    };
  }

  const after = await readSmallUtf8File(resolveInside(input.workspacePath, input.change.path));
  if (!after) {
    return {
      status: 'unavailable',
      reason: 'after_file_content_not_available'
    };
  }

  return {
    status: 'available',
    format: 'unified',
    beforePath: input.change.path,
    afterPath: input.change.path,
    snapshot: buildTextSnapshotPayload(before, after),
    unifiedDiff: buildModifiedFileUnifiedDiff(input.change.path, before.text, after.text),
    truncated: before.truncated || after.truncated
  };
}

function buildTextSnapshotPayload(before: TextSnapshot | null, after: TextSnapshot | null): Record<string, unknown> {
  return {
    schemaVersion: 1,
    kind: 'small_text',
    beforeText: before?.truncated ? null : before?.text ?? null,
    afterText: after?.truncated ? null : after?.text ?? null,
    beforeTruncated: before?.truncated ?? false,
    afterTruncated: after?.truncated ?? false
  };
}

function buildModifiedFileUnifiedDiff(filePath: string, before: string, after: string): string {
  const beforeLines = splitDiffLines(before);
  const afterLines = splitDiffLines(after);

  return [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -1,${beforeLines.length} +1,${afterLines.length} @@`,
    ...beforeLines.map((line) => `-${line}`),
    ...afterLines.map((line) => `+${line}`)
  ].join('\n');
}

function buildDeletedFileUnifiedDiff(filePath: string, before: string): string {
  const beforeLines = splitDiffLines(before);

  return [
    `--- a/${filePath}`,
    `+++ /dev/null`,
    `@@ -1,${beforeLines.length} +0,0 @@`,
    ...beforeLines.map((line) => `-${line}`)
  ].join('\n');
}

function splitDiffLines(content: string): string[] {
  const lines = content.split('\n');
  if (lines.at(-1) === '') {
    lines.pop();
  }
  return lines;
}
