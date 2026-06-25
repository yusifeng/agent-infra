import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { materializeCodexHomeAuth } from '../src/codex-home-auth';

async function tempDir(): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), 'agent-infra-codex-home-auth-'));
}

describe('materializeCodexHomeAuth', () => {
  it('copies auth.json only for codex-home auth mode', async () => {
      const root = await tempDir();
    try {
      const sourceHome = path.join(root, 'source');
      const configDir = path.join(root, 'runtime');
      await mkdir(sourceHome, { recursive: true });
      await writeFile(path.join(sourceHome, 'auth.json'), '{"token":"dev"}');

      const result = await materializeCodexHomeAuth({
        authMode: 'codex-home',
        configDir,
        sourceHome
      });

      expect(result.copied).toBe(true);
      await expect(readFile(path.join(configDir, 'auth.json'), 'utf8')).resolves.toBe('{"token":"dev"}');
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it('removes stale runtime auth.json outside codex-home auth mode', async () => {
      const root = await tempDir();
    try {
      const configDir = path.join(root, 'runtime');
      await mkdir(configDir, { recursive: true });
      await writeFile(path.join(configDir, 'auth.json'), '{"token":"stale"}');

      const result = await materializeCodexHomeAuth({
        authMode: 'api-key',
        configDir,
        sourceHome: path.join(root, 'source')
      });

      expect(result).toMatchObject({
        copied: false,
        sourceAuthPath: null,
        targetAuthPath: path.join(configDir, 'auth.json')
      });
      await expect(readFile(path.join(configDir, 'auth.json'), 'utf8')).rejects.toMatchObject({
        code: 'ENOENT'
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
