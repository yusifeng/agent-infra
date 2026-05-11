import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const fastifyAppRoot = path.resolve(import.meta.dirname, '..');

function buildEnvFilenames() {
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  return [
    `.env.${nodeEnv}.local`,
    '.env.local',
    `.env.${nodeEnv}`,
    '.env'
  ];
}

export function buildEnvSearchPaths(roots: readonly string[] = [fastifyAppRoot, repoRoot]) {
  const filenames = buildEnvFilenames();

  return roots.flatMap((root) => filenames.map((filename) => path.join(root, filename)));
}

export function loadPlaygroundEnv(options: {
  existsSync?: (candidate: string) => boolean;
  loadEnvFile?: (candidate: string) => void;
  searchPaths?: readonly string[];
} = {}) {
  const existsSync = options.existsSync ?? fs.existsSync;
  const loadEnvFile = options.loadEnvFile ?? ((candidate: string) => process.loadEnvFile(candidate));
  const searchPaths = options.searchPaths ?? buildEnvSearchPaths();
  const loadedFiles: string[] = [];

  for (const candidate of searchPaths) {
    if (!existsSync(candidate)) {
      continue;
    }

    loadEnvFile(candidate);
    loadedFiles.push(path.relative(repoRoot, candidate) || candidate);
  }

  return loadedFiles;
}
