import { randomUUID } from 'node:crypto';

import type { CodexOptions, ModelReasoningEffort, SandboxMode, ThreadEvent, ThreadOptions } from '@openai/codex-sdk';

import { buildAgentPrompt } from './agent-continuity.js';
import {
  mapCodexThreadEvent,
  readCodexEventId,
  readCodexThreadId
} from './codex-agent-adapter.js';
import { appendProviderTranscriptEntry } from './provider-transcript.js';
import { runtimeEvents } from './runtime-events.js';
import {
  buildDockerContainerName,
  buildDockerRunArgs,
  normalizeGuestWorkspaceRelativePath,
  streamDockerProcess,
  type DockerContainerRuntime,
  type DockerProcessInput,
  type DockerProcessRunner
} from './docker-agent-process.js';
import type {
  AgentAdapter,
  AgentRunInput,
  AgentRuntimeEvent,
  JsonObject,
  JsonValue,
  ProviderTranscriptStore
} from './types.js';

export const DEFAULT_CODEX_AGENT_DOCKER_IMAGE = 'agent-infra/codex-agent-runtime:local';

export interface DockerCodexAgentAdapterOptions {
  image?: string;
  apiKey?: string;
  baseUrl?: string;
  config?: CodexOptions['config'];
  env?: Record<string, string | undefined>;
  model?: string;
  modelReasoningEffort?: ModelReasoningEffort;
  sandboxMode?: SandboxMode;
  approvalPolicy?: ThreadOptions['approvalPolicy'];
  networkAccessEnabled?: boolean;
  skipGitRepoCheck?: boolean;
  timeoutMs?: number;
  hostWorkspacePath: string;
  guestWorkspacePath?: string;
  hostConfigDir: string;
  guestConfigDir?: string;
  hostCredentialsDir?: string | null;
  guestCredentialsDir?: string;
  dockerRuntime?: DockerContainerRuntime;
  docker?: DockerProcessRunner;
  transcriptStore?: ProviderTranscriptStore;
}

export class DockerCodexAgentAdapter implements AgentAdapter {
  readonly provider = 'codex';

  private readonly image: string;
  private readonly apiKey?: string;
  private readonly baseUrl?: string;
  private readonly config?: CodexOptions['config'];
  private readonly env?: Record<string, string | undefined>;
  private readonly model?: string;
  private readonly modelReasoningEffort?: ModelReasoningEffort;
  private readonly sandboxMode: SandboxMode;
  private readonly approvalPolicy: ThreadOptions['approvalPolicy'];
  private readonly networkAccessEnabled?: boolean;
  private readonly skipGitRepoCheck: boolean;
  private readonly timeoutMs?: number;
  private readonly hostWorkspacePath: string;
  private readonly guestWorkspacePath: string;
  private readonly hostConfigDir: string;
  private readonly guestConfigDir: string;
  private readonly hostCredentialsDir: string | null;
  private readonly guestCredentialsDir: string;
  private readonly dockerRuntime?: DockerContainerRuntime;
  private readonly docker?: DockerProcessRunner;
  private readonly transcriptStore?: ProviderTranscriptStore;

  constructor(options: DockerCodexAgentAdapterOptions) {
    this.image = options.image ?? DEFAULT_CODEX_AGENT_DOCKER_IMAGE;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl;
    this.config = options.config;
    this.env = options.env;
    this.model = options.model;
    this.modelReasoningEffort = options.modelReasoningEffort;
    this.sandboxMode = options.sandboxMode ?? 'workspace-write';
    this.approvalPolicy = options.approvalPolicy ?? 'never';
    this.networkAccessEnabled = options.networkAccessEnabled;
    this.skipGitRepoCheck = options.skipGitRepoCheck ?? true;
    this.timeoutMs = options.timeoutMs;
    this.hostWorkspacePath = options.hostWorkspacePath;
    this.guestWorkspacePath = options.guestWorkspacePath ?? '/workspace';
    this.hostConfigDir = options.hostConfigDir;
    this.guestConfigDir = options.guestConfigDir ?? '/agent-home';
    this.hostCredentialsDir = options.hostCredentialsDir ?? null;
    this.guestCredentialsDir = options.guestCredentialsDir ?? '/agent-credentials';
    this.dockerRuntime = options.dockerRuntime;
    this.docker = options.docker;
    this.transcriptStore = options.transcriptStore;
  }

  async *run(input: AgentRunInput): AsyncIterable<AgentRuntimeEvent> {
    const runId = input.scope.runId ?? randomUUID();
    const resumeThreadId = input.providerSession?.providerSessionId ?? null;
    yield runtimeEvents.agentStart({
      provider: this.provider,
      cwd: this.guestWorkspacePath,
      threadId: input.scope.threadId ?? null,
      runId
    });

    const dockerInput: DockerProcessInput = {
      args: this.buildDockerArgs(runId),
      stdin: `${JSON.stringify({
        apiKey: this.apiKey,
        approvalPolicy: this.approvalPolicy,
        baseUrl: this.baseUrl,
        config: this.config,
        model: this.model,
        modelReasoningEffort: this.modelReasoningEffort,
        networkAccessEnabled: this.networkAccessEnabled,
        prompt: buildAgentPrompt(input),
        resume: resumeThreadId,
        sandboxMode: this.sandboxMode,
        skipGitRepoCheck: this.skipGitRepoCheck,
        timeoutMs: this.timeoutMs,
        workingDirectory: this.guestWorkspacePath
      })}\n`,
      timeoutMs: this.timeoutMs ? this.timeoutMs + 5_000 : undefined
    };
    const state = {
      content: '',
      lastEmittedProviderSessionId: resumeThreadId,
      providerSessionId: resumeThreadId
    };

    if (this.docker) {
      const result = await this.docker(dockerInput);
      if (result.exitCode !== 0) {
        yield runtimeEvents.agentFailed({
          provider: this.provider,
          error: `Docker Codex agent failed with exit code ${result.exitCode}: ${result.stderr.trim() || result.stdout.trim()}`
        });
        return;
      }

      for (const line of result.stdout.split('\n')) {
        const processed = await this.processRunnerLine(line, input, state);
        for (const event of processed.events) {
          yield event;
        }
        if (processed.done) {
          return;
        }
      }
    } else {
      let stderr = '';
      for await (const event of streamDockerProcess(dockerInput)) {
        if (event.type === 'stderr') {
          stderr += event.chunk;
          continue;
        }

        if (event.type === 'stdout_line') {
          const processed = await this.processRunnerLine(event.line, input, state);
          for (const runtimeEvent of processed.events) {
            yield runtimeEvent;
          }
          if (processed.done) {
            return;
          }
          continue;
        }

        if (event.exitCode !== 0) {
          yield runtimeEvents.agentFailed({
            provider: this.provider,
            error: `Docker Codex agent failed with exit code ${event.exitCode}: ${stderr.trim()}`
          });
          return;
        }
      }
    }

    yield runtimeEvents.agentCompleted({
      provider: this.provider,
      content: state.content,
      providerSessionId: state.providerSessionId
    });
  }

  private buildDockerArgs(runId: string): string[] {
    return buildDockerRunArgs({
      command: ['node', '/opt/agent-runtime/codex-agent-runner.mjs'],
      containerName: buildDockerContainerName('agent-infra-codex', runId),
      env: buildContainerEnv(this.env, this.guestConfigDir),
      image: this.image,
      mounts: [
        {
          source: this.hostWorkspacePath,
          target: this.guestWorkspacePath
        },
        {
          source: this.hostConfigDir,
          target: this.guestConfigDir
        },
        ...this.buildCredentialsMounts()
      ],
      runtime: this.dockerRuntime,
      workdir: this.guestWorkspacePath
    });
  }

  private buildCredentialsMounts(): Array<{ source: string; target: string; readonly?: boolean }> {
    if (!this.hostCredentialsDir) {
      return [];
    }

    return [
      {
        source: this.hostCredentialsDir,
        target: this.guestCredentialsDir,
        readonly: true
      }
    ];
  }

  private async processRunnerLine(
    line: string,
    input: AgentRunInput,
    state: {
      content: string;
      lastEmittedProviderSessionId: string | null;
      providerSessionId: string | null;
    }
  ): Promise<{ events: AgentRuntimeEvent[]; done: boolean }> {
    if (!line.trim()) {
      return { events: [], done: false };
    }

    const event = parseRunnerEvent(line);
    if (!event) {
      return { events: [], done: false };
    }

    if (event.type === 'runner_error') {
      return {
        done: true,
        events: [
          runtimeEvents.agentFailed({
            provider: this.provider,
            error: event.error,
            providerSessionId: state.providerSessionId
          })
        ]
      };
    }

    const events: AgentRuntimeEvent[] = [];
    const threadEvent = event.event;
    state.providerSessionId = readCodexThreadId(threadEvent) ?? state.providerSessionId;
    if (state.providerSessionId && state.providerSessionId !== state.lastEmittedProviderSessionId) {
      state.lastEmittedProviderSessionId = state.providerSessionId;
      events.push(
        runtimeEvents.providerSessionBound({
          provider: this.provider,
          providerSessionId: state.providerSessionId,
          threadId: input.scope.threadId ?? null,
          workspaceId: input.scope.workspaceId
        })
      );
    }

    await this.appendTranscriptEntry(input, state.providerSessionId, threadEvent);

    for (const runtimeEvent of mapCodexThreadEvent(threadEvent, this.provider)) {
      const normalized = this.normalizeRuntimeEventWorkspacePaths(runtimeEvent);
      if (normalized.type === 'agent_message_delta') {
        state.content += readRuntimeString(normalized, 'content') ?? '';
      }
      events.push(normalized);
    }

    if (threadEvent.type === 'turn.completed') {
      events.push(
        runtimeEvents.agentCompleted({
          provider: this.provider,
          content: state.content,
          providerSessionId: state.providerSessionId
        })
      );
      return { events, done: true };
    }

    if (threadEvent.type === 'turn.failed' || threadEvent.type === 'error') {
      events.push(
        runtimeEvents.agentFailed({
          provider: this.provider,
          error: threadEvent.type === 'turn.failed' ? threadEvent.error.message : threadEvent.message,
          providerSessionId: state.providerSessionId
        })
      );
      return { events, done: true };
    }

    return { events, done: false };
  }

  private async appendTranscriptEntry(
    input: AgentRunInput,
    providerSessionId: string | null,
    event: ThreadEvent
  ): Promise<void> {
    await appendProviderTranscriptEntry({
      entryType: event.type,
      provider: this.provider,
      providerEntryId: readCodexEventId(event),
      providerSessionId,
      rawJson: event as unknown as JsonValue,
      scope: input.scope,
      transcriptStore: this.transcriptStore
    });
  }

  private normalizeRuntimeEventWorkspacePaths(event: AgentRuntimeEvent): AgentRuntimeEvent {
    if (!event.payload) {
      return event;
    }

    const payloadPatch: JsonObject = {};
    for (const key of ['filePath', 'path'] as const) {
      const value = event.payload[key];
      if (typeof value !== 'string') {
        continue;
      }

      const relativePath = normalizeGuestWorkspaceRelativePath(value, this.guestWorkspacePath);
      if (relativePath) {
        payloadPatch[key] = relativePath;
      }
    }

    return Object.keys(payloadPatch).length === 0
      ? event
      : {
          ...event,
          payload: {
            ...event.payload,
            ...payloadPatch
          }
        };
  }
}

type RunnerEvent =
  | {
      type: 'thread_event';
      event: ThreadEvent;
    }
  | {
      type: 'runner_error';
      error: string;
    };

function parseRunnerEvent(line: string): RunnerEvent | null {
  let parsed: Partial<RunnerEvent>;
  try {
    parsed = JSON.parse(line) as Partial<RunnerEvent>;
  } catch {
    return null;
  }

  if (parsed.type === 'thread_event' && parsed.event) {
    return parsed as RunnerEvent;
  }

  if (parsed.type === 'runner_error' && typeof parsed.error === 'string') {
    return parsed as RunnerEvent;
  }

  return null;
}

function buildContainerEnv(
  env: Record<string, string | undefined> | undefined,
  guestConfigDir: string
): Record<string, string> {
  return {
    ...sanitizeCodexEnv(env),
    HOME: guestConfigDir,
    CODEX_HOME: guestConfigDir,
    TMPDIR: '/tmp'
  };
}

function sanitizeCodexEnv(env: Record<string, string | undefined> | undefined): Record<string, string> {
  const denied = new Set(['HOME', 'PATH', 'TMPDIR', 'CODEX_HOME']);
  return Object.fromEntries(
    Object.entries(env ?? {}).filter(
      (entry): entry is [string, string] => Boolean(entry[1]) && !denied.has(entry[0])
    )
  );
}

function readRuntimeString(event: AgentRuntimeEvent, key: string): string | null {
  const value = event.payload?.[key];
  return typeof value === 'string' ? value : null;
}
