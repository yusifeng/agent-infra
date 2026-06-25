import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_CLAUDE_AGENT_DOCKER_IMAGE } from '@agent-infra/cloud-agent-runtime';

import { runCloudAgentRunJob } from '../lib/agent-run-worker';
import { getCloudAgentRepositories } from '../lib/db';
import { createCloudAgentRun } from '../lib/run-store';
import { appendUserMessage } from '../lib/thread-store';
import { resolveCloudWorkspaceRuntimePaths } from '../lib/workspace-runtime';

const appRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = path.resolve(appRoot, '../..');
const packageRoot = path.join(repoRoot, 'packages/cloud-agent-runtime');
const smokeRoot = path.join(repoRoot, '.cloud-agent-data/cloud-agent-audit-smoke');
const image = process.env.CLOUD_AGENT_CLAUDE_DOCKER_IMAGE?.trim() || DEFAULT_CLAUDE_AGENT_DOCKER_IMAGE;
const ownerUserId = 'audit-smoke-admin';

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  process.chdir(appRoot);
  process.env.CLOUD_AGENT_DATA_DIR = smokeRoot;
  process.env.CLOUD_AGENT_CLAUDE_EXECUTION = 'docker';
  process.env.CLOUD_AGENT_WEB_CLAUDE_TIMEOUT_MS =
    process.env.CLOUD_AGENT_AUDIT_SMOKE_TIMEOUT_MS?.trim() || '90000';

  await ensureDockerAvailable();
  await ensureImage(image);
  await rm(smokeRoot, { force: true, recursive: true });
  await mkdir(smokeRoot, { recursive: true });

  const userTurn = await appendUserMessage({
    ownerUserId,
    provider: 'claude',
    content: [
      'This is a strict audit smoke test. Use exactly these built-in tools, in this order:',
      '1. Use Bash to run: pwd > audit-pwd.txt',
      '2. Use Read to read /workspace/read-edit-target.txt',
      '3. Use Edit to replace before-edit with after-edit in /workspace/read-edit-target.txt',
      '4. Use Write to create /workspace/write-target.txt with exactly this content: write-tool-ok',
      'Do not use /root paths. Do not use Bash to create or edit read-edit-target.txt or write-target.txt.',
      'After the tools finish, reply with exactly: docker-claude-audit-smoke-ok'
    ].join('\n')
  });
  const runtimePaths = resolveCloudWorkspaceRuntimePaths({
    userId: ownerUserId,
    workspaceId: userTurn.thread.workspaceId,
    provider: 'claude'
  });
  await mkdir(runtimePaths.hostWorkspacePath, { recursive: true });
  await writeFile(path.join(runtimePaths.hostWorkspacePath, 'read-edit-target.txt'), 'before-edit\n');

  const run = await createCloudAgentRun({
    threadId: userTurn.thread.id,
    triggerMessageId: userTurn.message.id,
    provider: 'claude'
  });
  const result = await runCloudAgentRunJob(run.id, {
    workerId: 'audit-smoke-worker',
    leaseMs: 120_000,
    maxAttempts: 1
  });
  if (result.failed) {
    throw new Error(result.error ?? 'Cloud agent audit smoke failed.');
  }

  const repositories = await getCloudAgentRepositories();
  const [completedRun, events, toolInvocations, fileChanges, fileIndex, transcriptEntries] = await Promise.all([
    repositories.runRepo.findById(run.id),
    repositories.runEventRepo.listByRun(run.id),
    repositories.toolRepo.listByRun(run.id),
    repositories.workspaceFileChangeRepo.listByRun(run.id),
    repositories.workspaceFileIndexRepo.listByWorkspace(userTurn.thread.workspaceId),
    repositories.providerTranscriptRepo.listByRun(run.id)
  ]);

  if (completedRun?.status !== 'completed') {
    throw new Error(`Expected completed run, got ${completedRun?.status ?? 'missing'}.`);
  }
  if (!result.thread.providerSessionId) {
    throw new Error('Audit smoke did not persist the thread provider session binding.');
  }

  const eventTypes = events.map((event) => event.type);
  for (const type of [
    'run_started',
    'provider_session_bound',
    'tool_call_started',
    'tool_call_completed',
    'file_change_detected',
    'agent_message_delta',
    'run_completed'
  ]) {
    assertIncludes(eventTypes, type, 'run events');
  }
  if (eventTypes.includes('tool_call_failed')) {
    throw new Error(`Audit smoke emitted tool_call_failed: ${eventTypes.join(', ')}`);
  }

  const toolNames = toolInvocations.map((tool) => tool.toolName).sort();
  for (const toolName of ['Bash', 'Edit', 'Read', 'Write']) {
    assertIncludes(toolNames, toolName, 'tool invocations');
  }
  const failedTools = toolInvocations.filter((tool) => tool.status === 'failed');
  if (failedTools.length > 0) {
    throw new Error(`Audit smoke persisted failed tool invocations: ${failedTools.map((tool) => tool.toolName).join(', ')}`);
  }

  for (const filePath of ['audit-pwd.txt', 'read-edit-target.txt', 'write-target.txt']) {
    assertIncludes(fileIndex.map((entry) => entry.path), filePath, 'workspace file index');
  }
  for (const filePath of ['read-edit-target.txt', 'write-target.txt']) {
    assertIncludes(fileChanges.map((change) => change.path), filePath, 'workspace file changes');
  }
  if (transcriptEntries.length === 0) {
    throw new Error('Audit smoke did not persist provider transcript entries.');
  }

  const serializedEvents = JSON.stringify(events.map((event) => event.payload));
  if (serializedEvents.includes(repoRoot) || serializedEvents.includes(smokeRoot)) {
    throw new Error('Audit smoke leaked host paths into persisted run event payloads.');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: 'docker',
        image,
        runId: run.id,
        threadId: userTurn.thread.id,
        workspaceId: userTurn.thread.workspaceId,
        providerSessionId: result.thread.providerSessionId,
        runEventCount: events.length,
        transcriptEntryCount: transcriptEntries.length,
        toolNames,
        fileChangePaths: [...new Set(fileChanges.map((change) => change.path))].sort(),
        fileIndexPaths: fileIndex.map((entry) => entry.path).sort()
      },
      null,
      2
    )
  );
}

async function ensureDockerAvailable(): Promise<void> {
  await runCommand('docker', ['info', '--format', '{{.ServerVersion}}'], {
    errorMessage: 'Docker CLI is not available or Docker is not running.'
  });
}

async function ensureImage(imageName: string): Promise<void> {
  const inspected = await runCommand('docker', ['image', 'inspect', imageName], {
    allowFailure: true
  });
  if (inspected.exitCode === 0) {
    return;
  }

  await runCommand('docker', [
    'build',
    '-t',
    imageName,
    '-f',
    path.join(packageRoot, 'docker/Dockerfile.claude-agent'),
    path.join(packageRoot, 'docker')
  ]);
}

function assertIncludes(values: string[], expected: string, label: string): void {
  if (!values.includes(expected)) {
    throw new Error(`Expected ${label} to include ${expected}; saw: ${values.join(', ')}`);
  }
}

function runCommand(
  command: string,
  args: string[],
  options: { allowFailure?: boolean; errorMessage?: string } = {}
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    child.on('error', (error) => {
      if (options.allowFailure) {
        resolve({ exitCode: 1, stdout: '', stderr: error.message });
        return;
      }
      reject(error);
    });
    child.on('close', (exitCode) => {
      const result = {
        exitCode: exitCode ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8')
      };
      if (result.exitCode !== 0 && !options.allowFailure) {
        reject(
          new Error(
            options.errorMessage ??
              `${command} ${args.join(' ')} failed with exit code ${result.exitCode}: ${result.stderr.trim()}`
          )
        );
        return;
      }
      resolve(result);
    });
  });
}
