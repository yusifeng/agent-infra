import type {
  JsonObject,
  JsonValue,
  PermissionDecision,
  TypedAgentRuntimeEvent,
  WorkspaceChangeType
} from './types.js';

export interface AgentStartEventInput {
  provider: string;
  cwd?: string | null;
  threadId?: string | null;
  runId?: string | null;
}

export interface AgentCompletedEventInput {
  provider: string;
  content: string;
  providerSessionId?: string | null;
}

export interface AgentFailedEventInput {
  provider: string;
  error: string;
  providerSessionId?: string | null;
}

export interface ProviderSessionBoundEventInput {
  provider: string;
  providerSessionId: string;
  threadId?: string | null;
  workspaceId?: string | null;
}

export interface ProviderSessionRecoveryEventInput {
  payload: JsonObject;
}

export interface ProviderTranscriptMirroredEventInput {
  payload: JsonObject;
}

export interface ToolCallStartedEventInput {
  provider: string;
  toolCallId: string;
  toolName: string;
  command?: string | null;
  input?: JsonObject | null;
  inputSummary?: string | null;
  extra?: JsonObject | null;
}

export interface ToolCallCompletedEventInput {
  provider: string;
  toolCallId: string;
  toolName?: string | null;
  command?: string | null;
  output?: JsonObject | null;
  exitCode?: number | null;
  filePath?: string | null;
  resultSummary?: string | null;
}

export interface ToolCallFailedEventInput {
  provider: string;
  toolCallId: string;
  toolName?: string | null;
  command?: string | null;
  error?: string | null;
  filePath?: string | null;
  resultSummary?: string | null;
}

export interface FileChangeDetectedEventInput {
  provider: string;
  path: string;
  changeType: WorkspaceChangeType;
  toolCallId?: string | null;
}

export interface PermissionRequestedEventInput {
  provider: string;
  permissionRequestId: string;
  action: string;
  details?: JsonObject | null;
}

export interface ApprovalResolvedEventInput {
  provider: string;
  permissionRequestId: string;
  decision: PermissionDecision['decision'];
  status?: string | null;
  reason?: string | null;
  resolvedByActorId?: string | null;
}

export interface UsageUpdatedEventInput {
  provider: string;
  usage: JsonObject;
}

export const runtimeEvents = {
  agentCompleted(input: AgentCompletedEventInput): TypedAgentRuntimeEvent<'agent_completed'> {
    return {
      type: 'agent_completed',
      payload: {
        provider: input.provider,
        content: input.content,
        providerSessionId: input.providerSessionId ?? null
      }
    };
  },

  agentFailed(input: AgentFailedEventInput): TypedAgentRuntimeEvent<'agent_failed'> {
    return {
      type: 'agent_failed',
      payload: {
        provider: input.provider,
        error: input.error,
        providerSessionId: input.providerSessionId ?? null
      }
    };
  },

  agentMessageDelta(provider: string, content: string): TypedAgentRuntimeEvent<'agent_message_delta'> {
    return {
      type: 'agent_message_delta',
      payload: {
        provider,
        content
      }
    };
  },

  agentStart(input: AgentStartEventInput): TypedAgentRuntimeEvent<'agent_start'> {
    return {
      type: 'agent_start',
      payload: {
        provider: input.provider,
        cwd: input.cwd ?? null,
        threadId: input.threadId ?? null,
        runId: input.runId ?? null
      }
    };
  },

  approvalResolved(input: ApprovalResolvedEventInput): TypedAgentRuntimeEvent<'approval_resolved'> {
    return {
      type: 'approval_resolved',
      payload: {
        provider: input.provider,
        permissionRequestId: input.permissionRequestId,
        decision: input.decision,
        status: input.status ?? input.decision,
        reason: input.reason ?? null,
        resolvedByActorId: input.resolvedByActorId ?? null
      }
    };
  },

  usageUpdated(input: UsageUpdatedEventInput): TypedAgentRuntimeEvent<'usage_updated'> {
    return {
      type: 'usage_updated',
      payload: {
        provider: input.provider,
        usage: input.usage
      }
    };
  },

  fileChangeDetected(input: FileChangeDetectedEventInput): TypedAgentRuntimeEvent<'file_change_detected'> {
    return {
      type: 'file_change_detected',
      payload: {
        provider: input.provider,
        path: input.path,
        changeType: input.changeType,
        toolCallId: input.toolCallId ?? null
      }
    };
  },

  permissionRequested(input: PermissionRequestedEventInput): TypedAgentRuntimeEvent<'permission_requested'> {
    return {
      type: 'permission_requested',
      payload: {
        provider: input.provider,
        permissionRequestId: input.permissionRequestId,
        action: input.action,
        details: input.details ?? null
      }
    };
  },

  providerSessionBound(input: ProviderSessionBoundEventInput): TypedAgentRuntimeEvent<'provider_session_bound'> {
    return {
      type: 'provider_session_bound',
      payload: {
        provider: input.provider,
        providerSessionId: input.providerSessionId,
        threadId: input.threadId ?? null,
        workspaceId: input.workspaceId ?? null
      }
    };
  },

  providerSessionRecovery(input: ProviderSessionRecoveryEventInput): TypedAgentRuntimeEvent<'provider_session_recovery'> {
    return {
      type: 'provider_session_recovery',
      payload: input.payload
    };
  },

  providerTranscriptMirrored(
    input: ProviderTranscriptMirroredEventInput
  ): TypedAgentRuntimeEvent<'provider_transcript_mirrored'> {
    return {
      type: 'provider_transcript_mirrored',
      payload: input.payload
    };
  },

  toolCallCompleted(input: ToolCallCompletedEventInput): TypedAgentRuntimeEvent<'tool_call_completed'> {
    return {
      type: 'tool_call_completed',
      payload: {
        provider: input.provider,
        toolCallId: input.toolCallId,
        toolName: input.toolName ?? null,
        command: input.command ?? null,
        output: input.output ?? null,
        exitCode: input.exitCode ?? null,
        filePath: input.filePath ?? null,
        resultSummary: input.resultSummary ?? null
      }
    };
  },

  toolCallFailed(input: ToolCallFailedEventInput): TypedAgentRuntimeEvent<'tool_call_failed'> {
    return {
      type: 'tool_call_failed',
      payload: {
        provider: input.provider,
        toolCallId: input.toolCallId,
        toolName: input.toolName ?? null,
        command: input.command ?? null,
        error: input.error ?? null,
        filePath: input.filePath ?? null,
        resultSummary: input.resultSummary ?? null
      }
    };
  },

  toolCallStarted(input: ToolCallStartedEventInput): TypedAgentRuntimeEvent<'tool_call_started'> {
    const extraCommand = input.extra?.command;
    return {
      type: 'tool_call_started',
      payload: {
        ...(input.extra ?? {}),
        provider: input.provider,
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        command: input.command ?? (typeof extraCommand === 'string' ? extraCommand : null),
        input: input.input ?? null,
        inputSummary: input.inputSummary ?? null
      }
    };
  }
};
