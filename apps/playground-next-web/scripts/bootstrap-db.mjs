import path from 'node:path';

import { createDbConfigFromEnv } from '@agent-infra/db';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const nextWebAppRoot = path.resolve(import.meta.dirname, '..');
const envRoots = [nextWebAppRoot, repoRoot];

function buildEnvFilenames() {
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  return [
    `.env.${nodeEnv}.local`,
    '.env.local',
    `.env.${nodeEnv}`,
    '.env'
  ];
}

function loadEnvFiles() {
  const loadedFiles = [];

  for (const root of envRoots) {
    for (const filename of buildEnvFilenames()) {
      const candidate = path.join(root, filename);
      try {
        process.loadEnvFile(candidate);
        loadedFiles.push(path.relative(repoRoot, candidate) || candidate);
      } catch {
        // Ignore missing env files and keep loading lower-priority candidates.
      }
    }
  }

  return loadedFiles;
}

const envFiles = loadEnvFiles();
const dbConfig = createDbConfigFromEnv();
await dbConfig.bootstrapSchema();

console.log(
  JSON.stringify(
    {
      ok: true,
      envFiles,
      dbMode: dbConfig.mode,
      connectionString: dbConfig.connectionString
    },
    null,
    2
  )
);
