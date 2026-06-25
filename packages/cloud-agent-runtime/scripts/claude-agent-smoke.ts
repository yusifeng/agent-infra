import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AdapterAgentRunner,
  ClaudeAgentAdapter,
  resolveClaudeAgentConfig,
  type RuntimeScope,
  type SandboxSession
} from '../src/index.js';

const packageRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '../..');
const defaultEnvFile = path.join(repoRoot, 'apps/cloud-agent-next-web/.env.local');
const envFile = process.env.CLOUD_AGENT_ENV_FILE?.trim() || defaultEnvFile;
const smokeRoot = path.join(packageRoot, '.tmp/claude-agent-smoke');
const workspacePath = path.join(smokeRoot, 'workspace');
const configDir = path.join(smokeRoot, 'claude-config');

await loadEnvFile(envFile);
await rm(smokeRoot, { force: true, recursive: true });
await Promise.all([
  mkdir(workspacePath, { recursive: true }),
  mkdir(configDir, { recursive: true })
]);

const config = resolveClaudeAgentConfig({
  clientApp: 'agent-infra/cloud-agent-runtime-smoke',
  configDir,
  env: process.env
});

if (!config.configured) {
  throw new Error('Claude SDK smoke requires ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN.');
}

const scope: RuntimeScope = {
  tenantId: 'local-dev',
  userId: 'smoke-user',
  workspaceId: 'smoke-workspace',
  threadId: 'smoke-thread',
  runId: 'smoke-run'
};
const sandbox: SandboxSession = {
  id: 'smoke-local-workspace',
  provider: 'local-workspace',
  scope,
  status: 'running',
  workspacePath,
  createdAt: new Date()
};
const adapter = new ClaudeAgentAdapter({
  ...config.adapterOptions,
  cwd: workspacePath
});
const runner = new AdapterAgentRunner({ adapter });
const result = await runner.run({
  scope,
  prompt: 'Reply with exactly: sdk-smoke-ok',
  sandbox
});

if (result.failure) {
  throw new Error(result.failure);
}

if (!result.content.toLowerCase().includes('sdk-smoke-ok')) {
  throw new Error(`Claude SDK smoke returned unexpected content: ${result.content}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      provider: 'claude',
      baseUrl: config.baseUrl,
      isDeepSeek: config.isDeepSeek,
      model: config.model ?? null,
      timeoutMs: config.adapterOptions.timeoutMs
    },
    null,
    2
  )
);

async function loadEnvFile(filePath: string): Promise<void> {
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
