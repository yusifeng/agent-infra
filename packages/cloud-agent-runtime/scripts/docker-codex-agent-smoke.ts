import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  AdapterAgentRunner,
  DEFAULT_CODEX_AGENT_DOCKER_IMAGE,
  DockerCodexAgentAdapter,
  InMemoryProviderTranscriptStore,
  materializeCodexHomeAuth,
  parseDockerContainerRuntime,
  resolveCodexAgentConfig,
  type RuntimeScope,
  type SandboxSession
} from '../src/index.js';
import {
  defaultEnvFile,
  defaultSmokeRoot,
  ensureDockerAvailable,
  ensureDockerImage,
  loadEnvFile,
  prepareCleanDirectories,
  runCommand
} from './smoke-helpers.js';

const envFile = process.env.CLOUD_AGENT_ENV_FILE?.trim() || defaultEnvFile;
const smokeRoot = process.env.CLOUD_AGENT_SMOKE_ROOT?.trim() || defaultSmokeRoot('docker-codex-agent-smoke');
const workspacePath = path.join(smokeRoot, 'workspace');
const configDir = path.join(smokeRoot, 'codex-home');
const credentialsDir = path.join(smokeRoot, 'credentials');
const image = process.env.CLOUD_AGENT_CODEX_DOCKER_IMAGE?.trim() || DEFAULT_CODEX_AGENT_DOCKER_IMAGE;
const dockerRuntime = parseDockerContainerRuntime(process.env.CLOUD_AGENT_DOCKER_RUNTIME);

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  await loadEnvFile(envFile);
  await ensureDockerAvailable();
  await ensureDockerImage({ dockerfile: 'Dockerfile.codex-agent', imageName: image });
  await prepareCleanDirectories(smokeRoot, [workspacePath, configDir, credentialsDir]);
  await assertContainerPwd();
  console.error('Docker Codex workspace preflight passed: container pwd is /workspace.');

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
    throw new Error('Docker Codex SDK smoke requires CODEX_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, a DeepSeek Anthropic key, or CODEX_AUTH_MODE=codex-home with CODEX_HOME.');
  }

  const scope: RuntimeScope = {
    tenantId: 'local-dev',
    userId: 'smoke-user',
    workspaceId: 'smoke-workspace',
    threadId: 'smoke-thread',
    runId: 'smoke-run'
  };
  const sandbox: SandboxSession = {
    id: 'smoke-docker-workspace',
    provider: 'docker',
    scope,
    status: 'running',
    workspacePath,
    createdAt: new Date()
  };
  const transcriptStore = new InMemoryProviderTranscriptStore();
  const adapter = new DockerCodexAgentAdapter({
    ...config.adapterOptions,
    guestWorkspacePath: '/workspace',
    hostConfigDir: configDir,
    hostCredentialsDir: credentialsDir,
    hostWorkspacePath: workspacePath,
    image,
    dockerRuntime,
    sandboxMode: 'danger-full-access',
    transcriptStore
  });
  const eventTypes: string[] = [];
  const toolEvents: Array<{ payload: unknown; type: string }> = [];
  const runner = new AdapterAgentRunner({
    adapter,
    onEvent(event) {
      eventTypes.push(event.type);
      if (event.type.startsWith('tool_call_') || event.type === 'file_change_detected') {
        toolEvents.push({
          payload: event.payload,
          type: event.type
        });
      }
    }
  });
  const result = await runner.run({
    scope,
    prompt: [
      'This is a strict smoke test.',
      '1. Run pwd.',
      '2. Create /workspace/codex-write-target.txt with exactly this content: codex-write-ok',
      '3. Read /workspace/codex-write-target.txt.',
      'After the commands finish, reply with exactly: codex-docker-smoke-ok'
    ].join('\n'),
    sandbox
  });

  if (result.failure) {
    throw new Error(formatFailure(result.failure, config.isDeepSeek));
  }

  if (eventTypes.includes('tool_call_failed')) {
    throw new Error(`Docker Codex SDK smoke observed failed tool calls: ${JSON.stringify(toolEvents, null, 2)}`);
  }

  if (!result.content.toLowerCase().includes('codex-docker-smoke-ok')) {
    throw new Error(`Docker Codex SDK smoke returned unexpected content: ${result.content}`);
  }

  const writtenText = await readFile(path.join(workspacePath, 'codex-write-target.txt'), 'utf8');
  if (writtenText.trim() !== 'codex-write-ok') {
    throw new Error(`Expected Codex Docker smoke to create codex-write-target.txt, got ${JSON.stringify(writtenText)}.`);
  }

  const transcriptEntries = result.providerSessionId
    ? await transcriptStore.load({
        scope,
        key: {
          provider: 'codex',
          providerSessionId: result.providerSessionId
        }
      })
    : [];

  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: 'codex',
        mode: 'docker',
        image,
        dockerRuntime: dockerRuntime ?? 'default',
        apiKeySource: config.apiKeySource,
        baseUrl: config.baseUrl,
        isDeepSeek: config.isDeepSeek,
        model: config.model ?? null,
        authMode: config.authMode,
        codexHomeAuthCopied: authMaterialization.copied,
        providerSessionId: result.providerSessionId ?? null,
        transcriptEntries: transcriptEntries.length,
        workspacePwd: '/workspace',
        eventTypes,
        toolEvents
      },
      null,
      2
    )
  );
  process.exit(0);
}

async function assertContainerPwd(): Promise<void> {
  const result = await runCommand('docker', [
    'run',
    '--rm',
    ...(dockerRuntime ? ['--runtime', dockerRuntime] : []),
    '--workdir',
    '/workspace',
    '--mount',
    `type=bind,source=${workspacePath},target=/workspace`,
    image,
    'node',
    '-e',
    'console.log(process.cwd())'
  ]);
  const pwd = result.stdout.trim();
  if (pwd !== '/workspace') {
    throw new Error(`Expected Docker Codex container cwd to be /workspace, got ${JSON.stringify(pwd)}.`);
  }
}

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
