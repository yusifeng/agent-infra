import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { DockerSandboxProvider, type DockerCommandInput } from '../src/docker-sandbox-provider';
import type { RuntimeScope, SandboxPolicy, WorkspaceMaterialization, WorkspaceSnapshotRef } from '../src/types';

const scope: RuntimeScope = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  workspaceId: 'workspace-1',
  threadId: 'thread-1',
  runId: 'run-1'
};

const snapshot: WorkspaceSnapshotRef = {
  id: 'snapshot-1',
  storageProvider: 'local',
  storageKey: 'snapshots/workspace-1/snapshot-1'
};

const policy: SandboxPolicy = {
  filesystem: {
    workspaceMode: 'read-write'
  },
  network: {
    mode: 'none'
  },
  envAllowlist: ['ALLOWED_ENV']
};

async function createWorkspace(): Promise<{ rootDir: string; materialization: WorkspaceMaterialization }> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'agent-infra-docker-sandbox-'));
  await writeFile(path.join(rootDir, 'README.md'), 'base\n');

  return {
    rootDir,
    materialization: {
      snapshot,
      workspacePath: rootDir
    }
  };
}

describe('DockerSandboxProvider', () => {
  it('creates a container with workspace mount, network policy, and limits', async () => {
    const { rootDir, materialization } = await createWorkspace();
    const calls: DockerCommandInput[] = [];
    try {
      const provider = new DockerSandboxProvider({
        docker: async (input) => {
          calls.push(input);
          return { exitCode: 0, stdout: 'container-1\n', stderr: '' };
        },
        containerPrefix: 'test-agent'
      });

      const session = await provider.create({
        scope,
        workspace: materialization,
        image: 'node:22-bookworm',
        policy,
        limits: {
          cpuCount: 1,
          memoryBytes: 268_435_456
        }
      });

      expect(session.provider).toBe('docker');
      expect(calls[0]?.args).toContain('--mount');
      expect(calls[0]?.args.join(' ')).toContain(`source=${rootDir}`);
      expect(calls[0]?.args).toContain('--network');
      expect(calls[0]?.args).toContain('none');
      expect(calls[0]?.args).toContain('--cpus');
      expect(calls[0]?.args).toContain('--memory');
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('enforces exec environment allowlist', async () => {
    const { rootDir, materialization } = await createWorkspace();
    try {
      const provider = new DockerSandboxProvider({
        docker: async () => ({ exitCode: 0, stdout: 'container-1\n', stderr: '' })
      });
      const session = await provider.create({
        scope,
        workspace: materialization,
        image: 'node:22-bookworm',
        policy
      });

      await expect(
        provider.exec({
          sessionId: session.id,
          command: ['env'],
          env: {
            DENIED_ENV: 'nope'
          }
        })
      ).rejects.toThrow('DENIED_ENV');
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('rejects file paths that escape the workspace', async () => {
    const { rootDir, materialization } = await createWorkspace();
    try {
      const provider = new DockerSandboxProvider({
        docker: async () => ({ exitCode: 0, stdout: 'container-1\n', stderr: '' })
      });
      const session = await provider.create({
        scope,
        workspace: materialization,
        image: 'node:22-bookworm',
        policy
      });

      await expect(provider.readFile({ sessionId: session.id, path: '../secret.txt' })).rejects.toThrow(
        'Path escapes workspace'
      );
      await expect(provider.readFile({ sessionId: session.id, path: '/etc/passwd' })).rejects.toThrow(
        'Path escapes workspace'
      );
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });

  it('collects host-side workspace changes for a sandbox session', async () => {
    const { rootDir, materialization } = await createWorkspace();
    try {
      const provider = new DockerSandboxProvider({
        docker: async () => ({ exitCode: 0, stdout: 'container-1\n', stderr: '' })
      });
      const session = await provider.create({
        scope,
        workspace: materialization,
        image: 'node:22-bookworm',
        policy
      });

      await writeFile(path.join(rootDir, 'README.md'), 'changed\n');
      await writeFile(path.join(rootDir, 'created.txt'), 'created\n');

      const changeSet = await provider.collectChanges({
        sessionId: session.id,
        baseSnapshot: snapshot
      });

      expect(changeSet.changes.map((change) => [change.path, change.type]).sort()).toEqual([
        ['README.md', 'modified'],
        ['created.txt', 'created']
      ]);
    } finally {
      await rm(rootDir, { force: true, recursive: true });
    }
  });
});
