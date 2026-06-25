import type {
  CanUseTool,
  Options,
  PermissionDecisionClassification,
  PermissionMode,
  PermissionResult,
  PermissionUpdate,
  Query,
  SDKMessage,
  SettingSource
} from '@anthropic-ai/claude-agent-sdk';

import {
  createClaudeToolEventState,
  extractClaudeToolRuntimeEvents
} from './claude-tool-events.js';
import { buildAgentPrompt } from './agent-continuity.js';
import { appendProviderTranscriptEntry } from './provider-transcript.js';
import { runtimeEvents } from './runtime-events.js';
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

export type ClaudeQueryFunction = (params: { prompt: string; options?: Options }) => Query | AsyncIterable<SDKMessage>;

export interface ClaudeAgentAdapterOptions {
  query?: ClaudeQueryFunction;
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
  cwd?: string;
  env?: Record<string, string | undefined>;
  settingSources?: SettingSource[];
  transcriptStore?: ProviderTranscriptStore;
  permissionBroker?: PermissionBroker;
}

export class ClaudeAgentAdapter implements AgentAdapter {
  readonly provider = 'claude';

  private readonly query?: ClaudeQueryFunction;
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
  private readonly cwd?: string;
  private readonly env?: Record<string, string | undefined>;
  private readonly settingSources?: SettingSource[];
  private readonly transcriptStore?: ProviderTranscriptStore;
  private readonly permissionBroker?: PermissionBroker;

  constructor(options: ClaudeAgentAdapterOptions = {}) {
    this.query = options.query;
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
    this.cwd = options.cwd;
    this.env = options.env;
    this.settingSources = options.settingSources;
    this.transcriptStore = options.transcriptStore;
    this.permissionBroker = options.permissionBroker;
  }

  async *run(input: AgentRunInput): AsyncIterable<AgentRuntimeEvent> {
    const query = this.query ?? (await loadDefaultQuery());
    const cwd = this.cwd ?? input.sandbox.workspacePath;
    const resumeSessionId = input.providerSession?.providerSessionId;
    const abortController = this.timeoutMs ? new AbortController() : undefined;
    let timedOut = false;
    const timeout = this.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          abortController?.abort(`Claude agent timed out after ${this.timeoutMs}ms`);
        }, this.timeoutMs)
      : undefined;
    const permissionEvents = new RuntimeEventSignalQueue();
    const canUseTool = this.permissionBroker
      ? createCanUseTool({
          broker: this.permissionBroker,
          eventQueue: permissionEvents,
          input,
          provider: this.provider
        })
      : undefined;
    const options: Options = {
      abortController,
      allowedTools: this.allowedTools,
      canUseTool,
      cwd,
      env: this.env,
      includePartialMessages: this.includePartialMessages,
      maxTurns: this.maxTurns,
      mcpServers: this.mcpServers,
      model: this.model,
      permissionMode: this.permissionMode,
      resume: resumeSessionId,
      settingSources: this.settingSources ?? [],
      skills: this.skills,
      strictMcpConfig: this.strictMcpConfig,
      thinking: this.thinking,
      tools: this.tools
    };

    yield runtimeEvents.agentStart({
      provider: this.provider,
      cwd,
      threadId: input.scope.threadId ?? null
    });

    let resultText = '';
    let sawPartialText = false;
    let providerSessionId: string | null = input.providerSession?.providerSessionId ?? null;
    let lastEmittedProviderSessionId = providerSessionId;
    const toolEventState = createClaudeToolEventState();

    try {
      const claudeQuery = query({ prompt: buildAgentPrompt(input), options });
      const iterator = claudeQuery[Symbol.asyncIterator]();
      let nextMessage = iterator.next();
      while (true) {
        for (const event of permissionEvents.drain()) {
          yield event;
        }

        const next = await Promise.race([
          nextMessage.then((result) => ({ kind: 'message' as const, result })),
          permissionEvents.waitForEvent().then(() => ({ kind: 'permission' as const }))
        ]);
        if (next.kind === 'permission') {
          continue;
        }

        for (const event of permissionEvents.drain()) {
          yield event;
        }
        if (next.result.done) {
          break;
        }

        const message = next.result.value;
        providerSessionId = extractSessionId(message) ?? providerSessionId;
        if (providerSessionId && providerSessionId !== lastEmittedProviderSessionId) {
          lastEmittedProviderSessionId = providerSessionId;
          yield runtimeEvents.providerSessionBound({
            provider: this.provider,
            providerSessionId,
            threadId: input.scope.threadId ?? null,
            workspaceId: input.scope.workspaceId
          });
        }
        await this.appendTranscriptEntry(input, providerSessionId, message);

        const providerError = extractProviderError(message);
        if (providerError) {
          closeQuery(claudeQuery);
          yield runtimeEvents.agentFailed({
            provider: this.provider,
            error: providerError,
            providerSessionId
          });
          return;
        }

        for (const toolEvent of extractClaudeToolRuntimeEvents(message, this.provider, toolEventState)) {
          yield toolEvent;
        }

        const partialText = extractPartialAssistantText(message);
        if (partialText) {
          sawPartialText = true;
        }
        const delta = partialText ?? (sawPartialText ? null : extractAssistantText(message));
        if (delta) {
          resultText += delta;
          yield runtimeEvents.agentMessageDelta(this.provider, delta);
        }

        if (message.type === 'result') {
          if (message.subtype === 'success') {
            resultText = message.result || resultText;
          } else {
            const errorMessage = message.errors.join('\n');
            yield runtimeEvents.agentFailed({
              provider: this.provider,
              error: errorMessage,
              providerSessionId
            });
            return;
          }
        }

        nextMessage = iterator.next();
      }

      for (const event of permissionEvents.drain()) {
        yield event;
      }
      yield runtimeEvents.agentCompleted({
        provider: this.provider,
        content: resultText.trim(),
        providerSessionId
      });
    } catch (error) {
      for (const event of permissionEvents.drain()) {
        yield event;
      }
      yield runtimeEvents.agentFailed({
        provider: this.provider,
        error: timedOut ? `Claude agent timed out after ${this.timeoutMs}ms` : errorMessage(error),
        providerSessionId
      });
    } finally {
      permissionEvents.close();
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private async appendTranscriptEntry(
    input: AgentRunInput,
    providerSessionId: string | null,
    message: SDKMessage
  ): Promise<void> {
    await appendProviderTranscriptEntry({
      entryType: message.type,
      provider: this.provider,
      providerEntryId: extractProviderEntryId(message),
      providerSessionId,
      rawJson: message as unknown as JsonValue,
      scope: input.scope,
      transcriptStore: this.transcriptStore
    });
  }
}

interface CreateCanUseToolInput {
  broker: PermissionBroker;
  eventQueue: RuntimeEventSignalQueue;
  input: AgentRunInput;
  provider: string;
}

function createCanUseTool({ broker, eventQueue, input, provider }: CreateCanUseToolInput): CanUseTool {
  return async (toolName, toolInput, options) => {
    const permissionRequestId = options.toolUseID;
    const requestInput = toJsonObject(toolInput);
    eventQueue.push(
      runtimeEvents.permissionRequested({
        provider,
        permissionRequestId,
        action: toolName,
        details: {
          agentId: options.agentID ?? null,
          blockedPath: options.blockedPath ?? null,
          decisionReason: options.decisionReason ?? null,
          description: options.description ?? null,
          displayName: options.displayName ?? null,
          input: requestInput,
          suggestions: toJsonValue(options.suggestions ?? null),
          title: options.title ?? null,
          toolName
        }
      })
    );

    const decision = await broker.resolve({
      scope: input.scope,
      provider,
      permissionRequestId,
      toolName,
      input: requestInput,
      title: options.title ?? null,
      displayName: options.displayName ?? null,
      description: options.description ?? null,
      blockedPath: options.blockedPath ?? null,
      decisionReason: options.decisionReason ?? null,
      suggestions: toJsonValue(options.suggestions ?? null),
      agentId: options.agentID ?? null
    });

    eventQueue.push(
      runtimeEvents.approvalResolved({
        provider,
        permissionRequestId,
        decision: decision.decision,
        status: decision.approvalStatus ?? decision.decision,
        reason: decision.reason ?? null,
        resolvedByActorId: decision.resolvedByActorId ?? null
      })
    );

    return toClaudePermissionResult(permissionRequestId, decision);
  };
}

function toClaudePermissionResult(permissionRequestId: string, decision: PermissionDecision): PermissionResult {
  const decisionClassification = toClaudeDecisionClassification(decision.classification);
  if (decision.decision === 'denied') {
    return {
      behavior: 'deny',
      message: decision.reason ?? 'Permission denied.',
      interrupt: decision.interrupt,
      toolUseID: permissionRequestId,
      decisionClassification
    };
  }

  return {
    behavior: 'allow',
    updatedInput: decision.updatedInput ? decision.updatedInput : undefined,
    updatedPermissions: Array.isArray(decision.updatedPermissions)
      ? (decision.updatedPermissions as unknown as PermissionUpdate[])
      : undefined,
    toolUseID: permissionRequestId,
    decisionClassification
  };
}

function toClaudeDecisionClassification(
  classification: PermissionDecision['classification'] | undefined
): PermissionDecisionClassification | undefined {
  return classification === 'user_temporary' || classification === 'user_permanent' || classification === 'user_reject'
    ? classification
    : undefined;
}

class RuntimeEventSignalQueue {
  private readonly events: AgentRuntimeEvent[] = [];
  private pendingSignal: Promise<void> | null = null;
  private resolvePendingSignal: (() => void) | null = null;
  private closed = false;

  push(event: AgentRuntimeEvent): void {
    if (this.closed) {
      return;
    }

    this.events.push(event);
    this.signal();
  }

  drain(): AgentRuntimeEvent[] {
    return this.events.splice(0);
  }

  waitForEvent(): Promise<void> {
    if (this.events.length > 0 || this.closed) {
      return Promise.resolve();
    }

    this.pendingSignal ??= new Promise<void>((resolve) => {
      this.resolvePendingSignal = resolve;
    });
    return this.pendingSignal;
  }

  close(): void {
    this.closed = true;
    this.signal();
  }

  private signal(): void {
    const resolve = this.resolvePendingSignal;
    this.resolvePendingSignal = null;
    this.pendingSignal = null;
    resolve?.();
  }
}

async function loadDefaultQuery(): Promise<ClaudeQueryFunction> {
  const sdk = await import('@anthropic-ai/claude-agent-sdk');
  return sdk.query;
}

function closeQuery(queryResult: Query | AsyncIterable<SDKMessage>): void {
  if ('close' in queryResult && typeof queryResult.close === 'function') {
    queryResult.close();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function toJsonObject(value: Record<string, unknown>): JsonObject {
  const json = toJsonValue(value);
  return isJsonObject(json) ? json : {};
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null) {
    return null;
  }

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      return Number.isFinite(value) ? value : null;
    case 'object':
      if (Array.isArray(value)) {
        return value.map(toJsonValue);
      }

      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, toJsonValue(child)])
      );
    default:
      return null;
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
