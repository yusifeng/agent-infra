import { describe, expect, it } from 'vitest';

import { mapAgentRuntimeEventToCloudRunEvent } from '../src/cloud-run-event-mapper';

const context = {
  provider: 'claude',
  workspaceId: 'workspace-1',
  threadId: 'thread-1',
  runId: 'run-1',
  model: 'deepseek-v4-flash'
};

describe('mapAgentRuntimeEventToCloudRunEvent', () => {
  it('maps message and terminal events into versioned cloud run payloads', () => {
    const delta = mapAgentRuntimeEventToCloudRunEvent(
      {
        type: 'agent_message_delta',
        payload: { content: 'hello' }
      },
      context
    );
    const completed = mapAgentRuntimeEventToCloudRunEvent(
      {
        type: 'agent_completed',
        payload: { content: 'hello' }
      },
      context
    );

    expect(delta).toEqual({
      type: 'agent_message_delta',
      payload: {
        schemaVersion: 1,
        type: 'agent_message_delta',
        provider: 'claude',
        model: 'deepseek-v4-flash',
        workspaceId: 'workspace-1',
        threadId: 'thread-1',
        runId: 'run-1',
        delta: 'hello'
      }
    });
    expect(completed?.type).toBe('run_completed');
    expect(completed?.payload.schemaVersion).toBe(1);
  });

  it('maps tool lifecycle and provider session binding events', () => {
    const started = mapAgentRuntimeEventToCloudRunEvent(
      {
        type: 'tool_call_started',
        payload: {
          toolCallId: 'tool-1',
          toolName: 'Write',
          input: { file_path: 'snake/index.html' },
          cwd: '/workspace'
        }
      },
      context
    );
    const bound = mapAgentRuntimeEventToCloudRunEvent(
      {
        type: 'provider_session_bound',
        payload: {
          provider: 'claude',
          providerSessionId: 'claude-session-1'
        }
      },
      context
    );
    const fileChange = mapAgentRuntimeEventToCloudRunEvent(
      {
        type: 'file_change_detected',
        payload: {
          toolCallId: 'tool-1',
          path: 'snake/index.html',
          changeType: 'modified'
        }
      },
      context
    );

    expect(started?.type).toBe('tool_call_started');
    expect(started?.payload).toMatchObject({
      schemaVersion: 1,
      type: 'tool_call_started',
      toolCallId: 'tool-1',
      toolName: 'Write',
      input: { file_path: 'snake/index.html' },
      cwd: '/workspace'
    });
    expect(bound).toEqual({
      type: 'provider_session_bound',
      payload: {
        schemaVersion: 1,
        type: 'provider_session_bound',
        provider: 'claude',
        model: 'deepseek-v4-flash',
        workspaceId: 'workspace-1',
        threadId: 'thread-1',
        runId: 'run-1',
        providerSessionId: 'claude-session-1',
        providerProjectKey: null
      }
    });
    expect(fileChange?.payload).toMatchObject({
      schemaVersion: 1,
      type: 'file_change_detected',
      path: 'snake/index.html',
      changeType: 'modified',
      toolCallId: 'tool-1'
    });
  });

  it('maps provider session recovery events', () => {
    const recovery = mapAgentRuntimeEventToCloudRunEvent(
      {
        type: 'provider_session_recovery',
        payload: {
          provider: 'claude',
          strategy: 'archive_and_restart',
          reason: 'session expired',
          previousProviderSessionId: 'claude-session-old'
        }
      },
      context
    );

    expect(recovery).toEqual({
      type: 'provider_session_recovery',
      payload: {
        schemaVersion: 1,
        type: 'provider_session_recovery',
        provider: 'claude',
        model: 'deepseek-v4-flash',
        workspaceId: 'workspace-1',
        threadId: 'thread-1',
        runId: 'run-1',
        strategy: 'archive_and_restart',
        reason: 'session expired',
        previousProviderSessionId: 'claude-session-old',
        newProviderSessionId: null
      }
    });
  });

  it('maps permission and approval events', () => {
    const permission = mapAgentRuntimeEventToCloudRunEvent(
      {
        type: 'permission_requested',
        payload: {
          permissionRequestId: 'perm-1',
          action: 'tool.execute',
          details: {
            toolName: 'Bash'
          }
        }
      },
      context
    );
    const approval = mapAgentRuntimeEventToCloudRunEvent(
      {
        type: 'approval_resolved',
        payload: {
          permissionRequestId: 'perm-1',
          decision: 'approved',
          status: 'approved',
          resolvedByActorId: 'admin'
        }
      },
      context
    );

    expect(permission).toEqual({
      type: 'permission_requested',
      payload: {
        schemaVersion: 1,
        type: 'permission_requested',
        provider: 'claude',
        model: 'deepseek-v4-flash',
        workspaceId: 'workspace-1',
        threadId: 'thread-1',
        runId: 'run-1',
        permissionRequestId: 'perm-1',
        action: 'tool.execute',
        details: {
          toolName: 'Bash'
        }
      }
    });
    expect(approval?.payload).toMatchObject({
      schemaVersion: 1,
      type: 'approval_resolved',
      permissionRequestId: 'perm-1',
      decision: 'approved',
      status: 'approved',
      resolvedByActorId: 'admin'
    });
  });

  it('preserves terminal approval statuses from provider runtime events', () => {
    const event = mapAgentRuntimeEventToCloudRunEvent(
      {
        type: 'approval_resolved',
        payload: {
          permissionRequestId: 'perm-1',
          decision: 'denied',
          status: 'cancelled',
          reason: 'Run cancelled.',
          resolvedByActorId: 'durable-permission-broker'
        }
      },
      context
    );

    expect(event).toEqual({
      type: 'approval_resolved',
      payload: {
        schemaVersion: 1,
        type: 'approval_resolved',
        provider: 'claude',
        model: 'deepseek-v4-flash',
        workspaceId: 'workspace-1',
        threadId: 'thread-1',
        runId: 'run-1',
        permissionRequestId: 'perm-1',
        decision: 'denied',
        status: 'cancelled',
        reason: 'Run cancelled.',
        resolvedByActorId: 'durable-permission-broker'
      }
    });
  });
});
