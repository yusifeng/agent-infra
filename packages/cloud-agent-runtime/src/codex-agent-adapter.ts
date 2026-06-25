import type {
  CodexOptions,
  ModelReasoningEffort,
  SandboxMode,
  ThreadEvent,
  ThreadOptions
} from '@openai/codex-sdk';

import type {
  AgentAdapter,
  AgentRunInput,
  AgentRuntimeEvent,
  JsonObject,
  JsonValue,
  ProviderTranscriptStore
} from './types.js';
import { buildAgentPrompt } from './agent-continuity.js';

export interface CodexThreadLike {
  readonly id: string | null;
  runStreamed(input: string): Promise<{ events: AsyncIterable<ThreadEvent> }>;
}

export interface CodexClientLike {
  startThread(options?: ThreadOptions): CodexThreadLike;
  resumeThread(id: string, options?: ThreadOptions): CodexThreadLike;
}

export interface CodexAgentAdapterOptions {
  codex?: CodexClientLike;
  apiKey?: string;
  baseUrl?: string;
  config?: CodexOptions['config'];
  env?: Record<string, string>;
  model?: string;
  modelReasoningEffort?: ModelReasoningEffort;
  sandboxMode?: SandboxMode;
  approvalPolicy?: ThreadOptions['approvalPolicy'];
  networkAccessEnabled?: boolean;
  skipGitRepoCheck?: boolean;
  workingDirectory?: string;
  timeoutMs?: number;
  transcriptStore?: ProviderTranscriptStore;
}

export class CodexAgentAdapter implements AgentAdapter {
  readonly provider = 'codex';

  private readonly codex?: CodexClientLike;
  private readonly apiKey?: string;
  private readonly baseUrl?: string;
  private readonly config?: CodexOptions['config'];
  private readonly env?: Record<string, string>;
  private readonly model?: string;
  private readonly modelReasoningEffort?: ModelReasoningEffort;
  private readonly sandboxMode: SandboxMode;
  private readonly approvalPolicy: ThreadOptions['approvalPolicy'];
  private readonly networkAccessEnabled?: boolean;
  private readonly skipGitRepoCheck: boolean;
  private readonly workingDirectory?: string;
  private readonly timeoutMs?: number;
  private readonly transcriptStore?: ProviderTranscriptStore;

  constructor(options: CodexAgentAdapterOptions = {}) {
    this.codex = options.codex;
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
    this.workingDirectory = options.workingDirectory;
    this.timeoutMs = options.timeoutMs;
    this.transcriptStore = options.transcriptStore;
  }

  async *run(input: AgentRunInput): AsyncIterable<AgentRuntimeEvent> {
    const codex =
      this.codex ??
      (await createDefaultCodexClient({
        apiKey: this.apiKey,
        baseUrl: this.baseUrl,
        config: this.config,
        env: this.env
      }));
    const workingDirectory = this.workingDirectory ?? input.sandbox.workspacePath;
    const threadOptions: ThreadOptions = {
      approvalPolicy: this.approvalPolicy,
      model: this.model,
      modelReasoningEffort: this.modelReasoningEffort,
      networkAccessEnabled: this.networkAccessEnabled,
      sandboxMode: this.sandboxMode,
      skipGitRepoCheck: this.skipGitRepoCheck,
      workingDirectory
    };
    const resumeThreadId = input.providerSession?.providerSessionId;
    const thread = resumeThreadId ? codex.resumeThread(resumeThreadId, threadOptions) : codex.startThread(threadOptions);
    const abortController = this.timeoutMs ? new AbortController() : null;
    let timedOut = false;
    const timeout = this.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          abortController?.abort();
        }, this.timeoutMs)
      : null;

    yield {
      type: 'agent_start',
      payload: {
        provider: this.provider,
        cwd: workingDirectory,
        threadId: input.scope.threadId ?? null
      }
    };

    let providerSessionId = resumeThreadId ?? thread.id;
    let lastEmittedProviderSessionId = providerSessionId;
    let content = '';

    try {
      const streamed = await thread.runStreamed(buildAgentPrompt(input));
      for await (const event of streamed.events) {
        if (abortController?.signal.aborted) {
          throw new Error(`Codex agent timed out after ${this.timeoutMs}ms`);
        }

        providerSessionId = readThreadId(event) ?? thread.id ?? providerSessionId;
        if (providerSessionId && providerSessionId !== lastEmittedProviderSessionId) {
          lastEmittedProviderSessionId = providerSessionId;
          yield {
            type: 'provider_session_bound',
            payload: {
              provider: this.provider,
              providerSessionId,
              threadId: input.scope.threadId ?? null,
              workspaceId: input.scope.workspaceId
            }
          };
        }

        await this.appendTranscriptEntry(input, providerSessionId ?? null, event);

        for (const runtimeEvent of mapCodexThreadEvent(event, this.provider)) {
          if (runtimeEvent.type === 'agent_message_delta') {
            const delta = readRuntimeString(runtimeEvent, 'content');
            content += delta ?? '';
          }
          yield runtimeEvent;
        }

        if (event.type === 'turn.completed') {
          yield {
            type: 'agent_completed',
            payload: {
              provider: this.provider,
              content,
              providerSessionId
            }
          };
          return;
        }

        if (event.type === 'turn.failed' || event.type === 'error') {
          yield {
            type: 'agent_failed',
            payload: {
              provider: this.provider,
              error: event.type === 'turn.failed' ? event.error.message : event.message,
              providerSessionId
            }
          };
          return;
        }
      }

      yield {
        type: 'agent_completed',
        payload: {
          provider: this.provider,
          content,
          providerSessionId
        }
      };
    } catch (error) {
      yield {
        type: 'agent_failed',
        payload: {
          provider: this.provider,
          error: timedOut ? `Codex agent timed out after ${this.timeoutMs}ms` : errorMessage(error),
          providerSessionId
        }
      };
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private async appendTranscriptEntry(
    input: AgentRunInput,
    providerSessionId: string | null,
    event: ThreadEvent
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
          entryType: event.type,
          providerEntryId: readCodexEventId(event),
          rawJson: event as unknown as JsonValue,
          runId: input.scope.runId ?? null
        }
      ]
    });
  }
}

function mapCodexThreadEvent(event: ThreadEvent, provider: string): AgentRuntimeEvent[] {
  if (!('item' in event)) {
    return [];
  }

  const item = event.item;
  if (item.type === 'agent_message' && event.type === 'item.completed') {
    return [
      {
        type: 'agent_message_delta',
        payload: {
          provider,
          content: item.text
        }
      }
    ];
  }

  if (item.type === 'command_execution') {
    if (event.type === 'item.started') {
      return [
        {
          type: 'tool_call_started',
          payload: {
            provider,
            toolCallId: item.id,
            toolName: 'command_execution',
            command: item.command,
            input: {
              command: item.command
            },
            inputSummary: item.command
          }
        }
      ];
    }

    if (event.type === 'item.completed') {
      return [
        {
          type: item.status === 'failed' ? 'tool_call_failed' : 'tool_call_completed',
          payload: {
            provider,
            toolCallId: item.id,
            toolName: 'command_execution',
            ...(item.status === 'failed'
              ? { error: item.aggregated_output || 'Command failed.' }
              : {
                  output: {
                    summary: item.aggregated_output
                  }
                }),
            ...(typeof item.exit_code === 'number' ? { exitCode: item.exit_code } : {}),
            resultSummary: item.aggregated_output
          }
        }
      ];
    }
  }

  if (item.type === 'mcp_tool_call') {
    const toolName = `${item.server}.${item.tool}`;
    if (event.type === 'item.started') {
      return [
        {
          type: 'tool_call_started',
          payload: {
            provider,
            toolCallId: item.id,
            toolName,
            input: isJsonObject(item.arguments) ? item.arguments : { value: stringifyUnknown(item.arguments) },
            inputSummary: toolName
          }
        }
      ];
    }

    if (event.type === 'item.completed') {
      return [
        {
          type: item.status === 'failed' ? 'tool_call_failed' : 'tool_call_completed',
          payload: {
            provider,
            toolCallId: item.id,
            toolName,
            ...(item.status === 'failed'
              ? { error: item.error?.message ?? 'MCP tool failed.' }
              : {
                  output: {
                    summary: stringifyUnknown(item.result?.structured_content ?? item.result?.content ?? null)
                  }
                }),
            resultSummary:
              item.status === 'failed'
                ? item.error?.message ?? 'MCP tool failed.'
                : stringifyUnknown(item.result?.structured_content ?? item.result?.content ?? null)
          }
        }
      ];
    }
  }

  if (item.type === 'file_change' && event.type === 'item.completed' && item.status === 'completed') {
    return item.changes.map((change) => ({
      type: 'file_change_detected',
      payload: {
        provider,
        path: change.path,
        changeType: change.kind === 'add' ? 'created' : change.kind === 'delete' ? 'deleted' : 'modified',
        toolCallId: item.id
      }
    }));
  }

  if (item.type === 'error') {
    return [
      {
        type: 'agent_failed',
        payload: {
          provider,
          error: item.message
        }
      }
    ];
  }

  return [];
}

async function createDefaultCodexClient(options: CodexAgentAdapterOptions): Promise<CodexClientLike> {
  const sdk = await import('@openai/codex-sdk');
  return new sdk.Codex({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    config: options.config,
    env: options.env
  });
}

function readThreadId(event: ThreadEvent): string | null {
  return event.type === 'thread.started' ? event.thread_id : null;
}

function readCodexEventId(event: ThreadEvent): string | null {
  if (event.type === 'thread.started') {
    return event.thread_id;
  }

  return 'item' in event ? event.item.id : null;
}

function readRuntimeString(event: AgentRuntimeEvent, key: string): string | null {
  const value = event.payload?.[key];
  return typeof value === 'string' ? value : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
