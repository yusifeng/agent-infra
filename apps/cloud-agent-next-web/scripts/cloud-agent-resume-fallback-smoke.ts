import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_CLAUDE_AGENT_DOCKER_IMAGE } from '@agent-infra/cloud-agent-runtime';

const appRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = path.resolve(appRoot, '../..');
const packageRoot = path.join(repoRoot, 'packages/cloud-agent-runtime');
const smokeRoot = path.join(repoRoot, '.cloud-agent-data/cloud-agent-resume-fallback-smoke');
const image = process.env.CLOUD_AGENT_CLAUDE_DOCKER_IMAGE?.trim() || DEFAULT_CLAUDE_AGENT_DOCKER_IMAGE;
const ownerUserId = 'resume-fallback-smoke-admin';
const invalidProviderSessionId = '00000000-0000-4000-8000-000000000000';

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
    process.env.CLOUD_AGENT_RESUME_SMOKE_TIMEOUT_MS?.trim() || '90000';

  await ensureDockerAvailable();
  await ensureImage(image);
  await rm(smokeRoot, { force: true, recursive: true });
  await mkdir(smokeRoot, { recursive: true });

  const [
    { runCloudAgentRunJob },
    { getCloudAgentRepositories },
    { createCloudAgentRun },
    { appendUserMessage, bindThreadProviderSession }
  ] = await Promise.all([
    import('../lib/agent-run-worker'),
    import('../lib/db'),
    import('../lib/run-store'),
    import('../lib/thread-store')
  ]);

  const userTurn = await appendUserMessage({
    ownerUserId,
    provider: 'claude',
    content: 'This is a resume fallback smoke. Reply with exactly: resume-fallback-smoke-ok'
  });
  await bindThreadProviderSession({
    ownerUserId,
    threadId: userTurn.thread.id,
    providerSessionId: invalidProviderSessionId
  });

  const run = await createCloudAgentRun({
    threadId: userTurn.thread.id,
    triggerMessageId: userTurn.message.id,
    provider: 'claude'
  });
  const result = await runCloudAgentRunJob(run.id, {
    workerId: 'resume-fallback-smoke-worker',
    leaseMs: 120_000,
    maxAttempts: 1
  });
  if (result.failed) {
    throw new Error(result.error ?? 'Cloud agent resume fallback smoke failed.');
  }
  if (!result.message.content.includes('resume-fallback-smoke-ok')) {
    throw new Error(`Resume fallback smoke returned unexpected assistant content: ${result.message.content}`);
  }
  if (!result.thread.providerSessionId || result.thread.providerSessionId === invalidProviderSessionId) {
    throw new Error('Resume fallback smoke did not create a fresh provider session binding.');
  }

  const repositories = await getCloudAgentRepositories();
  const [bindings, events] = await Promise.all([
    repositories.providerSessionBindingRepo.listByThread(userTurn.thread.id),
    repositories.runEventRepo.listByRun(run.id)
  ]);
  const archivedInvalid = bindings.find(
    (binding) => binding.providerSessionId === invalidProviderSessionId && binding.status === 'archived'
  );
  if (!archivedInvalid) {
    throw new Error('Resume fallback smoke did not archive the invalid provider session binding.');
  }
  const recoveryEvent = events.find((event) => event.type === 'provider_session_recovery');
  if (!recoveryEvent) {
    throw new Error('Resume fallback smoke did not persist a provider_session_recovery event.');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: 'docker',
        image,
        threadId: userTurn.thread.id,
        runId: run.id,
        invalidProviderSessionId,
        newProviderSessionId: result.thread.providerSessionId,
        bindingStatuses: bindings.map((binding) => ({
          providerSessionId: binding.providerSessionId,
          status: binding.status
        })),
        eventTypes: events.map((event) => event.type)
      },
      null,
      2
    )
  );
  process.exit(0);
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
        resolve({ exitCode: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) });
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
      if (result.exitCode === 0 || options.allowFailure) {
        resolve(result);
        return;
      }
      reject(
        new Error(
          options.errorMessage ??
            `${command} ${args.join(' ')} failed with exit code ${result.exitCode}: ${result.stderr.trim()}`
        )
      );
    });
  });
}
