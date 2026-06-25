import { randomUUID } from 'node:crypto';

import type { AgentRuntimeEvent } from '@agent-infra/cloud-agent-runtime';
import type { ToolInvocationStatus } from '@agent-infra/core';

import { withCloudAgentTransaction } from './db';

interface PendingToolInvocation {
  toolCallId: string;
  toolName: string;
  status: ToolInvocationStatus;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface ToolInvocationAccumulator {
  record(event: AgentRuntimeEvent): void;
  persist(input: { threadId: string; runId: string; messageId: string }): Promise<void>;
  snapshot(): PendingToolInvocation[];
}

export function createToolInvocationAccumulator(): ToolInvocationAccumulator {
  const tools = new Map<string, PendingToolInvocation>();

  return {
    record(event) {
      const toolCallId = readString(event, 'toolCallId');
      if (!toolCallId) {
        return;
      }

      if (event.type === 'tool_call_started') {
        tools.set(toolCallId, {
          toolCallId,
          toolName: readString(event, 'toolName') ?? 'unknown',
          status: 'running',
          input: readObject(event, 'input') ?? compactObject({
            inputSummary: readString(event, 'inputSummary'),
            filePath: readString(event, 'filePath'),
            command: readString(event, 'command')
          }),
          output: null,
          error: null,
          startedAt: new Date(),
          finishedAt: null
        });
        return;
      }

      if (event.type !== 'tool_call_completed' && event.type !== 'tool_call_failed') {
        return;
      }

      const existing = tools.get(toolCallId) ?? {
        toolCallId,
        toolName: readString(event, 'toolName') ?? 'unknown',
        status: 'running' as ToolInvocationStatus,
        input: null,
        output: null,
        error: null,
        startedAt: null,
        finishedAt: null
      };

      tools.set(toolCallId, {
        ...existing,
        status: event.type === 'tool_call_completed' ? 'completed' : 'failed',
        output:
          event.type === 'tool_call_completed'
            ? readObject(event, 'output') ?? compactObject({ resultSummary: readString(event, 'resultSummary') })
            : existing.output,
        error:
          event.type === 'tool_call_failed'
            ? readString(event, 'error') ?? readString(event, 'resultSummary') ?? 'Tool call failed.'
            : null,
        finishedAt: new Date()
      });
    },

    async persist(input) {
      const invocations = Array.from(tools.values());
      if (invocations.length === 0) {
        return;
      }

      await withCloudAgentTransaction(async (repositories) => {
        for (const invocation of invocations) {
          await repositories.toolRepo.create({
            id: randomUUID(),
            threadId: input.threadId,
            runId: input.runId,
            messageId: input.messageId,
            toolName: invocation.toolName,
            toolCallId: invocation.toolCallId,
            status: invocation.status,
            input: invocation.input,
            output: invocation.output,
            error: invocation.error,
            startedAt: invocation.startedAt,
            finishedAt: invocation.finishedAt
          });
        }
      });
    },

    snapshot() {
      return Array.from(tools.values());
    }
  };
}

function readString(event: AgentRuntimeEvent, key: string): string | null {
  const value = event.payload?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readObject(event: AgentRuntimeEvent, key: string): Record<string, unknown> | null {
  const value = event.payload?.[key];
  return isRecord(value) ? value : null;
}

function compactObject(input: Record<string, string | null>): Record<string, unknown> | null {
  const compacted = Object.fromEntries(Object.entries(input).filter((entry): entry is [string, string] => Boolean(entry[1])));
  return Object.keys(compacted).length > 0 ? compacted : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
