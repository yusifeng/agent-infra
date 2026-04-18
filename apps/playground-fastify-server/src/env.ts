import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const fastifyAppRoot = path.resolve(import.meta.dirname, '..');
const nextWebAppRoot = path.resolve(repoRoot, 'apps/playground-next-web');

function buildEnvFilenames() {
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  return [
    `.env.${nodeEnv}.local`,
    '.env.local',
    `.env.${nodeEnv}`,
    '.env'
  ];
}

function buildEnvSearchPaths() {
  const filenames = buildEnvFilenames();
  const roots = [fastifyAppRoot, repoRoot, nextWebAppRoot];

  return roots.flatMap((root) => filenames.map((filename) => path.join(root, filename)));
}

export function loadPlaygroundEnv() {
  const loadedFiles: string[] = [];

  for (const candidate of buildEnvSearchPaths()) {
    if (!fs.existsSync(candidate)) {
      continue;
    }

    process.loadEnvFile(candidate);
    loadedFiles.push(path.relative(repoRoot, candidate) || candidate);
  }

  return loadedFiles;
}
