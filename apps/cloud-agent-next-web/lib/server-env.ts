import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

let cachedServerEnv: Record<string, string | undefined> | null = null;

export function readServerEnv(): Record<string, string | undefined> {
  if (cachedServerEnv) {
    return cachedServerEnv;
  }

  cachedServerEnv = applyForcedProcessEnvKeys({
    ...process.env,
    ...readDotEnvLocal()
  });
  return cachedServerEnv;
}

function applyForcedProcessEnvKeys(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const forcedKeys = process.env.CLOUD_AGENT_ENV_FORCE_KEYS?.split(',')
    .map((key) => key.trim())
    .filter(Boolean) ?? [];

  for (const key of forcedKeys) {
    if (Object.prototype.hasOwnProperty.call(process.env, key)) {
      env[key] = process.env[key];
    }
  }

  return env;
}

function readDotEnvLocal(): Record<string, string> {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!existsSync(envPath)) {
    return {};
  }

  const env: Record<string, string> = {};
  const raw = readFileSync(envPath, 'utf8');
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
    env[key] = value;
  }

  return env;
}
