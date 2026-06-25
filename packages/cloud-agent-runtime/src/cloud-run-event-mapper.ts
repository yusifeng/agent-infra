import type { CloudRunEventPayloadV1, CloudRunEventType } from '@agent-infra/core';

import type { AgentRuntimeEvent } from './types.js';

export interface CloudRunEventMappingContext {
  provider: string;
  workspaceId: string;
  threadId?: string | null;
  runId?: string | null;
  model?: string | null;
}

export interface MappedCloudRunEvent {
  type: CloudRunEventType;
  payload: CloudRunEventPayloadV1;
}

export function mapAgentRuntimeEventToCloudRunEvent(
  event: AgentRuntimeEvent,
  context: CloudRunEventMappingContext
): MappedCloudRunEvent | null {
  switch (event.type) {
    case 'agent_start':
      return {
        type: 'run_started',
        payload: {
          ...basePayload('run_started', context),
          cwd: readString(event.payload, 'cwd')
        }
      };
    case 'agent_message_delta':
      return {
        type: 'agent_message_delta',
        payload: {
          ...basePayload('agent_message_delta', context),
          delta: readString(event.payload, 'content') ?? readString(event.payload, 'delta') ?? ''
        }
      };
    case 'tool_call_started': {
      const toolCallId = readString(event.payload, 'toolCallId');
      const toolName = readString(event.payload, 'toolName');
      if (!toolCallId || !toolName) return null;
      return {
        type: 'tool_call_started',
        payload: {
          ...basePayload('tool_call_started', context),
          toolCallId,
          toolName,
          input: readObject(event.payload, 'input'),
          cwd: readString(event.payload, 'cwd')
        }
      };
    }
    case 'tool_call_completed': {
      const toolCallId = readString(event.payload, 'toolCallId');
      if (!toolCallId) return null;
      return {
        type: 'tool_call_completed',
        payload: {
          ...basePayload('tool_call_completed', context),
          toolCallId,
          output: readObject(event.payload, 'output') ?? readSummaryObject(event.payload, 'resultSummary'),
          exitCode: readNumber(event.payload, 'exitCode')
        }
      };
    }
    case 'tool_call_failed': {
      const toolCallId = readString(event.payload, 'toolCallId');
      if (!toolCallId) return null;
      return {
        type: 'tool_call_failed',
        payload: {
          ...basePayload('tool_call_failed', context),
          toolCallId,
          error: readString(event.payload, 'error') ?? readString(event.payload, 'resultSummary') ?? 'Tool call failed.'
        }
      };
    }
    case 'file_change_detected': {
      const filePath = readString(event.payload, 'path') ?? readString(event.payload, 'filePath');
      if (!filePath) return null;
      return {
        type: 'file_change_detected',
        payload: {
          ...basePayload('file_change_detected', context),
          path: filePath,
          changeType: readChangeType(event.payload) ?? 'modified',
          toolCallId: readString(event.payload, 'toolCallId'),
          contentHash: readString(event.payload, 'contentHash')
        }
      };
    }
    case 'permission_requested': {
      const permissionRequestId = readString(event.payload, 'permissionRequestId');
      const action = readString(event.payload, 'action');
      if (!permissionRequestId || !action) return null;
      return {
        type: 'permission_requested',
        payload: {
          ...basePayload('permission_requested', context),
          permissionRequestId,
          action,
          details: readObject(event.payload, 'details')
        }
      };
    }
    case 'approval_resolved': {
      const permissionRequestId = readString(event.payload, 'permissionRequestId');
      const decision = readApprovalDecision(event.payload);
      if (!permissionRequestId || !decision) return null;
      return {
        type: 'approval_resolved',
        payload: {
          ...basePayload('approval_resolved', context),
          permissionRequestId,
          decision,
          status: readApprovalStatus(event.payload),
          reason: readString(event.payload, 'reason'),
          resolvedByActorId: readString(event.payload, 'resolvedByActorId')
        }
      };
    }
    case 'usage_updated': {
      const usage = readObject(event.payload, 'usage');
      if (!usage) return null;
      return {
        type: 'usage_updated',
        payload: {
          ...basePayload('usage_updated', context),
          usage
        }
      };
    }
    case 'provider_session_bound': {
      const providerSessionId = readString(event.payload, 'providerSessionId');
      if (!providerSessionId) return null;
      return {
        type: 'provider_session_bound',
        payload: {
          ...basePayload('provider_session_bound', context),
          provider: readString(event.payload, 'provider') ?? context.provider,
          providerSessionId,
          providerProjectKey: readString(event.payload, 'providerProjectKey')
        }
      };
    }
    case 'provider_session_recovery': {
      const strategy = readProviderSessionRecoveryStrategy(event.payload);
      const reason = readString(event.payload, 'reason');
      if (!strategy || !reason) return null;
      return {
        type: 'provider_session_recovery',
        payload: {
          ...basePayload('provider_session_recovery', context),
          provider: readString(event.payload, 'provider') ?? context.provider,
          strategy,
          reason,
          previousProviderSessionId: readString(event.payload, 'previousProviderSessionId'),
          newProviderSessionId: readString(event.payload, 'newProviderSessionId')
        }
      };
    }
    case 'agent_completed':
      return {
        type: 'run_completed',
        payload: {
          ...basePayload('run_completed', context),
          finishReason: readString(event.payload, 'finishReason')
        }
      };
    case 'agent_failed':
      return {
        type: 'run_failed',
        payload: {
          ...basePayload('run_failed', context),
          error: readString(event.payload, 'error') ?? 'Agent run failed.'
        }
      };
    case 'agent_message_completed':
    case 'provider_transcript_mirrored':
      return null;
    default:
      return null;
  }
}

function basePayload<TType extends CloudRunEventPayloadV1['type']>(
  type: TType,
  context: CloudRunEventMappingContext
): Extract<CloudRunEventPayloadV1, { type: TType }> {
  return {
    schemaVersion: 1,
    type,
    provider: context.provider,
    model: context.model ?? null,
    workspaceId: context.workspaceId,
    threadId: context.threadId ?? null,
    runId: context.runId ?? null
  } as Extract<CloudRunEventPayloadV1, { type: TType }>;
}

function readString(payload: AgentRuntimeEvent['payload'] | undefined | null, key: string): string | null {
  const value = payload?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(payload: AgentRuntimeEvent['payload'] | undefined | null, key: string): number | null {
  const value = payload?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readObject(payload: AgentRuntimeEvent['payload'] | undefined | null, key: string): Record<string, unknown> | null {
  const value = payload?.[key];
  return isRecord(value) ? value : null;
}

function readChangeType(payload: AgentRuntimeEvent['payload'] | undefined | null): 'created' | 'modified' | 'deleted' | null {
  const value = readString(payload, 'changeType');
  return value === 'created' || value === 'modified' || value === 'deleted' ? value : null;
}

function readApprovalDecision(payload: AgentRuntimeEvent['payload'] | undefined | null): 'approved' | 'denied' | null {
  const value = readString(payload, 'decision');
  return value === 'approved' || value === 'denied' ? value : null;
}

function readApprovalStatus(
  payload: AgentRuntimeEvent['payload'] | undefined | null
): 'approved' | 'denied' | 'expired' | 'cancelled' | null {
  const value = readString(payload, 'status');
  return value === 'approved' || value === 'denied' || value === 'expired' || value === 'cancelled' ? value : null;
}

function readProviderSessionRecoveryStrategy(
  payload: AgentRuntimeEvent['payload'] | undefined | null
): 'archive_and_restart' | 'fork' | 'compact' | 'replay_transcript' | null {
  const value = readString(payload, 'strategy');
  return value === 'archive_and_restart' || value === 'fork' || value === 'compact' || value === 'replay_transcript'
    ? value
    : null;
}

function readSummaryObject(payload: AgentRuntimeEvent['payload'] | undefined | null, key: string): Record<string, unknown> | null {
  const summary = readString(payload, key);
  return summary ? { summary } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
