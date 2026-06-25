import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
const expectedTools = ['Bash', 'Read', 'Edit', 'Write'] as const;

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
  await writeFile(path.join(workspacePath, 'read-edit-target.txt'), 'before-edit\n');

  const config = resolveClaudeAgentConfig({
    clientApp: 'agent-infra/cloud-agent-runtime-docker-smoke',
    configDir,
    defaultTimeoutMs: readTimeoutMs(),
    enableBashTool: true,
    env: process.env,
    toolAllowlist: [...expectedTools]
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
  const eventTypes: string[] = [];
  const toolNames = new Set<string>();
  const runner = new AdapterAgentRunner({
    adapter,
    onEvent(event) {
      eventTypes.push(event.type);
      const toolName = event.payload?.toolName;
      if (typeof toolName === 'string') {
        toolNames.add(toolName);
      }
    }
  });
  const result = await runner.run({
    scope,
    prompt: [
      'This is a strict smoke test. Use exactly these built-in tools, in this order:',
      '1. Use Bash to run: pwd > pwd.txt',
      '2. Use Read to read read-edit-target.txt',
      '3. Use Edit to replace before-edit with after-edit in read-edit-target.txt',
      '4. Use Write to create write-target.txt with exactly this content: write-tool-ok',
      'Do not use Bash to create or edit read-edit-target.txt or write-target.txt.',
      'After the tools finish, reply with exactly: docker-claude-smoke-ok'
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

  const editedText = await readFile(path.join(workspacePath, 'read-edit-target.txt'), 'utf8');
  if (editedText !== 'after-edit\n') {
    throw new Error(`Expected Edit tool to update read-edit-target.txt, got ${JSON.stringify(editedText)}.`);
  }

  const writtenText = await readFile(path.join(workspacePath, 'write-target.txt'), 'utf8');
  if (writtenText.trim() !== 'write-tool-ok') {
    throw new Error(`Expected Write tool to create write-target.txt, got ${JSON.stringify(writtenText)}.`);
  }

  if (!result.providerSessionId) {
    throw new Error('Docker Claude smoke did not bind a provider session id.');
  }

  assertEventType(eventTypes, 'provider_session_bound');
  assertEventType(eventTypes, 'tool_call_started');
  assertEventType(eventTypes, 'tool_call_completed');
  assertEventType(eventTypes, 'file_change_detected');
  assertEventType(eventTypes, 'agent_completed');
  for (const toolName of expectedTools) {
    if (!toolNames.has(toolName)) {
      throw new Error(`Expected Docker Claude smoke to use ${toolName}; saw tools: ${[...toolNames].join(', ')}`);
    }
  }

  const transcript = await transcriptStore.load({
    scope,
    key: {
      provider: 'claude',
      providerSessionId: result.providerSessionId
    }
  });
  if (transcript.length === 0) {
    throw new Error('Docker Claude smoke did not persist raw provider transcript entries.');
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
        transcriptEntries: transcript.length,
        workspacePwd: pwdText.trim(),
        eventTypes,
        toolNames: [...toolNames].sort()
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

function assertEventType(events: string[], type: string): void {
  if (!events.includes(type)) {
    throw new Error(`Expected Docker Claude smoke event ${type}; saw events: ${events.join(', ')}`);
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
