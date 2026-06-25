import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export interface DockerProcessInput {
  args: string[];
  keepStdinOpen?: boolean;
  stdin?: string;
  timeoutMs?: number;
}

export interface DockerProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type DockerProcessRunner = (input: DockerProcessInput) => Promise<DockerProcessResult>;

export interface DockerMount {
  source: string;
  target: string;
  readonly?: boolean;
}

export interface DockerRunArgsInput {
  command: string[];
  containerName: string;
  env?: Record<string, string>;
  image: string;
  mounts: DockerMount[];
  workdir: string;
}

export type DockerStreamEvent =
  | {
      type: 'stdout_line';
      line: string;
      writeStdin?: (line: string) => void;
    }
  | {
      type: 'stderr';
      chunk: string;
    }
  | {
      type: 'exit';
      exitCode: number;
    };

export function buildDockerRunArgs(input: DockerRunArgsInput): string[] {
  return [
    'run',
    '--rm',
    '-i',
    '--name',
    input.containerName,
    '--workdir',
    input.workdir,
    ...input.mounts.flatMap(buildDockerMountArgs),
    ...buildDockerEnvArgs(input.env),
    input.image,
    ...input.command
  ];
}

export function runDockerProcess(input: DockerProcessInput): Promise<DockerProcessResult> {
  return new Promise((resolve, reject) => {
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

export async function* streamDockerProcess(input: DockerProcessInput): AsyncIterable<DockerStreamEvent> {
  const child = spawn('docker', input.args, {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  let timeout: NodeJS.Timeout | null = null;
  let stdoutBuffer = '';
  const stderrChunks: Buffer[] = [];

  if (typeof input.timeoutMs === 'number') {
    timeout = setTimeout(() => {
      child.kill('SIGKILL');
    }, input.timeoutMs);
  }

  const closePromise = new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (exitCode) => resolve(exitCode ?? 1));
  });

  const stderrPromise = (async () => {
    for await (const chunk of child.stderr) {
      stderrChunks.push(Buffer.from(chunk));
    }
  })();

  if (input.stdin) {
    child.stdin.write(input.stdin);
  }
  if (!input.keepStdinOpen) {
    child.stdin.end();
  }

  for await (const chunk of child.stdout) {
    stdoutBuffer += Buffer.from(chunk).toString('utf8');
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() ?? '';

    for (const line of lines) {
      yield {
        type: 'stdout_line',
        line,
        writeStdin(lineToWrite) {
          child.stdin.write(lineToWrite);
        }
      };
    }
  }

  if (stdoutBuffer.trim()) {
    yield {
      type: 'stdout_line',
      line: stdoutBuffer,
      writeStdin(lineToWrite) {
        child.stdin.write(lineToWrite);
      }
    };
  }

  if (input.keepStdinOpen) {
    child.stdin.end();
  }

  const exitCode = await closePromise;
  await stderrPromise;
  if (timeout) {
    clearTimeout(timeout);
  }

  const stderr = Buffer.concat(stderrChunks).toString('utf8');
  if (stderr) {
    yield {
      type: 'stderr',
      chunk: stderr
    };
  }

  yield {
    type: 'exit',
    exitCode
  };
}

export function safeContainerSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 48);
}

export function buildDockerContainerName(prefix: string, runId: string): string {
  const prefixSegment = safeContainerSegment(prefix).slice(0, 32) || 'agent';
  const runSegment = safeContainerSegment(runId).slice(0, 36) || 'run';
  const nonce = safeContainerSegment(randomUUID()).slice(0, 8);
  return `${prefixSegment}-${runSegment}-${nonce}`;
}

export function normalizeGuestWorkspaceRelativePath(value: string, guestWorkspacePath: string): string | null {
  const normalized = value.replaceAll('\\', '/');
  const workspaceRoot = guestWorkspacePath.replace(/\/+$/, '') || '/workspace';
  if (!normalized.startsWith(`${workspaceRoot}/`)) {
    return null;
  }

  const relativePath = normalized.slice(workspaceRoot.length + 1);
  const parts = relativePath.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) {
    return null;
  }

  return parts.join('/');
}

function buildDockerMountArgs(mount: DockerMount): string[] {
  return [
    '--mount',
    [
      'type=bind',
      `source=${path.resolve(mount.source)}`,
      `target=${mount.target}`,
      ...(mount.readonly ? ['readonly'] : [])
    ].join(',')
  ];
}

function buildDockerEnvArgs(env: Record<string, string> | undefined): string[] {
  return Object.entries(env ?? {}).flatMap(([name, value]) => ['--env', `${name}=${value}`]);
}
