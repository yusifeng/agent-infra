import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_CLAUDE_AGENT_DOCKER_IMAGE } from '@agent-infra/cloud-agent-runtime';

const appRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const repoRoot = path.resolve(appRoot, '../..');
const packageRoot = path.join(repoRoot, 'packages/cloud-agent-runtime');
const smokeRoot = path.join(repoRoot, '.cloud-agent-data/cloud-agent-resume-smoke');
const statePath = path.join(smokeRoot, 'resume-smoke-state.json');
const image = process.env.CLOUD_AGENT_CLAUDE_DOCKER_IMAGE?.trim() || DEFAULT_CLAUDE_AGENT_DOCKER_IMAGE;
const ownerUserId = 'resume-smoke-admin';
const codePhrase = 'SKY-LANTERN-42';

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const phase = process.argv[2]?.trim();
  if (phase === 'phase:first') {
    await runFirstPhase();
    return;
  }
  if (phase === 'phase:second') {
    await runSecondPhase();
    return;
  }

  await ensureDockerAvailable();
  await ensureImage(image);
  await rm(smokeRoot, { force: true, recursive: true });
  await mkdir(smokeRoot, { recursive: true });
  await runPhase('phase:first');
  await runPhase('phase:second');
}

async function runFirstPhase(): Promise<void> {
  process.chdir(appRoot);
  process.env.CLOUD_AGENT_DATA_DIR = smokeRoot;
  process.env.CLOUD_AGENT_CLAUDE_EXECUTION = 'docker';
  process.env.CLOUD_AGENT_WEB_CLAUDE_TIMEOUT_MS =
    process.env.CLOUD_AGENT_RESUME_SMOKE_TIMEOUT_MS?.trim() || '90000';

  const [
    { runCloudAgentRunJob },
    { createCloudAgentRun },
    { appendUserMessage },
    { resolveCloudWorkspaceRuntimePaths }
  ] = await Promise.all([
    import('../lib/agent-run-worker'),
    import('../lib/run-store'),
    import('../lib/thread-store'),
    import('../lib/workspace-runtime')
  ]);

  const userTurn = await appendUserMessage({
    ownerUserId,
    provider: 'claude',
    content: [
      'This is the first half of a strict resume smoke test.',
      `Remember this code phrase for the next turn: ${codePhrase}`,
      'Use Write to create /workspace/resume-proof.txt with exactly this content: first-run-ok',
      'After the tool finishes, reply with exactly: first-resume-smoke-ok'
    ].join('\n')
  });
  const runtimePaths = resolveCloudWorkspaceRuntimePaths({
    userId: ownerUserId,
    workspaceId: userTurn.thread.workspaceId,
    provider: 'claude'
  });
  await mkdir(runtimePaths.hostWorkspacePath, { recursive: true });

  const run = await createCloudAgentRun({
    threadId: userTurn.thread.id,
    triggerMessageId: userTurn.message.id,
    provider: 'claude'
  });
  const result = await runCloudAgentRunJob(run.id, {
    workerId: 'resume-smoke-worker-1',
    leaseMs: 120_000,
    maxAttempts: 1
  });
  if (result.failed) {
    throw new Error(result.error ?? 'Cloud agent resume smoke first phase failed.');
  }
  if (!result.thread.providerSessionId) {
    throw new Error('Resume smoke first phase did not persist a provider session binding.');
  }
  if (!result.message.content.includes('first-resume-smoke-ok')) {
    throw new Error(`Resume smoke first phase returned unexpected assistant content: ${result.message.content}`);
  }

  await writeFile(
    statePath,
    JSON.stringify(
      {
        firstRunId: run.id,
        providerSessionId: result.thread.providerSessionId,
        threadId: userTurn.thread.id,
        workspaceId: userTurn.thread.workspaceId
      },
      null,
      2
    )
  );
}

async function runSecondPhase(): Promise<void> {
  process.chdir(appRoot);
  process.env.CLOUD_AGENT_DATA_DIR = smokeRoot;
  process.env.CLOUD_AGENT_CLAUDE_EXECUTION = 'docker';
  process.env.CLOUD_AGENT_WEB_CLAUDE_TIMEOUT_MS =
    process.env.CLOUD_AGENT_RESUME_SMOKE_TIMEOUT_MS?.trim() || '90000';

  const state = await readState();
  const [
    { runCloudAgentRunJob },
    { getCloudAgentRepositories },
    { createCloudAgentRun },
    { appendUserMessage }
  ] = await Promise.all([
    import('../lib/agent-run-worker'),
    import('../lib/db'),
    import('../lib/run-store'),
    import('../lib/thread-store')
  ]);

  const userTurn = await appendUserMessage({
    ownerUserId,
    threadId: state.threadId,
    provider: 'claude',
    content: [
      'This is the second half of the resume smoke test.',
      'Use Bash to run: pwd > resume-pwd.txt',
      'Then answer with exactly: second-resume-smoke-ok <the code phrase from the previous turn>',
      'Do not read files to recover the code phrase; use the resumed conversation context.'
    ].join('\n')
  });
  const run = await createCloudAgentRun({
    threadId: userTurn.thread.id,
    triggerMessageId: userTurn.message.id,
    provider: 'claude'
  });
  const result = await runCloudAgentRunJob(run.id, {
    workerId: 'resume-smoke-worker-2',
    leaseMs: 120_000,
    maxAttempts: 1
  });
  if (result.failed) {
    throw new Error(result.error ?? 'Cloud agent resume smoke second phase failed.');
  }
  if (!result.message.content.includes('second-resume-smoke-ok') || !result.message.content.includes(codePhrase)) {
    throw new Error(`Resume smoke second phase did not preserve provider context: ${result.message.content}`);
  }

  const repositories = await getCloudAgentRepositories();
  const binding = await repositories.providerSessionBindingRepo.findActiveByThread({
    threadId: state.threadId,
    provider: 'claude'
  });
  if (binding?.providerSessionId !== state.providerSessionId) {
    throw new Error(
      `Expected active provider session ${state.providerSessionId}, got ${binding?.providerSessionId ?? 'missing'}.`
    );
  }

  const [firstTranscript, secondTranscript, secondRunEvents, secondTools, fileIndex] = await Promise.all([
    repositories.providerTranscriptRepo.listByRun(state.firstRunId),
    repositories.providerTranscriptRepo.listByRun(run.id),
    repositories.runEventRepo.listByRun(run.id),
    repositories.toolRepo.listByRun(run.id),
    repositories.workspaceFileIndexRepo.listByWorkspace(state.workspaceId)
  ]);
  if (firstTranscript.length === 0 || secondTranscript.length === 0) {
    throw new Error('Resume smoke did not persist transcript entries for both runs.');
  }
  for (const entry of [...firstTranscript, ...secondTranscript]) {
    if (entry.providerSessionId !== state.providerSessionId) {
      throw new Error(`Transcript entry used unexpected provider session id: ${entry.providerSessionId}`);
    }
  }
  if (!secondTools.some((tool) => tool.toolName === 'Bash' && tool.status === 'completed')) {
    throw new Error('Resume smoke second phase did not persist the Bash tool invocation.');
  }
  if (!fileIndex.some((entry) => entry.path === 'resume-pwd.txt')) {
    throw new Error('Resume smoke second phase did not index resume-pwd.txt.');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: 'docker',
        image,
        threadId: state.threadId,
        workspaceId: state.workspaceId,
        providerSessionId: state.providerSessionId,
        firstRunId: state.firstRunId,
        secondRunId: run.id,
        firstTranscriptEntries: firstTranscript.length,
        secondTranscriptEntries: secondTranscript.length,
        secondRunEventTypes: secondRunEvents.map((event) => event.type),
        secondToolNames: secondTools.map((tool) => tool.toolName).sort(),
        fileIndexPaths: fileIndex.map((entry) => entry.path).sort()
      },
      null,
      2
    )
  );
}

async function readState(): Promise<{
  firstRunId: string;
  providerSessionId: string;
  threadId: string;
  workspaceId: string;
}> {
  const parsed: unknown = JSON.parse(await readFile(statePath, 'utf8'));
  if (!isRecord(parsed)) {
    throw new Error('Resume smoke state is invalid.');
  }

  const firstRunId = readString(parsed, 'firstRunId');
  const providerSessionId = readString(parsed, 'providerSessionId');
  const threadId = readString(parsed, 'threadId');
  const workspaceId = readString(parsed, 'workspaceId');
  if (!firstRunId || !providerSessionId || !threadId || !workspaceId) {
    throw new Error('Resume smoke state is missing required fields.');
  }

  return {
    firstRunId,
    providerSessionId,
    threadId,
    workspaceId
  };
}

async function runPhase(phase: 'phase:first' | 'phase:second'): Promise<void> {
  const result = await runCommand('tsx', [path.join(appRoot, 'scripts/cloud-agent-resume-smoke.ts'), phase], {
    env: {
      ...process.env,
      CLOUD_AGENT_CLAUDE_EXECUTION: 'docker',
      CLOUD_AGENT_DATA_DIR: smokeRoot,
      CLOUD_AGENT_WEB_CLAUDE_TIMEOUT_MS:
        process.env.CLOUD_AGENT_RESUME_SMOKE_TIMEOUT_MS?.trim() || '90000'
    }
  });
  if (result.stdout.trim()) {
    process.stdout.write(result.stdout);
  }
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
  options: {
    allowFailure?: boolean;
    env?: NodeJS.ProcessEnv;
    errorMessage?: string;
  } = {}
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: appRoot,
      env: options.env,
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

function readString(value: Record<string, unknown>, key: string): string | null {
  const entry = value[key];
  return typeof entry === 'string' && entry.trim() ? entry : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
