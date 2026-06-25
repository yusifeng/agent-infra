import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';

import type { Options, PermissionMode, SDKMessage, SettingSource } from '@anthropic-ai/claude-agent-sdk';

import {
  createClaudeToolEventState,
  extractClaudeToolRuntimeEvents,
  type ClaudeToolEventState
} from './claude-tool-events.js';
import { buildAgentPrompt } from './agent-continuity.js';
import type {
  AgentAdapter,
  AgentRunInput,
  AgentRuntimeEvent,
  JsonObject,
  JsonValue,
  PermissionBroker,
  PermissionDecision,
  ProviderTranscriptStore
} from './types.js';

export const DEFAULT_CLAUDE_AGENT_DOCKER_IMAGE = 'agent-infra/claude-agent-runtime:local';

export interface DockerClaudeAgentAdapterOptions {
  image?: string;
  model?: string;
  maxTurns?: number;
  timeoutMs?: number;
  thinking?: Options['thinking'];
  tools?: Options['tools'];
  allowedTools?: Options['allowedTools'];
  mcpServers?: Options['mcpServers'];
  skills?: Options['skills'];
  strictMcpConfig?: Options['strictMcpConfig'];
  includePartialMessages?: Options['includePartialMessages'];
  permissionMode?: PermissionMode;
  env?: Record<string, string | undefined>;
  settingSources?: SettingSource[];
  hostWorkspacePath: string;
  guestWorkspacePath?: string;
  hostConfigDir: string;
  guestConfigDir?: string;
  hostCredentialsDir?: string | null;
  guestCredentialsDir?: string;
  docker?: DockerProcessRunner;
  permissionBroker?: PermissionBroker;
  transcriptStore?: ProviderTranscriptStore;
}

export interface DockerProcessInput {
  args: string[];
  keepStdinOpen?: boolean;
  stdin?: string;
  timeoutMs?: number;
}

export interface DockerProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type DockerProcessRunner = (input: DockerProcessInput) => Promise<DockerProcessResult>;

export class DockerClaudeAgentAdapter implements AgentAdapter {
  readonly provider = 'claude';

  private readonly image: string;
  private readonly model?: string;
  private readonly maxTurns?: number;
  private readonly timeoutMs?: number;
  private readonly thinking?: Options['thinking'];
  private readonly tools?: Options['tools'];
  private readonly allowedTools?: Options['allowedTools'];
  private readonly mcpServers?: Options['mcpServers'];
  private readonly skills?: Options['skills'];
  private readonly strictMcpConfig?: Options['strictMcpConfig'];
  private readonly includePartialMessages?: Options['includePartialMessages'];
  private readonly permissionMode: PermissionMode;
  private readonly env?: Record<string, string | undefined>;
  private readonly hostWorkspacePath: string;
  private readonly guestWorkspacePath: string;
  private readonly hostConfigDir: string;
  private readonly guestConfigDir: string;
  private readonly hostCredentialsDir: string | null;
  private readonly guestCredentialsDir: string;
  private readonly docker?: DockerProcessRunner;
  private readonly permissionBroker?: PermissionBroker;
  private readonly transcriptStore?: ProviderTranscriptStore;

  constructor(options: DockerClaudeAgentAdapterOptions) {
    this.image = options.image ?? DEFAULT_CLAUDE_AGENT_DOCKER_IMAGE;
    this.model = options.model;
    this.maxTurns = options.maxTurns;
    this.timeoutMs = options.timeoutMs;
    this.thinking = options.thinking;
    this.tools = options.tools;
    this.allowedTools = options.allowedTools;
    this.mcpServers = options.mcpServers;
    this.skills = options.skills;
    this.strictMcpConfig = options.strictMcpConfig;
    this.includePartialMessages = options.includePartialMessages;
    this.permissionMode = options.permissionMode ?? 'acceptEdits';
    this.env = options.env;
    this.hostWorkspacePath = options.hostWorkspacePath;
    this.guestWorkspacePath = options.guestWorkspacePath ?? '/workspace';
    this.hostConfigDir = options.hostConfigDir;
    this.guestConfigDir = options.guestConfigDir ?? '/agent-home';
    this.hostCredentialsDir = options.hostCredentialsDir ?? null;
    this.guestCredentialsDir = options.guestCredentialsDir ?? '/agent-credentials';
    this.docker = options.docker;
    this.permissionBroker = options.permissionBroker;
    this.transcriptStore = options.transcriptStore;
  }

  async *run(input: AgentRunInput): AsyncIterable<AgentRuntimeEvent> {
    const runId = input.scope.runId ?? randomUUID();
    const resumeSessionId = input.providerSession?.providerSessionId;
    yield {
      type: 'agent_start',
      payload: {
        provider: this.provider,
        cwd: this.guestWorkspacePath,
        threadId: input.scope.threadId ?? null,
        runId
      }
    };

    const permissionBridge = Boolean(this.permissionBroker);
    const dockerInput: DockerProcessInput = {
      args: this.buildDockerArgs(runId),
      keepStdinOpen: permissionBridge,
      stdin: `${JSON.stringify({
        allowedTools: this.allowedTools,
        cwd: this.guestWorkspacePath,
        includePartialMessages: this.includePartialMessages,
        maxTurns: this.maxTurns,
        mcpServers: this.mcpServers,
        model: this.model,
        permissionBridge,
        permissionMode: this.permissionMode,
        prompt: buildAgentPrompt(input),
        resume: resumeSessionId,
        skills: this.skills,
        strictMcpConfig: this.strictMcpConfig,
        thinking: this.thinking,
        timeoutMs: this.timeoutMs,
        tools: this.tools
      })}\n`,
      timeoutMs: this.timeoutMs ? this.timeoutMs + 5_000 : undefined
    };

    let resultText = '';
    let providerSessionId: string | null = input.providerSession?.providerSessionId ?? null;
    const state = {
      lastEmittedProviderSessionId: providerSessionId,
      providerSessionId,
      resultText,
      sawPartialText: false,
      toolEvents: createClaudeToolEventState()
    };

    if (this.docker) {
      const result = await this.docker(dockerInput);

      if (result.exitCode !== 0) {
        yield {
          type: 'agent_failed',
          payload: {
            provider: this.provider,
            error: `Docker Claude agent failed with exit code ${result.exitCode}: ${result.stderr.trim() || result.stdout.trim()}`
          }
        };
        return;
      }

      for (const line of result.stdout.split('\n')) {
        const permission = parseRunnerPermissionRequest(line);
        if (permission) {
          const resolved = await this.resolveRunnerPermission(permission, input);
          yield resolved.requestEvent;
          yield resolved.resolvedEvent;
          continue;
        }

        const processed = await this.processRunnerLine(line, input, state);
        for (const event of processed.events) {
          yield event;
        }
        if (processed.failed) {
          return;
        }
      }
    } else {
      let stderr = '';
      for await (const event of streamDockerProcess(dockerInput)) {
        if (event.type === 'stderr') {
          stderr += event.chunk;
        }

        if (event.type === 'stdout_line') {
          const permission = parseRunnerPermissionRequest(event.line);
          if (permission) {
            const resolved = await this.resolveRunnerPermission(permission, input);
            yield resolved.requestEvent;
            event.writeStdin?.(`${JSON.stringify(resolved.decisionMessage)}\n`);
            yield resolved.resolvedEvent;
            continue;
          }

          const processed = await this.processRunnerLine(event.line, input, state);
          for (const runtimeEvent of processed.events) {
            yield runtimeEvent;
          }
          if (processed.failed) {
            return;
          }
        }

        if (event.type === 'exit' && event.exitCode !== 0) {
          yield {
            type: 'agent_failed',
            payload: {
              provider: this.provider,
              error: `Docker Claude agent failed with exit code ${event.exitCode}: ${stderr.trim()}`
            }
          };
          return;
        }
      }
    }

    yield {
      type: 'agent_completed',
      payload: {
        provider: this.provider,
        content: state.resultText.trim(),
        providerSessionId: state.providerSessionId
      }
    };
  }

  private async resolveRunnerPermission(
    event: RunnerPermissionRequestedEvent,
    input: AgentRunInput
  ): Promise<{
    decisionMessage: RunnerApprovalDecisionMessage;
    requestEvent: AgentRuntimeEvent;
    resolvedEvent: AgentRuntimeEvent;
  }> {
    const requestEvent: AgentRuntimeEvent = {
      type: 'permission_requested',
      payload: {
        provider: this.provider,
        permissionRequestId: event.permissionRequestId,
        action: event.toolName,
        details: event.details ?? {
          input: event.input ?? {},
          toolName: event.toolName
        }
      }
    };
    const decision =
      this.permissionBroker
        ? await this.permissionBroker.resolve({
            scope: input.scope,
            provider: this.provider,
            permissionRequestId: event.permissionRequestId,
            toolName: event.toolName,
            input: event.input ?? {},
            title: readOptionalString(event.details, 'title'),
            displayName: readOptionalString(event.details, 'displayName'),
            description: readOptionalString(event.details, 'description'),
            blockedPath: readOptionalString(event.details, 'blockedPath'),
            decisionReason: readOptionalString(event.details, 'decisionReason'),
            suggestions: event.details?.suggestions ?? null,
            agentId: readOptionalString(event.details, 'agentId')
          })
        : ({
            decision: 'denied',
            reason: 'No Docker permission broker is configured.',
            resolvedByActorId: 'docker-claude-agent-adapter'
          } satisfies PermissionDecision);
    const decisionMessage: RunnerApprovalDecisionMessage = {
      type: 'approval_decision',
      permissionRequestId: event.permissionRequestId,
      decision: decision.decision,
      reason: decision.reason ?? null,
      interrupt: decision.interrupt ?? false,
      updatedInput: decision.updatedInput ?? null,
      updatedPermissions: decision.updatedPermissions ?? null,
      resolvedByActorId: decision.resolvedByActorId ?? null,
      classification: decision.classification ?? null
    };

    return {
      decisionMessage,
      requestEvent,
      resolvedEvent: {
        type: 'approval_resolved',
        payload: {
          provider: this.provider,
          permissionRequestId: event.permissionRequestId,
          decision: decision.decision,
          status: decision.approvalStatus ?? decision.decision,
          reason: decision.reason ?? null,
          resolvedByActorId: decision.resolvedByActorId ?? null
        }
      }
    };
  }

  private buildDockerArgs(runId: string): string[] {
    return [
      'run',
      '--rm',
      '-i',
      '--name',
      `agent-infra-claude-${safeContainerSegment(runId)}`,
      '--workdir',
      this.guestWorkspacePath,
      '--mount',
      `type=bind,source=${path.resolve(this.hostWorkspacePath)},target=${this.guestWorkspacePath}`,
      '--mount',
      `type=bind,source=${path.resolve(this.hostConfigDir)},target=${this.guestConfigDir}`,
      ...this.buildCredentialsMountArgs(),
      ...buildContainerEnvArgs(this.env, this.guestConfigDir),
      this.image,
      'node',
      '/opt/agent-runtime/claude-agent-runner.mjs'
    ];
  }

  private buildCredentialsMountArgs(): string[] {
    if (!this.hostCredentialsDir) {
      return [];
    }

    return [
      '--mount',
      `type=bind,source=${path.resolve(this.hostCredentialsDir)},target=${this.guestCredentialsDir},readonly`
    ];
  }

  private async processRunnerLine(
    line: string,
    input: AgentRunInput,
    state: {
      lastEmittedProviderSessionId: string | null;
      providerSessionId: string | null;
      resultText: string;
      sawPartialText: boolean;
      toolEvents: ClaudeToolEventState;
    }
  ): Promise<{ events: AgentRuntimeEvent[]; failed: boolean }> {
    if (!line.trim()) {
      return { events: [], failed: false };
    }

    const event = parseRunnerEvent(line);
    if (!event) {
      return { events: [], failed: false };
    }

    if (event.type === 'runner_error') {
      return {
        events: [
          {
            type: 'agent_failed',
            payload: {
              provider: this.provider,
              error: event.error,
              providerSessionId: state.providerSessionId
            }
          }
        ],
        failed: true
      };
    }

    const events: AgentRuntimeEvent[] = [];
    const message = event.message;
    state.providerSessionId = extractSessionId(message) ?? state.providerSessionId;
    if (state.providerSessionId && state.providerSessionId !== state.lastEmittedProviderSessionId) {
      state.lastEmittedProviderSessionId = state.providerSessionId;
      events.push({
        type: 'provider_session_bound',
        payload: {
          provider: this.provider,
          providerSessionId: state.providerSessionId
        }
      });
    }
    await this.appendTranscriptEntry(input, state.providerSessionId ?? null, message);
    const providerError = extractProviderError(message);
    if (providerError) {
      events.push({
        type: 'agent_failed',
        payload: {
          provider: this.provider,
          error: providerError,
          providerSessionId: state.providerSessionId
        }
      });
      return { events, failed: true };
    }

    for (const toolEvent of extractClaudeToolRuntimeEvents(message, this.provider, state.toolEvents)) {
      events.push(toolEvent);
    }

    const partialText = extractPartialAssistantText(message);
    if (partialText) {
      state.sawPartialText = true;
    }
    const delta = partialText ?? (state.sawPartialText ? null : extractAssistantText(message));
    if (delta) {
      state.resultText += delta;
      events.push({
        type: 'agent_message_delta',
        payload: {
          provider: this.provider,
          content: delta
        }
      });
    }

    if (message.type === 'result') {
      if (message.subtype === 'success') {
        state.resultText = message.result || state.resultText;
      } else {
        events.push({
          type: 'agent_failed',
          payload: {
            provider: this.provider,
            error: message.errors.join('\n'),
            providerSessionId: state.providerSessionId
          }
        });
        return { events, failed: true };
      }
    }

    return { events, failed: false };
  }

  private async appendTranscriptEntry(
    input: AgentRunInput,
    providerSessionId: string | null,
    message: SDKMessage
  ): Promise<void> {
    if (!this.transcriptStore || !providerSessionId) {
      return;
    }

    await this.transcriptStore.append({
      scope: input.scope,
      key: {
        provider: this.provider,
        providerSessionId
      },
      entries: [
        {
          entryType: message.type,
          providerEntryId: extractProviderEntryId(message),
          rawJson: message as unknown as JsonValue,
          runId: input.scope.runId ?? null
        }
      ]
    });
  }
}

type RunnerEvent =
  | {
      type: 'sdk_message';
      message: SDKMessage;
    }
  | {
      type: 'runner_error';
      error: string;
    };

interface RunnerPermissionRequestedEvent {
  type: 'permission_requested';
  permissionRequestId: string;
  toolName: string;
  input?: JsonObject | null;
  details?: JsonObject | null;
}

interface RunnerApprovalDecisionMessage {
  type: 'approval_decision';
  permissionRequestId: string;
  decision: PermissionDecision['decision'];
  reason?: string | null;
  interrupt?: boolean;
  updatedInput?: JsonObject | null;
  updatedPermissions?: JsonValue | null;
  resolvedByActorId?: string | null;
  classification?: PermissionDecision['classification'];
}

function parseRunnerEvent(line: string): RunnerEvent | null {
  let parsed: Partial<RunnerEvent>;
  try {
    parsed = JSON.parse(line) as Partial<RunnerEvent>;
  } catch {
    return null;
  }
  if (parsed.type === 'sdk_message' && parsed.message) {
    return parsed as RunnerEvent;
  }

  if (parsed.type === 'runner_error' && typeof parsed.error === 'string') {
    return parsed as RunnerEvent;
  }

  return null;
}

function parseRunnerPermissionRequest(line: string): RunnerPermissionRequestedEvent | null {
  let parsed: Partial<RunnerPermissionRequestedEvent>;
  try {
    parsed = JSON.parse(line) as Partial<RunnerPermissionRequestedEvent>;
  } catch {
    return null;
  }

  return parsed.type === 'permission_requested' &&
    typeof parsed.permissionRequestId === 'string' &&
    typeof parsed.toolName === 'string'
    ? {
        type: 'permission_requested',
        permissionRequestId: parsed.permissionRequestId,
        toolName: parsed.toolName,
        input: toJsonObject(parsed.input),
        details: toJsonObject(parsed.details)
      }
    : null;
}

type DockerStreamEvent =
  | {
      type: 'stdout_line';
      line: string;
      writeStdin?: (line: string) => void;
    }
  | {
      type: 'stderr';
      chunk: string;
    }
  | {
      type: 'exit';
      exitCode: number;
    };

function buildContainerEnvArgs(env: Record<string, string | undefined> | undefined, guestConfigDir: string): string[] {
  return Object.entries({
    ...sanitizeClaudeEnv(env),
    HOME: guestConfigDir,
    CLAUDE_CONFIG_DIR: guestConfigDir,
    TMPDIR: '/tmp'
  }).flatMap(([name, value]) => ['--env', `${name}=${value}`]);
}

function sanitizeClaudeEnv(env: Record<string, string | undefined> | undefined): Record<string, string> {
  const denied = new Set(['HOME', 'PATH', 'TMPDIR', 'CLAUDE_CONFIG_DIR', 'CLAUDE_SECURESTORAGE_CONFIG_DIR']);
  return Object.fromEntries(
    Object.entries(env ?? {}).filter(
      (entry): entry is [string, string] => Boolean(entry[1]) && !denied.has(entry[0])
    )
  );
}

function runDockerProcess(input: DockerProcessInput): Promise<DockerProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', input.args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timeout: NodeJS.Timeout | null = null;

    if (typeof input.timeoutMs === 'number') {
      timeout = setTimeout(() => {
        child.kill('SIGKILL');
      }, input.timeoutMs);
    }

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    child.on('error', reject);
    child.on('close', (exitCode) => {
      if (timeout) {
        clearTimeout(timeout);
      }

      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        exitCode: exitCode ?? 1
      });
    });

    if (input.stdin) {
      child.stdin.write(input.stdin);
    }
    child.stdin.end();
  });
}

async function* streamDockerProcess(input: DockerProcessInput): AsyncIterable<DockerStreamEvent> {
  const child = spawn('docker', input.args, {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  let timeout: NodeJS.Timeout | null = null;
  let stdoutBuffer = '';
  const stderrChunks: Buffer[] = [];

  if (typeof input.timeoutMs === 'number') {
    timeout = setTimeout(() => {
      child.kill('SIGKILL');
    }, input.timeoutMs);
  }

  const closePromise = new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (exitCode) => resolve(exitCode ?? 1));
  });

  const stderrPromise = (async () => {
    for await (const chunk of child.stderr) {
      const buffer = Buffer.from(chunk);
      stderrChunks.push(buffer);
    }
  })();

  if (input.stdin) {
    child.stdin.write(input.stdin);
  }
  if (!input.keepStdinOpen) {
    child.stdin.end();
  }

  for await (const chunk of child.stdout) {
    stdoutBuffer += Buffer.from(chunk).toString('utf8');
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() ?? '';

    for (const line of lines) {
      yield {
        type: 'stdout_line',
        line,
        writeStdin(lineToWrite) {
          child.stdin.write(lineToWrite);
        }
      };
    }
  }

  if (stdoutBuffer.trim()) {
    yield {
      type: 'stdout_line',
      line: stdoutBuffer,
      writeStdin(lineToWrite) {
        child.stdin.write(lineToWrite);
      }
    };
  }

  if (input.keepStdinOpen) {
    child.stdin.end();
  }

  const exitCode = await closePromise;
  await stderrPromise;
  if (timeout) {
    clearTimeout(timeout);
  }

  const stderr = Buffer.concat(stderrChunks).toString('utf8');
  if (stderr) {
    yield {
      type: 'stderr',
      chunk: stderr
    };
  }

  yield {
    type: 'exit',
    exitCode
  };
}

function safeContainerSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 48);
}

function extractSessionId(message: SDKMessage): string | null {
  return 'session_id' in message && typeof message.session_id === 'string' ? message.session_id : null;
}

function extractProviderEntryId(message: SDKMessage): string | null {
  if ('uuid' in message && typeof message.uuid === 'string') {
    return message.uuid;
  }

  if ('message' in message && isJsonObject(message.message) && typeof message.message.id === 'string') {
    return message.message.id;
  }

  return null;
}

function extractAssistantText(message: SDKMessage): string | null {
  if (message.type !== 'assistant') {
    return null;
  }

  return extractContentText(message.message.content);
}

function extractPartialAssistantText(message: SDKMessage): string | null {
  if (message.type !== 'stream_event' || !isJsonObject(message.event)) {
    return null;
  }

  if (message.event.type !== 'content_block_delta' || !isJsonObject(message.event.delta)) {
    return null;
  }

  return message.event.delta.type === 'text_delta' && typeof message.event.delta.text === 'string'
    ? message.event.delta.text
    : null;
}

function extractProviderError(message: SDKMessage): string | null {
  if (message.type !== 'system' || !isJsonObject(message)) {
    return null;
  }

  if (message.subtype !== 'api_retry') {
    return null;
  }

  const errorStatus = message.error_status;
  const error = typeof message.error === 'string' ? message.error : 'provider API error';
  if (errorStatus === 401 || error === 'authentication_failed') {
    return 'Claude provider authentication failed. Check ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN.';
  }

  return null;
}

function extractContentText(content: unknown): string | null {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const text = content
    .map((block) => {
      if (!isJsonObject(block)) {
        return '';
      }

      return block.type === 'text' && typeof block.text === 'string' ? block.text : '';
    })
    .filter(Boolean)
    .join('');

  return text || null;
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toJsonObject(value: unknown): JsonObject {
  if (!isJsonObject(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toJsonValue(entry)])) as JsonObject;
}

function toJsonValue(value: unknown): JsonValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, toJsonValue(entry)])
    ) as JsonObject;
  }

  return String(value);
}

function readOptionalString(value: JsonObject | null | undefined, key: string): string | null {
  const entry = value?.[key];
  return typeof entry === 'string' ? entry : null;
}
