import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);

function canLoadBetterSqlite3() {
  try {
    require('better-sqlite3');
    return {
      ok: true,
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      error
    };
  }
}

function isAbiMismatch(error) {
  return error instanceof Error && error.message.includes('NODE_MODULE_VERSION');
}

function formatError(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

const firstAttempt = canLoadBetterSqlite3();
if (firstAttempt.ok) {
  process.exit(0);
}

if (!isAbiMismatch(firstAttempt.error)) {
  console.error('[agent-infra/db] Failed to load better-sqlite3 before tests.');
  console.error(formatError(firstAttempt.error));
  process.exit(1);
}

console.warn('[agent-infra/db] better-sqlite3 ABI mismatch detected. Rebuilding native module for the current Node runtime...');

const rebuild = spawnSync('pnpm', ['rebuild', 'better-sqlite3'], {
  cwd: process.cwd(),
  stdio: 'inherit'
});

if (rebuild.status !== 0) {
  console.error('[agent-infra/db] Failed to rebuild better-sqlite3 for the current Node runtime.');
  process.exit(rebuild.status ?? 1);
}

const secondAttempt = canLoadBetterSqlite3();
if (secondAttempt.ok) {
  console.warn('[agent-infra/db] better-sqlite3 rebuilt successfully.');
  process.exit(0);
}

console.error('[agent-infra/db] better-sqlite3 still failed to load after rebuild.');
console.error(formatError(secondAttempt.error));
process.exit(1);
