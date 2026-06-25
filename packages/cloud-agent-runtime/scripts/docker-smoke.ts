import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  DockerSandboxProvider,
  LocalWorkspaceStorageProvider,
  type RuntimeScope,
  type SandboxSession,
  type WorkspaceSnapshotRef
} from '../src/index.js';

const image = process.env.CLOUD_AGENT_RUNTIME_SMOKE_IMAGE?.trim() || 'alpine:3.20';

async function ensureDockerAvailable(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('docker', ['info', '--format', '{{.ServerVersion}}'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stderrChunks: Buffer[] = [];

    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    child.on('error', () => {
      reject(new Error('Docker CLI is not available. Install/start Docker before running smoke:docker.'));
    });
    child.on('close', (exitCode) => {
      if (exitCode === 0) {
        resolve();
        return;
      }

      reject(new Error(`Docker is not ready: ${Buffer.concat(stderrChunks).toString('utf8').trim()}`));
    });
  });
}

async function main(): Promise<void> {
  await ensureDockerAvailable();

  const rootDir = await mkdtemp(path.join(process.cwd(), '.tmp-docker-smoke-'));
  let session: SandboxSession | null = null;
  let sandbox: DockerSandboxProvider | null = null;

  try {
    const scope: RuntimeScope = {
      tenantId: 'smoke-tenant',
      userId: 'smoke-user',
      workspaceId: 'smoke-workspace',
      threadId: 'smoke-thread',
      runId: 'smoke-run'
    };
    const storage = new LocalWorkspaceStorageProvider({ rootDir });
    const baseSnapshotDir = path.join(rootDir, 'snapshots', scope.workspaceId, 'base');
    await mkdir(baseSnapshotDir, { recursive: true });
    await writeFile(path.join(baseSnapshotDir, 'README.md'), 'base workspace\n');

    const baseSnapshot: WorkspaceSnapshotRef = {
      id: 'base',
      storageProvider: storage.name,
      storageKey: `snapshots/${scope.workspaceId}/base`
    };
    const materialization = await storage.materialize({
      scope,
      snapshot: baseSnapshot
    });
    sandbox = new DockerSandboxProvider({
      containerPrefix: 'agent-infra-smoke'
    });

    session = await sandbox.create({
      scope,
      workspace: materialization,
      image,
      policy: {
        filesystem: {
          workspaceMode: 'read-write'
        },
        network: {
          mode: 'none'
        }
      },
      limits: {
        cpuCount: 1,
        memoryBytes: 512 * 1024 * 1024,
        timeoutMs: 30_000
      }
    });

    const execResult = await sandbox.exec({
      sessionId: session.id,
      command: ['sh', '-lc', 'printf "from docker smoke\\n" > smoke.txt && printf "ok\\n" > command-status.txt'],
      limits: {
        timeoutMs: 30_000
      }
    });

    if (execResult.exitCode !== 0) {
      throw new Error(`Sandbox command failed: ${execResult.stderr.trim()}`);
    }

    const changeSet = await sandbox.collectChanges({
      sessionId: session.id,
      baseSnapshot
    });
    const nextSnapshot = await storage.persistChanges({
      scope,
      materialization,
      changes: changeSet.changes
    });
    const nextMaterialization = await storage.materialize({
      scope,
      snapshot: nextSnapshot
    });
    const smokeText = await readFile(path.join(nextMaterialization.workspacePath, 'smoke.txt'), 'utf8');

    if (smokeText !== 'from docker smoke\n') {
      throw new Error(`Unexpected smoke artifact content: ${JSON.stringify(smokeText)}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          image,
          changeCount: changeSet.changes.length,
          changedPaths: changeSet.changes.map((change) => change.path),
          nextSnapshotId: nextSnapshot.id
        },
        null,
        2
      )
    );

    await nextMaterialization.cleanup?.();
    await materialization.cleanup?.();
  } finally {
    if (sandbox && session) {
      await sandbox.destroy({ sessionId: session.id }).catch(() => undefined);
    }
    await rm(rootDir, { force: true, recursive: true });
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
