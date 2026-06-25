import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import {
  AdapterAgentRunner,
  CodexAgentAdapter,
  materializeCodexHomeAuth,
  resolveCodexAgentConfig,
  type RuntimeScope,
  type SandboxSession
} from '../src/index.js';
import { defaultEnvFile, defaultSmokeRoot, loadEnvFile } from './smoke-helpers.js';

const envFile = process.env.CLOUD_AGENT_ENV_FILE?.trim() || defaultEnvFile;
const smokeRoot = process.env.CLOUD_AGENT_SMOKE_ROOT?.trim() || defaultSmokeRoot('codex-agent-smoke');
const workspacePath = path.join(smokeRoot, 'workspace');
const configDir = path.join(smokeRoot, 'codex-home');

await loadEnvFile(envFile);
await rm(smokeRoot, { force: true, recursive: true });
await Promise.all([
  mkdir(workspacePath, { recursive: true }),
  mkdir(configDir, { recursive: true })
]);
const config = resolveCodexAgentConfig({
  configDir,
  env: process.env
});
const authMaterialization = await materializeCodexHomeAuth({
  authMode: config.authMode,
  configDir,
  sourceHome: config.codexHomeAuthSource
});

if (!config.configured) {
  throw new Error('Codex SDK smoke requires CODEX_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, a DeepSeek Anthropic key, or CODEX_AUTH_MODE=codex-home with CODEX_HOME.');
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
const adapter = new CodexAgentAdapter({
  ...config.adapterOptions,
  workingDirectory: workspacePath
});
const runner = new AdapterAgentRunner({ adapter });
const result = await runner.run({
  scope,
  prompt: 'Reply with exactly: codex-sdk-smoke-ok',
  sandbox
});

if (result.failure) {
  throw new Error(formatFailure(result.failure, config.isDeepSeek));
}

if (!result.content.toLowerCase().includes('codex-sdk-smoke-ok')) {
  throw new Error(`Codex SDK smoke returned unexpected content: ${result.content}`);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      provider: 'codex',
      apiKeySource: config.apiKeySource,
      baseUrl: config.baseUrl,
      isDeepSeek: config.isDeepSeek,
      model: config.model ?? null,
      authMode: config.authMode,
      codexHomeAuthCopied: authMaterialization.copied,
      providerSessionId: result.providerSessionId ?? null,
      timeoutMs: config.adapterOptions.timeoutMs
    },
    null,
    2
  )
);

function formatFailure(failure: string, isDeepSeek: boolean): string {
  if (isDeepSeek && failure.includes('/responses')) {
    return [
      failure,
      'DeepSeek currently exposes OpenAI-compatible Chat Completions, while Codex SDK requests the Responses protocol.',
      'Use a Responses-compatible endpoint/key or a gateway before treating this as an adapter failure.'
    ].join('\n');
  }

  return failure;
}
