import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import type { AgentRuntimeEvent, JsonObject } from './types.js';

export interface ClaudeToolEventState {
  calls: Map<string, ToolCallContext>;
  completed: Set<string>;
  started: Set<string>;
}

interface ToolCallStart {
  input: unknown;
  toolCallId: string;
  toolName: string;
}

interface ToolCallResult {
  isError: boolean;
  result: unknown;
  toolCallId: string;
}

interface ToolCallContext {
  filePath: string | null;
  toolName: string;
}

export function createClaudeToolEventState(): ClaudeToolEventState {
  return {
    calls: new Map(),
    completed: new Set(),
    started: new Set()
  };
}

export function extractClaudeToolRuntimeEvents(
  message: SDKMessage,
  provider: string,
  state: ClaudeToolEventState
): AgentRuntimeEvent[] {
  const events: AgentRuntimeEvent[] = [];

  for (const call of extractToolCallStarts(message)) {
    if (state.started.has(call.toolCallId)) {
      continue;
    }

    state.started.add(call.toolCallId);
    state.calls.set(call.toolCallId, {
      filePath: extractToolFilePath(call.input),
      toolName: call.toolName
    });
    events.push({
      type: 'tool_call_started',
      payload: {
        provider,
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        input: normalizeToolInput(call.input),
        inputSummary: summarizeToolInput(call.toolName, call.input),
        ...extractCommonToolInputFields(call.input)
      }
    });
  }

  for (const result of extractToolCallResults(message)) {
    if (state.completed.has(result.toolCallId)) {
      continue;
    }

    state.completed.add(result.toolCallId);
    const context = state.calls.get(result.toolCallId);
    const resultSummary = summarizeToolResult(result.result);
    events.push({
      type: result.isError ? 'tool_call_failed' : 'tool_call_completed',
      payload: {
        provider,
        toolCallId: result.toolCallId,
        ...(context?.toolName ? { toolName: context.toolName } : {}),
        ...(context?.filePath ? { filePath: context.filePath } : {}),
        ...(result.isError
          ? { error: resultSummary }
          : { output: normalizeToolResult(result.result) }),
        resultSummary
      }
    });

    if (!result.isError && context?.filePath && isFileWritingTool(context.toolName)) {
      events.push({
        type: 'file_change_detected',
        payload: {
          provider,
          toolCallId: result.toolCallId,
          path: context.filePath,
          changeType: 'modified'
        }
      });
    }
  }

  if (message.type === 'system' && message.subtype === 'permission_denied') {
    events.push({
      type: 'tool_call_failed',
      payload: {
        provider,
        toolCallId: message.tool_use_id,
        toolName: message.tool_name,
        resultSummary: message.message
      }
    });
  }

  if (message.type === 'tool_progress' && !state.started.has(message.tool_use_id)) {
    state.started.add(message.tool_use_id);
    events.push({
      type: 'tool_call_started',
      payload: {
        provider,
        toolCallId: message.tool_use_id,
        toolName: message.tool_name,
        inputSummary: `${message.tool_name} running`
      }
    });
  }

  return events;
}

function extractToolCallStarts(message: SDKMessage): ToolCallStart[] {
  if (message.type === 'assistant') {
    return extractToolUseBlocks(message.message.content);
  }

  if (message.type === 'stream_event' && isJsonObject(message.event)) {
    const event = message.event;
    if (event.type === 'content_block_start' && isJsonObject(event.content_block)) {
      return extractToolUseBlocks([event.content_block]);
    }
  }

  return [];
}

function extractToolCallResults(message: SDKMessage): ToolCallResult[] {
  if (message.type !== 'user') {
    return [];
  }

  const results = extractToolResultBlocks(message.message.content);
  if (results.length > 0) {
    return results;
  }

  if (message.parent_tool_use_id && message.tool_use_result !== undefined) {
    return [
      {
        isError: false,
        result: message.tool_use_result,
        toolCallId: message.parent_tool_use_id
      }
    ];
  }

  return [];
}

function extractToolUseBlocks(content: unknown): ToolCallStart[] {
  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap((block) => {
    if (!isJsonObject(block) || block.type !== 'tool_use') {
      return [];
    }

    const id = typeof block.id === 'string' ? block.id : null;
    const name = typeof block.name === 'string' ? block.name : null;
    if (!id || !name) {
      return [];
    }

    return [
      {
        input: block.input,
        toolCallId: id,
        toolName: name
      }
    ];
  });
}

function extractToolResultBlocks(content: unknown): ToolCallResult[] {
  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap((block) => {
    if (!isJsonObject(block) || block.type !== 'tool_result') {
      return [];
    }

    const id = typeof block.tool_use_id === 'string' ? block.tool_use_id : null;
    if (!id) {
      return [];
    }

    return [
      {
        isError: block.is_error === true,
        result: block.content,
        toolCallId: id
      }
    ];
  });
}

function extractCommonToolInputFields(input: unknown): JsonObject {
  if (!isJsonObject(input)) {
    return {};
  }

  const filePath = firstString(input.file_path, input.path);
  const command = firstString(input.command);

  return {
    ...(filePath ? { filePath } : {}),
    ...(command ? { command: truncate(command, 160) } : {})
  };
}

function extractToolFilePath(input: unknown): string | null {
  if (!isJsonObject(input)) {
    return null;
  }

  return firstString(input.file_path, input.path);
}

function isFileWritingTool(toolName: string): boolean {
  return toolName === 'Write' || toolName === 'Edit';
}

function normalizeToolInput(input: unknown): JsonObject {
  if (isJsonObject(input)) {
    return input;
  }

  if (input === undefined || input === null) {
    return {};
  }

  return {
    value: stringifyUnknown(input)
  };
}

function normalizeToolResult(result: unknown): JsonObject {
  return {
    summary: summarizeToolResult(result),
    value: stringifyUnknown(result)
  };
}

function summarizeToolInput(toolName: string, input: unknown): string {
  if (!isJsonObject(input)) {
    return toolName;
  }

  const filePath = firstString(input.file_path, input.path);
  if (filePath) {
    return `${toolName} ${filePath}`;
  }

  const command = firstString(input.command);
  if (command) {
    return `${toolName} ${truncate(command, 160)}`;
  }

  return `${toolName} ${truncate(JSON.stringify(input), 180)}`;
}

function summarizeToolResult(result: unknown): string {
  if (typeof result === 'string') {
    return truncate(result.trim(), 220);
  }

  if (Array.isArray(result)) {
    const text = result
      .map((item) => {
        if (!isJsonObject(item)) {
          return '';
        }

        return item.type === 'text' && typeof item.text === 'string' ? item.text : '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
    return text ? truncate(text, 220) : 'Tool completed';
  }

  if (result === undefined || result === null) {
    return 'Tool completed';
  }

  return truncate(JSON.stringify(result), 220);
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

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
