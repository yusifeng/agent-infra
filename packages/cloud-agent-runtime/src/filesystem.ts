import { createHash } from 'node:crypto';
import { readdir, readFile, rm, mkdir, cp, stat } from 'node:fs/promises';
import path from 'node:path';

import type { WorkspaceChange } from './types.js';

export function resolveInside(rootDir: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new Error(`Path must be relative: ${relativePath}`);
  }

  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Path escapes root: ${relativePath}`);
  }

  return resolved;
}

export async function copyDirectory(sourceDir: string, targetDir: string): Promise<void> {
  await rm(targetDir, { force: true, recursive: true });
  await mkdir(path.dirname(targetDir), { recursive: true });
  await cp(sourceDir, targetDir, { recursive: true });
}

export async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

export async function scanFileHashes(rootDir: string): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();

  async function visit(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = path.relative(rootDir, absolutePath).split(path.sep).join('/');

      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }

      if (entry.isFile()) {
        hashes.set(relativePath, await hashFile(absolutePath));
      }
    }
  }

  await visit(rootDir);
  return hashes;
}

export async function hashDirectory(rootDir: string): Promise<string> {
  const hashes = await scanFileHashes(rootDir);
  const digest = createHash('sha256');
  for (const [relativePath, fileHash] of [...hashes.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    digest.update(relativePath);
    digest.update('\0');
    digest.update(fileHash);
    digest.update('\0');
  }

  return digest.digest('hex');
}

export function diffFileHashes(before: Map<string, string>, after: Map<string, string>): WorkspaceChange[] {
  const changes: WorkspaceChange[] = [];

  for (const [pathName, contentHash] of after) {
    const previousHash = before.get(pathName);
    if (!previousHash) {
      changes.push({ path: pathName, type: 'created', contentHash });
      continue;
    }

    if (previousHash !== contentHash) {
      changes.push({ path: pathName, type: 'modified', contentHash });
    }
  }

  for (const pathName of before.keys()) {
    if (!after.has(pathName)) {
      changes.push({ path: pathName, type: 'deleted' });
    }
  }

  return changes.sort((left, right) => left.path.localeCompare(right.path));
}

export async function ensureDirectoryExists(dir: string): Promise<void> {
  const dirStat = await stat(dir);
  if (!dirStat.isDirectory()) {
    throw new Error(`Expected directory: ${dir}`);
  }
}
