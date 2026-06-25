import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';

import { diffFileHashes, scanFileHashes } from './filesystem.js';
import { buildDockerRuntimeArgs, type DockerContainerRuntime } from './docker-agent-process.js';
import type {
  NetworkPolicy,
  SandboxExecInput,
  SandboxExecResult,
  SandboxFileEntry,
  SandboxPolicy,
  SandboxProvider,
  SandboxSession,
  WorkspaceChangeSet,
  WorkspaceMaterialization,
  WorkspaceSnapshotRef,
  ResourceLimits,
  RuntimeScope
} from './types.js';

export interface DockerCommandInput {
  args: string[];
  stdin?: string;
  timeoutMs?: number;
}

export interface DockerCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type DockerCommandRunner = (input: DockerCommandInput) => Promise<DockerCommandResult>;

interface DockerSandboxRecord {
  session: SandboxSession;
  containerId: string;
  policy: SandboxPolicy;
  baselineHashes: Map<string, string>;
}

export interface DockerSandboxProviderOptions {
  docker?: DockerCommandRunner;
  name?: string;
  containerPrefix?: string;
  runtime?: DockerContainerRuntime;
  workspaceTargetPath?: string;
}

export class DockerSandboxProvider implements SandboxProvider {
  readonly name: string;
  private readonly docker: DockerCommandRunner;
  private readonly containerPrefix: string;
  private readonly runtime?: DockerContainerRuntime;
  private readonly workspaceTargetPath: string;
  private readonly sessions = new Map<string, DockerSandboxRecord>();

  constructor(options: DockerSandboxProviderOptions = {}) {
    this.name = options.name ?? 'docker';
    this.docker = options.docker ?? createDockerCliRunner();
    this.containerPrefix = options.containerPrefix ?? 'agent-infra';
    this.runtime = options.runtime;
    this.workspaceTargetPath = options.workspaceTargetPath ?? '/workspace';
  }

  async create(input: {
    scope: RuntimeScope;
    workspace: WorkspaceMaterialization;
    image: string;
    policy: SandboxPolicy;
    limits?: ResourceLimits;
  }): Promise<SandboxSession> {
    const sessionId = randomUUID();
    const containerName = `${this.containerPrefix}-${sessionId}`;
    const args = [
      'run',
      ...buildDockerRuntimeArgs(this.runtime),
      '--detach',
      '--name',
      containerName,
      '--workdir',
      this.workspaceTargetPath,
      '--mount',
      this.buildWorkspaceMount(input.workspace.workspacePath, input.policy),
      ...this.buildNetworkArgs(input.policy.network),
      ...this.buildLimitArgs(input.limits),
      input.image,
      'tail',
      '-f',
      '/dev/null'
    ];

    const result = await this.docker({ args });
    this.assertDockerSuccess('docker run', result);

    const session: SandboxSession = {
      id: sessionId,
      provider: this.name,
      scope: { ...input.scope },
      status: 'running',
      workspacePath: input.workspace.workspacePath,
      createdAt: new Date()
    };

    this.sessions.set(sessionId, {
      session,
      containerId: result.stdout.trim() || containerName,
      policy: input.policy,
      baselineHashes: await scanFileHashes(input.workspace.workspacePath)
    });

    return session;
  }

  async exec(input: SandboxExecInput): Promise<SandboxExecResult> {
    const record = this.requireSession(input.sessionId);
    const result = await this.docker({
      args: [
        'exec',
        ...(input.cwd ? ['--workdir', this.toContainerPath(input.cwd)] : []),
        ...this.buildExecEnvArgs(record.policy, input.env ?? {}),
        record.containerId,
        ...input.command
      ],
      timeoutMs: input.limits?.timeoutMs
    });

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr
    };
  }

  async readFile(input: { sessionId: string; path: string; encoding?: 'utf8' | 'base64' }): Promise<string> {
    const record = this.requireSession(input.sessionId);
    const filePath = this.toContainerPath(input.path);
    const command = input.encoding === 'base64' ? ['base64', filePath] : ['cat', filePath];
    const result = await this.docker({ args: ['exec', record.containerId, ...command] });
    this.assertDockerSuccess('docker exec readFile', result);
    return result.stdout;
  }

  async writeFile(input: { sessionId: string; path: string; content: string; encoding?: 'utf8' | 'base64' }): Promise<void> {
    const record = this.requireSession(input.sessionId);
    const filePath = this.toContainerPath(input.path);
    const command =
      input.encoding === 'base64' ? ['sh', '-c', 'base64 -d > "$1"', 'sh', filePath] : ['tee', filePath];
    const result = await this.docker({
      args: ['exec', '-i', record.containerId, ...command],
      stdin: input.content
    });
    this.assertDockerSuccess('docker exec writeFile', result);
  }

  async listFiles(input: { sessionId: string; path: string }): Promise<SandboxFileEntry[]> {
    const record = this.requireSession(input.sessionId);
    const targetPath = this.toContainerPath(input.path);
    const result = await this.docker({
      args: ['exec', record.containerId, 'find', targetPath, '-mindepth', '1', '-maxdepth', '1', '-printf', '%P\t%y\t%s\n']
    });
    this.assertDockerSuccess('docker exec listFiles', result);

    return result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [entryPath, type, size] = line.split('\t');
        return {
          path: entryPath ?? '',
          type: type === 'd' ? 'directory' : 'file',
          size: typeof size === 'string' && size.length > 0 ? Number(size) : null
        };
      });
  }

  async collectChanges(input: { sessionId: string; baseSnapshot: WorkspaceSnapshotRef }): Promise<WorkspaceChangeSet> {
    const record = this.requireSession(input.sessionId);
    const currentHashes = await scanFileHashes(record.session.workspacePath);

    return {
      baseSnapshot: input.baseSnapshot,
      changes: diffFileHashes(record.baselineHashes, currentHashes)
    };
  }

  async destroy(input: { sessionId: string }): Promise<void> {
    const record = this.requireSession(input.sessionId);
    const result = await this.docker({ args: ['rm', '-f', record.containerId] });
    this.assertDockerSuccess('docker rm', result);
    this.sessions.delete(input.sessionId);
  }

  private buildWorkspaceMount(workspacePath: string, policy: SandboxPolicy): string {
    const readonly = policy.filesystem.workspaceMode === 'read-only' ? ',readonly' : '';
    return `type=bind,source=${path.resolve(workspacePath)},target=${this.workspaceTargetPath}${readonly}`;
  }

  private buildNetworkArgs(policy: NetworkPolicy): string[] {
    if (policy.mode === 'none') {
      return ['--network', 'none'];
    }

    if (policy.mode === 'open') {
      return ['--network', 'bridge'];
    }

    throw new Error('DockerSandboxProvider does not support allowlist network policy yet');
  }

  private buildLimitArgs(limits: ResourceLimits | undefined): string[] {
    if (!limits) {
      return [];
    }

    return [
      ...(typeof limits.cpuCount === 'number' ? ['--cpus', String(limits.cpuCount)] : []),
      ...(typeof limits.memoryBytes === 'number' ? ['--memory', String(limits.memoryBytes)] : [])
    ];
  }

  private buildExecEnvArgs(policy: SandboxPolicy, env: Record<string, string>): string[] {
    const entries = Object.entries(env);
    if (entries.length === 0) {
      return [];
    }

    const allowlist = new Set(policy.envAllowlist ?? []);
    const denied = entries.filter(([name]) => !allowlist.has(name)).map(([name]) => name);
    if (denied.length > 0) {
      throw new Error(`Environment variable is not allowed in sandbox exec: ${denied.join(', ')}`);
    }

    return entries.flatMap(([name, value]) => ['--env', `${name}=${value}`]);
  }

  private toContainerPath(inputPath: string): string {
    if (path.posix.isAbsolute(inputPath)) {
      const normalized = path.posix.normalize(inputPath);
      if (normalized === this.workspaceTargetPath || normalized.startsWith(`${this.workspaceTargetPath}/`)) {
        return normalized;
      }

      throw new Error(`Path escapes workspace: ${inputPath}`);
    }

    const normalized = path.posix.normalize(inputPath);
    if (normalized === '..' || normalized.startsWith('../')) {
      throw new Error(`Path escapes workspace: ${inputPath}`);
    }

    if (normalized === '.' || normalized === '') {
      return this.workspaceTargetPath;
    }

    return path.posix.join(this.workspaceTargetPath, normalized);
  }

  private requireSession(sessionId: string): DockerSandboxRecord {
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw new Error(`Unknown sandbox session: ${sessionId}`);
    }

    return record;
  }

  private assertDockerSuccess(command: string, result: DockerCommandResult): void {
    if (result.exitCode !== 0) {
      throw new Error(`${command} failed with exit code ${result.exitCode}: ${result.stderr.trim()}`);
    }
  }
}

function createDockerCliRunner(): DockerCommandRunner {
  return async (input) =>
    await new Promise<DockerCommandResult>((resolve, reject) => {
      const child = spawn('docker', input.args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let timeout: NodeJS.Timeout | null = null;

      if (typeof input.timeoutMs === 'number') {
        timeout = setTimeout(() => {
          child.kill('SIGKILL');
        }, input.timeoutMs);
      }

      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
      child.on('error', reject);
      child.on('close', (exitCode) => {
        if (timeout) {
          clearTimeout(timeout);
        }

        resolve({
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
          exitCode: exitCode ?? 1
        });
      });

      if (input.stdin) {
        child.stdin.write(input.stdin);
      }
      child.stdin.end();
    });
}
