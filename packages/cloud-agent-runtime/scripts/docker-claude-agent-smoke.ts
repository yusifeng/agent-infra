import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  AdapterAgentRunner,
  DEFAULT_CLAUDE_AGENT_DOCKER_IMAGE,
  DockerClaudeAgentAdapter,
  InMemoryProviderTranscriptStore,
  parseDockerContainerRuntime,
  resolveClaudeAgentConfig,
  type RuntimeScope,
  type SandboxSession
} from '../src/index.js';
import {
  defaultEnvFile,
  defaultSmokeRoot,
  ensureDockerAvailable,
  ensureDockerImage,
  loadEnvFile,
  packageRoot,
  prepareCleanDirectories,
  repoRoot
} from './smoke-helpers.js';

const envFile = process.env.CLOUD_AGENT_ENV_FILE?.trim() || defaultEnvFile;
const smokeRoot = process.env.CLOUD_AGENT_SMOKE_ROOT?.trim() || defaultSmokeRoot('docker-claude-agent-smoke');
const workspacePath = path.join(smokeRoot, 'workspace');
const configDir = path.join(smokeRoot, 'claude-config');
const credentialsDir = path.join(smokeRoot, 'credentials');
const image = process.env.CLOUD_AGENT_CLAUDE_DOCKER_IMAGE?.trim() || DEFAULT_CLAUDE_AGENT_DOCKER_IMAGE;
const dockerRuntime = parseDockerContainerRuntime(process.env.CLOUD_AGENT_DOCKER_RUNTIME);
const expectedTools = ['Bash', 'Read', 'Edit', 'Write'] as const;

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  await loadEnvFile(envFile);
  await ensureDockerAvailable();
  await ensureDockerImage({ dockerfile: 'Dockerfile.claude-agent', imageName: image });
  await prepareCleanDirectories(smokeRoot, [workspacePath, configDir, credentialsDir]);
  await writeFile(path.join(workspacePath, 'read-edit-target.txt'), 'before-edit\n');

  const config = resolveClaudeAgentConfig({
    clientApp: 'agent-infra/cloud-agent-runtime-docker-smoke',
    configDir,
    defaultTimeoutMs: readTimeoutMs(),
    enableBashTool: true,
    env: process.env,
    toolAllowlist: [...expectedTools]
  });

  if (!config.configured) {
    throw new Error('Docker Claude SDK smoke requires ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN.');
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
  const adapter = new DockerClaudeAgentAdapter({
    ...config.adapterOptions,
    guestWorkspacePath: '/workspace',
    hostConfigDir: configDir,
    hostCredentialsDir: credentialsDir,
    hostWorkspacePath: workspacePath,
    image,
    dockerRuntime,
    transcriptStore
  });
  const eventTypes: string[] = [];
  const toolEvents: Array<{ payload: unknown; type: string }> = [];
  const toolNames = new Set<string>();
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
      const toolName = event.payload?.toolName;
      if (typeof toolName === 'string') {
        toolNames.add(toolName);
      }
    }
  });
  const result = await runner.run({
    scope,
    prompt: [
      'This is a strict smoke test. Use exactly these built-in tools, in this order:',
      '1. Use Bash to run: pwd > pwd.txt',
      '2. Use Read to read /workspace/read-edit-target.txt',
      '3. Use Edit to replace before-edit with after-edit in /workspace/read-edit-target.txt',
      '4. Use Write to create /workspace/write-target.txt with exactly this content: write-tool-ok',
      'Do not use /root paths. Do not use Bash to create or edit read-edit-target.txt or write-target.txt.',
      'After the tools finish, reply with exactly: docker-claude-smoke-ok'
    ].join('\n'),
    sandbox
  });

  if (result.failure) {
    throw new Error(result.failure);
  }

  const pwdText = await readFile(path.join(workspacePath, 'pwd.txt'), 'utf8');
  if (pwdText.trim() !== '/workspace') {
    throw new Error(`Expected Docker Claude cwd to be /workspace, got ${JSON.stringify(pwdText.trim())}.`);
  }

  const editedText = await readFile(path.join(workspacePath, 'read-edit-target.txt'), 'utf8');
  if (editedText !== 'after-edit\n') {
    throw new Error(`Expected Edit tool to update read-edit-target.txt, got ${JSON.stringify(editedText)}.`);
  }

  const writtenText = await readFile(path.join(workspacePath, 'write-target.txt'), 'utf8');
  if (writtenText.trim() !== 'write-tool-ok') {
    throw new Error(`Expected Write tool to create write-target.txt, got ${JSON.stringify(writtenText)}.`);
  }

  if (!result.providerSessionId) {
    throw new Error('Docker Claude smoke did not bind a provider session id.');
  }

  const jsonlPath = path.join(configDir, 'projects/-workspace', `${result.providerSessionId}.jsonl`);
  if (!existsSync(jsonlPath)) {
    throw new Error(`Docker Claude smoke did not persist provider session JSONL in configDir: ${jsonlPath}`);
  }

  assertEventType(eventTypes, 'provider_session_bound', toolEvents);
  assertEventType(eventTypes, 'tool_call_started', toolEvents);
  assertEventType(eventTypes, 'tool_call_completed', toolEvents);
  assertEventType(eventTypes, 'file_change_detected', toolEvents);
  assertEventType(eventTypes, 'agent_completed', toolEvents);
  assertNoEventType(eventTypes, 'tool_call_failed', toolEvents);
  assertNoHostPathLeak(toolEvents);
  for (const toolName of expectedTools) {
    if (!toolNames.has(toolName)) {
      throw new Error(`Expected Docker Claude smoke to use ${toolName}; saw tools: ${[...toolNames].join(', ')}`);
    }
  }

  const transcript = await transcriptStore.load({
    scope,
    key: {
      provider: 'claude',
      providerSessionId: result.providerSessionId
    }
  });
  if (transcript.length === 0) {
    throw new Error('Docker Claude smoke did not persist raw provider transcript entries.');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: 'claude',
        mode: 'docker',
        image,
        dockerRuntime: dockerRuntime ?? 'default',
        baseUrl: config.baseUrl,
        isDeepSeek: config.isDeepSeek,
        model: config.model ?? null,
        providerSessionId: result.providerSessionId,
        providerSessionJsonl: jsonlPath,
        transcriptEntries: transcript.length,
        workspacePwd: pwdText.trim(),
        eventTypes,
        toolNames: [...toolNames].sort()
      },
      null,
      2
    )
  );
}

function readTimeoutMs(): number {
  const raw = process.env.CLOUD_AGENT_DOCKER_CLAUDE_SMOKE_TIMEOUT_MS?.trim();
  const parsed = raw ? Number(raw) : 60_000;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
}

function assertEventType(
  events: string[],
  type: string,
  toolEvents: Array<{ payload: unknown; type: string }>
): void {
  if (!events.includes(type)) {
    throw new Error(
      [
        `Expected Docker Claude smoke event ${type}; saw events: ${events.join(', ')}`,
        `Tool events: ${JSON.stringify(toolEvents, null, 2)}`
      ].join('\n')
    );
  }
}

function assertNoEventType(
  events: string[],
  type: string,
  toolEvents: Array<{ payload: unknown; type: string }>
): void {
  if (events.includes(type)) {
    throw new Error(
      [
        `Expected Docker Claude smoke not to emit ${type}; saw events: ${events.join(', ')}`,
        `Tool events: ${JSON.stringify(toolEvents, null, 2)}`
      ].join('\n')
    );
  }
}

function assertNoHostPathLeak(toolEvents: Array<{ payload: unknown; type: string }>): void {
  const serializedEvents = JSON.stringify(toolEvents);
  if (serializedEvents.includes(smokeRoot) || serializedEvents.includes(packageRoot) || serializedEvents.includes(repoRoot)) {
    throw new Error(`Docker Claude smoke leaked a host path in tool events: ${serializedEvents}`);
  }
}
