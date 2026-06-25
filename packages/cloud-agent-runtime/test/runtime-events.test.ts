import { describe, expect, it } from 'vitest';

import { runtimeEvents } from '../src/runtime-events';

describe('runtimeEvents', () => {
  it('creates provider session binding events with thread and workspace scope', () => {
    expect(
      runtimeEvents.providerSessionBound({
        provider: 'codex',
        providerSessionId: 'provider-session-1',
        threadId: 'thread-1',
        workspaceId: 'workspace-1'
      })
    ).toEqual({
      type: 'provider_session_bound',
      payload: {
        provider: 'codex',
        providerSessionId: 'provider-session-1',
        threadId: 'thread-1',
        workspaceId: 'workspace-1'
      }
    });
  });

  it('creates tool lifecycle events with stable optional fields', () => {
    expect(
      runtimeEvents.toolCallStarted({
        provider: 'claude',
        toolCallId: 'tool-1',
        toolName: 'Bash',
        input: {
          description: 'print cwd'
        },
        inputSummary: 'pwd',
        extra: {
          command: 'pwd',
          filePath: '/workspace/a.txt'
        }
      })
    ).toEqual({
      type: 'tool_call_started',
      payload: {
        provider: 'claude',
        toolCallId: 'tool-1',
        toolName: 'Bash',
        command: 'pwd',
        input: {
          description: 'print cwd'
        },
        inputSummary: 'pwd',
        filePath: '/workspace/a.txt'
      }
    });

    expect(
      runtimeEvents.toolCallCompleted({
        provider: 'codex',
        toolCallId: 'tool-2',
        toolName: 'command_execution',
        exitCode: 0,
        output: {
          summary: '/workspace\n'
        },
        resultSummary: '/workspace\n'
      })
    ).toEqual({
      type: 'tool_call_completed',
      payload: {
        provider: 'codex',
        toolCallId: 'tool-2',
        toolName: 'command_execution',
        command: null,
        output: {
          summary: '/workspace\n'
        },
        exitCode: 0,
        filePath: null,
        resultSummary: '/workspace\n'
      }
    });
  });

  it('creates failure and file change events', () => {
    expect(
      runtimeEvents.agentFailed({
        provider: 'claude',
        error: 'permission denied',
        providerSessionId: 'session-1'
      })
    ).toEqual({
      type: 'agent_failed',
      payload: {
        provider: 'claude',
        error: 'permission denied',
        providerSessionId: 'session-1'
      }
    });

    expect(
      runtimeEvents.fileChangeDetected({
        provider: 'codex',
        path: 'snake/index.html',
        changeType: 'created',
        toolCallId: 'tool-3'
      })
    ).toEqual({
      type: 'file_change_detected',
      payload: {
        provider: 'codex',
        path: 'snake/index.html',
        changeType: 'created',
        toolCallId: 'tool-3'
      }
    });
  });

  it('keeps provider recovery and transcript payloads provider-extensible', () => {
    expect(
      runtimeEvents.providerSessionRecovery({
        payload: {
          provider: 'claude',
          strategy: 'archive_and_restart'
        }
      })
    ).toEqual({
      type: 'provider_session_recovery',
      payload: {
        provider: 'claude',
        strategy: 'archive_and_restart'
      }
    });

    expect(
      runtimeEvents.providerTranscriptMirrored({
        payload: {
          provider: 'codex',
          providerSessionId: 'session-1',
          entryCount: 3
        }
      })
    ).toEqual({
      type: 'provider_transcript_mirrored',
      payload: {
        provider: 'codex',
        providerSessionId: 'session-1',
        entryCount: 3
      }
    });
  });

  it('creates usage update events', () => {
    expect(
      runtimeEvents.usageUpdated({
        provider: 'codex',
        usage: {
          inputTokens: 10,
          outputTokens: 20
        }
      })
    ).toEqual({
      type: 'usage_updated',
      payload: {
        provider: 'codex',
        usage: {
          inputTokens: 10,
          outputTokens: 20
        }
      }
    });
  });
});
