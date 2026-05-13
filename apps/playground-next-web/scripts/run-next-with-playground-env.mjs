import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const nextWebAppRoot = path.resolve(import.meta.dirname, '..');

function buildEnvFilenames() {
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  return [
    `.env.${nodeEnv}.local`,
    '.env.local',
    `.env.${nodeEnv}`,
    '.env'
  ];
}

function loadPlaygroundEnv(roots = [nextWebAppRoot, repoRoot]) {
  const filenames = buildEnvFilenames();

  for (const root of roots) {
    for (const filename of filenames) {
      const candidate = path.join(root, filename);
      if (fs.existsSync(candidate)) {
        process.loadEnvFile(candidate);
      }
    }
  }
}

loadPlaygroundEnv();

const nextArgs = process.argv.slice(2);
if (nextArgs.length === 0) {
  console.error('Usage: node ./scripts/run-next-with-playground-env.mjs <next-command> [...args]');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');
const child = spawn(process.execPath, [nextBin, ...nextArgs], {
  env: process.env,
  stdio: 'inherit'
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
