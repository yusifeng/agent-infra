import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AdapterAgentRunner,
  DEFAULT_CLAUDE_AGENT_DOCKER_IMAGE,
  DockerClaudeAgentAdapter,
  InMemoryProviderTranscriptStore,
  resolveClaudeAgentConfig,
  type RuntimeScope,
  type SandboxSession
} from '../src/index.js';

const packageRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '../..');
const defaultEnvFile = path.join(repoRoot, 'apps/cloud-agent-next-web/.env.local');
const envFile = process.env.CLOUD_AGENT_ENV_FILE?.trim() || defaultEnvFile;
const smokeRoot = path.join(packageRoot, '.tmp/docker-claude-agent-smoke');
const workspacePath = path.join(smokeRoot, 'workspace');
const configDir = path.join(smokeRoot, 'claude-config');
const credentialsDir = path.join(smokeRoot, 'credentials');
const image = process.env.CLOUD_AGENT_CLAUDE_DOCKER_IMAGE?.trim() || DEFAULT_CLAUDE_AGENT_DOCKER_IMAGE;

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  await loadEnvFile(envFile);
  await ensureDockerAvailable();
  await ensureImage(image);
  await rm(smokeRoot, { force: true, recursive: true });
  await Promise.all([
    mkdir(workspacePath, { recursive: true }),
    mkdir(configDir, { recursive: true }),
    mkdir(credentialsDir, { recursive: true })
  ]);

  const config = resolveClaudeAgentConfig({
    clientApp: 'agent-infra/cloud-agent-runtime-docker-smoke',
    configDir,
    defaultTimeoutMs: readTimeoutMs(),
    enableBashTool: true,
    env: process.env,
    toolAllowlist: ['Bash']
  });

  if (!config.configured) {
    throw new Error('Docker Claude SDK smoke requires ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN.');
  }

  const scope: RuntimeScope = {
    tenantId: 'local-dev',
    userId: 'smoke-user',
    workspaceId: 'smoke-workspace',
    threadId: 'smoke-thread',
    runId: 'smoke-run'
  };
  const sandbox: SandboxSession = {
    id: 'smoke-docker-workspace',
    provider: 'docker',
    scope,
    status: 'running',
    workspacePath,
    createdAt: new Date()
  };
  const transcriptStore = new InMemoryProviderTranscriptStore();
  const adapter = new DockerClaudeAgentAdapter({
    ...config.adapterOptions,
    guestWorkspacePath: '/workspace',
    hostConfigDir: configDir,
    hostCredentialsDir: credentialsDir,
    hostWorkspacePath: workspacePath,
    image,
    transcriptStore
  });
  const events: string[] = [];
  const runner = new AdapterAgentRunner({
    adapter,
    onEvent(event) {
      events.push(event.type);
    }
  });
  const result = await runner.run({
    scope,
    prompt: [
      'Use the Bash tool once to run exactly this command:',
      "pwd > pwd.txt && printf 'docker-claude-smoke-ok\\n' > smoke.txt",
      'Then reply with exactly: docker-claude-smoke-ok'
    ].join('\n'),
    sandbox
  });

  if (result.failure) {
    throw new Error(result.failure);
  }

  const pwdText = await readFile(path.join(workspacePath, 'pwd.txt'), 'utf8');
  if (pwdText.trim() !== '/workspace') {
    throw new Error(`Expected Docker Claude cwd to be /workspace, got ${JSON.stringify(pwdText.trim())}.`);
  }

  const smokeText = await readFile(path.join(workspacePath, 'smoke.txt'), 'utf8');
  if (smokeText !== 'docker-claude-smoke-ok\n') {
    throw new Error(`Unexpected smoke artifact content: ${JSON.stringify(smokeText)}.`);
  }

  if (!result.providerSessionId) {
    throw new Error('Docker Claude smoke did not bind a provider session id.');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: 'claude',
        mode: 'docker',
        image,
        baseUrl: config.baseUrl,
        isDeepSeek: config.isDeepSeek,
        model: config.model ?? null,
        providerSessionId: result.providerSessionId,
        workspacePwd: pwdText.trim(),
        eventTypes: events
      },
      null,
      2
    )
  );
}

async function loadEnvFile(filePath: string): Promise<void> {
  if (!existsSync(filePath)) {
    return;
  }

  const raw = await readFile(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '');
    process.env[key] = value;
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

function readTimeoutMs(): number {
  const raw = process.env.CLOUD_AGENT_DOCKER_CLAUDE_SMOKE_TIMEOUT_MS?.trim();
  const parsed = raw ? Number(raw) : 60_000;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
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
