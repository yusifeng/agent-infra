import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildEnvSearchPaths, loadPlaygroundEnv } from '../src/env.js';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

describe('playground fastify env loader', () => {
  it('does not include playground-next-web env files in the default search paths', () => {
    const searchPaths = buildEnvSearchPaths();

    expect(searchPaths.some((candidate) => candidate.includes('apps/playground-next-web'))).toBe(false);
  });

  it('loads only the configured search paths that exist', () => {
    const loaded: string[] = [];
    const existingPaths = new Set([
      path.join(repoRoot, 'apps/playground-fastify-server/.env'),
      path.join(repoRoot, '.env')
    ]);
    const fastifyEnvPath = path.join(repoRoot, 'apps/playground-fastify-server/.env');
    const nextEnvPath = path.join(repoRoot, 'apps/playground-next-web/.env');
    const rootEnvPath = path.join(repoRoot, '.env');

    const envFiles = loadPlaygroundEnv({
      searchPaths: [fastifyEnvPath, nextEnvPath, rootEnvPath],
      existsSync: (candidate) => existingPaths.has(candidate),
      loadEnvFile: (candidate) => {
        loaded.push(candidate);
      }
    });

    expect(loaded).toEqual([fastifyEnvPath, rootEnvPath]);
    expect(envFiles).toEqual(['apps/playground-fastify-server/.env', '.env']);
  });
});
