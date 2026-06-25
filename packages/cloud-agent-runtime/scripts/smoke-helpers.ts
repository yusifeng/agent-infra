import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const repoRoot = path.resolve(packageRoot, '../..');
export const defaultEnvFile = path.join(repoRoot, 'apps/cloud-agent-next-web/.env.local');

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function defaultSmokeRoot(name: string): string {
  return path.join(repoRoot, '.tmp/cloud-agent-runtime', name);
}

export async function loadEnvFile(filePath: string): Promise<void> {
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

export async function prepareCleanDirectories(root: string, directories: string[]): Promise<void> {
  await rm(root, { force: true, recursive: true });
  await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true })));
}

export async function ensureDockerAvailable(): Promise<void> {
  await runCommand('docker', ['info', '--format', '{{.ServerVersion}}'], {
    errorMessage: 'Docker CLI is not available or Docker is not running.'
  });
}

export async function ensureDockerImage(input: {
  dockerfile: string;
  imageName: string;
}): Promise<void> {
  const inspected = await runCommand('docker', ['image', 'inspect', input.imageName], {
    allowFailure: true
  });
  if (inspected.exitCode === 0) {
    return;
  }

  await runCommand('docker', [
    'build',
    '-t',
    input.imageName,
    '-f',
    path.join(packageRoot, 'docker', input.dockerfile),
    path.join(packageRoot, 'docker')
  ]);
}

export function runCommand(
  command: string,
  args: string[],
  options: {
    allowFailure?: boolean;
    errorMessage?: string;
  } = {}
): Promise<CommandResult> {
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
        resolve({
          exitCode: 1,
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error)
        });
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
