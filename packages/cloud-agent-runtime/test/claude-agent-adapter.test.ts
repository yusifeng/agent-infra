import { describe, expect, it } from 'vitest';

import { ClaudeAgentAdapter, type ClaudeQueryFunction } from '../src/claude-agent-adapter';
import { InMemoryProviderTranscriptStore } from '../src/in-memory-transcript-store';
import type { AgentRuntimeEvent, PermissionBroker, PermissionRequest, RuntimeScope, SandboxSession } from '../src/types';

const scope: RuntimeScope = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  workspaceId: 'workspace-1',
  threadId: '00000000-0000-4000-8000-000000000010',
  runId: 'run-1'
};

const sandbox: SandboxSession = {
  id: 'sandbox-1',
  provider: 'test',
  scope,
  status: 'running',
  workspacePath: '/tmp/workspace',
  createdAt: new Date('2026-01-01T00:00:00.000Z')
};

describe('ClaudeAgentAdapter', () => {
  it('emits provider-neutral lifecycle events from SDK messages', async () => {
    async function* fakeQuery() {
      yield {
        type: 'assistant',
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-test',
          content: [{ type: 'text', text: 'hello from claude' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: {
            input_tokens: 1,
            output_tokens: 1
          }
        },
        parent_tool_use_id: null,
        uuid: '00000000-0000-4000-8000-000000000001',
        session_id: '00000000-0000-4000-8000-000000000002'
      } as const;
      yield {
        type: 'result',
        subtype: 'success',
        duration_ms: 10,
        duration_api_ms: 8,
        is_error: false,
        num_turns: 1,
        result: 'final text',
        stop_reason: 'end_turn',
        total_cost_usd: 0,
        usage: {},
        modelUsage: {},
        permission_denials: [],
        uuid: '00000000-0000-4000-8000-000000000003',
        session_id: '00000000-0000-4000-8000-000000000002'
      } as const;
    }

    const transcriptStore = new InMemoryProviderTranscriptStore();
    const adapter = new ClaudeAgentAdapter({
      query: fakeQuery,
      cwd: sandbox.workspacePath,
      transcriptStore
    });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of adapter.run({ scope, prompt: 'hello', sandbox })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      'agent_start',
      'provider_session_bound',
      'agent_message_delta',
      'agent_completed'
    ]);
    expect(events.at(1)?.payload?.providerSessionId).toBe('00000000-0000-4000-8000-000000000002');
    expect(events.at(-1)?.payload?.content).toBe('final text');
    expect(events.at(-1)?.payload?.providerSessionId).toBe('00000000-0000-4000-8000-000000000002');

    const transcript = await transcriptStore.load({
      scope,
      key: {
        provider: 'claude',
        providerSessionId: '00000000-0000-4000-8000-000000000002'
      }
    });
    expect(transcript.map((entry) => entry.entryType)).toEqual(['assistant', 'result']);
    expect(transcript.map((entry) => entry.providerEntryId)).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000003'
    ]);
    expect(transcript[0]?.runId).toBe('run-1');
  });

  it('surfaces provider authentication retries as failed agent runs', async () => {
    async function* fakeQuery() {
      yield {
        type: 'system',
        subtype: 'api_retry',
        attempt: 1,
        max_retries: 10,
        retry_delay_ms: 500,
        error_status: 401,
        error: 'authentication_failed',
        session_id: '00000000-0000-4000-8000-000000000004',
        uuid: '00000000-0000-4000-8000-000000000005'
      } as const;
    }

    const adapter = new ClaudeAgentAdapter({
      query: fakeQuery,
      cwd: sandbox.workspacePath
    });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of adapter.run({ scope, prompt: 'hello', sandbox })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual(['agent_start', 'provider_session_bound', 'agent_failed']);
    expect(events.at(-1)?.payload?.error).toBe(
      'Claude provider authentication failed. Check ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN.'
    );
    expect(events.at(-1)?.payload?.providerSessionId).toBe('00000000-0000-4000-8000-000000000004');
  });

  it('injects provider-neutral continuity context into the SDK prompt', async () => {
    let promptSeen = '';
    const fakeQuery: ClaudeQueryFunction = async function* ({ prompt }) {
      promptSeen = prompt;
      yield {
        type: 'result',
        subtype: 'success',
        duration_ms: 1,
        duration_api_ms: 1,
        is_error: false,
        num_turns: 1,
        result: 'ok',
        stop_reason: 'end_turn',
        total_cost_usd: 0,
        usage: {},
        modelUsage: {},
        permission_denials: [],
        uuid: '00000000-0000-4000-8000-000000000101',
        session_id: '00000000-0000-4000-8000-000000000102'
      } as const;
    };
    const adapter = new ClaudeAgentAdapter({
      query: fakeQuery,
      cwd: sandbox.workspacePath
    });

    for await (const _event of adapter.run({
      continuity: {
        fromOrdinal: 1,
        previousProviderSessionId: 'claude-session-old',
        sourceRunIds: ['run-old'],
        strategy: 'replay_transcript',
        summary: '2 provider transcript entries are available for continuity.',
        toOrdinal: 2
      },
      scope,
      prompt: 'continue',
      sandbox
    })) {
      // Drain events.
    }

    expect(promptSeen).toContain('Provider session continuity context:');
    expect(promptSeen).toContain('- strategy: replay_transcript');
    expect(promptSeen).toContain('- previous provider session id: claude-session-old');
    expect(promptSeen).toContain('User message:\ncontinue');
  });

  it('emits provider-neutral tool call events from SDK tool messages', async () => {
    async function* fakeQuery() {
      yield {
        type: 'assistant',
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-test',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'Write',
              input: {
                file_path: 'snake/index.html',
                content: '<!doctype html>'
              }
            }
          ],
          stop_reason: 'tool_use',
          stop_sequence: null,
          usage: {
            input_tokens: 1,
            output_tokens: 1
          }
        },
        parent_tool_use_id: null,
        uuid: '00000000-0000-4000-8000-000000000006',
        session_id: '00000000-0000-4000-8000-000000000007'
      } as const;
      yield {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_1',
              content: 'Wrote snake/index.html'
            }
          ]
        },
        parent_tool_use_id: null,
        uuid: '00000000-0000-4000-8000-000000000008',
        session_id: '00000000-0000-4000-8000-000000000007'
      } as const;
      yield {
        type: 'result',
        subtype: 'success',
        duration_ms: 10,
        duration_api_ms: 8,
        is_error: false,
        num_turns: 1,
        result: 'done',
        stop_reason: 'end_turn',
        total_cost_usd: 0,
        usage: {},
        modelUsage: {},
        permission_denials: [],
        uuid: '00000000-0000-4000-8000-000000000009',
        session_id: '00000000-0000-4000-8000-000000000007'
      } as const;
    }

    const adapter = new ClaudeAgentAdapter({
      query: fakeQuery,
      cwd: sandbox.workspacePath
    });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of adapter.run({ scope, prompt: 'write snake', sandbox })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      'agent_start',
      'provider_session_bound',
      'tool_call_started',
      'tool_call_completed',
      'file_change_detected',
      'agent_completed'
    ]);
    expect(events.at(2)?.payload).toMatchObject({
      filePath: 'snake/index.html',
      inputSummary: 'Write snake/index.html',
      toolCallId: 'toolu_1',
      toolName: 'Write'
    });
    expect(events.at(3)?.payload).toMatchObject({
      resultSummary: 'Wrote snake/index.html',
      toolCallId: 'toolu_1'
    });
    expect(events.at(4)?.payload).toMatchObject({
      changeType: 'modified',
      path: 'snake/index.html',
      toolCallId: 'toolu_1'
    });
  });

  it('bridges Claude canUseTool callbacks through a permission broker', async () => {
    const permissionRequests: PermissionRequest[] = [];
    let sdkPermissionResult: unknown = null;
    const broker: PermissionBroker = {
      async resolve(request) {
        permissionRequests.push(request);
        return {
          decision: 'approved',
          resolvedByActorId: 'policy-user',
          updatedInput: {
            command: 'pwd'
          },
          classification: 'user_temporary'
        };
      }
    };
    const fakeQuery: ClaudeQueryFunction = async function* ({ options }) {
      sdkPermissionResult = await options?.canUseTool?.(
        'Bash',
        {
          command: 'pwd',
          nonJsonValue: undefined
        },
        {
          signal: new AbortController().signal,
          toolUseID: 'toolu_permission_1',
          title: 'Claude wants to run pwd',
          displayName: 'Run command',
          description: 'Claude will run a shell command in the workspace.',
          decisionReason: 'Bash requires approval.'
        }
      );
      yield {
        type: 'result',
        subtype: 'success',
        duration_ms: 10,
        duration_api_ms: 8,
        is_error: false,
        num_turns: 1,
        result: 'approved',
        stop_reason: 'end_turn',
        total_cost_usd: 0,
        usage: {},
        modelUsage: {},
        permission_denials: [],
        uuid: '00000000-0000-4000-8000-000000000011',
        session_id: '00000000-0000-4000-8000-000000000012'
      } as const;
    };

    const adapter = new ClaudeAgentAdapter({
      query: fakeQuery,
      cwd: sandbox.workspacePath,
      permissionBroker: broker
    });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of adapter.run({ scope, prompt: 'run pwd', sandbox })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      'agent_start',
      'permission_requested',
      'approval_resolved',
      'provider_session_bound',
      'agent_completed'
    ]);
    expect(events.at(1)?.payload).toMatchObject({
      action: 'Bash',
      permissionRequestId: 'toolu_permission_1',
      details: {
        decisionReason: 'Bash requires approval.',
        displayName: 'Run command',
        input: {
          command: 'pwd',
          nonJsonValue: null
        },
        title: 'Claude wants to run pwd',
        toolName: 'Bash'
      }
    });
    expect(events.at(2)?.payload).toMatchObject({
      decision: 'approved',
      permissionRequestId: 'toolu_permission_1',
      resolvedByActorId: 'policy-user'
    });
    expect(permissionRequests).toHaveLength(1);
    expect(permissionRequests[0]).toMatchObject({
      permissionRequestId: 'toolu_permission_1',
      provider: 'claude',
      toolName: 'Bash',
      input: {
        command: 'pwd',
        nonJsonValue: null
      }
    });
    expect(sdkPermissionResult).toEqual({
      behavior: 'allow',
      updatedInput: {
        command: 'pwd'
      },
      updatedPermissions: undefined,
      toolUseID: 'toolu_permission_1',
      decisionClassification: 'user_temporary'
    });
  });

  it('returns Claude deny results from denied permission broker decisions', async () => {
    let sdkPermissionResult: unknown = null;
    const fakeQuery: ClaudeQueryFunction = async function* ({ options }) {
      sdkPermissionResult = await options?.canUseTool?.(
        'Write',
        {
          file_path: 'blocked.txt',
          content: 'blocked'
        },
        {
          signal: new AbortController().signal,
          toolUseID: 'toolu_permission_2'
        }
      );
      yield {
        type: 'result',
        subtype: 'success',
        duration_ms: 10,
        duration_api_ms: 8,
        is_error: false,
        num_turns: 1,
        result: 'denied',
        stop_reason: 'end_turn',
        total_cost_usd: 0,
        usage: {},
        modelUsage: {},
        permission_denials: [],
        uuid: '00000000-0000-4000-8000-000000000013',
        session_id: '00000000-0000-4000-8000-000000000014'
      } as const;
    };

    const adapter = new ClaudeAgentAdapter({
      query: fakeQuery,
      cwd: sandbox.workspacePath,
      permissionBroker: {
        async resolve() {
          return {
            decision: 'denied',
            reason: 'Write is blocked by policy.',
            interrupt: true,
            resolvedByActorId: 'policy-user',
            classification: 'user_reject'
          };
        }
      }
    });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of adapter.run({ scope, prompt: 'write', sandbox })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      'agent_start',
      'permission_requested',
      'approval_resolved',
      'provider_session_bound',
      'agent_completed'
    ]);
    expect(events.at(2)?.payload).toMatchObject({
      decision: 'denied',
      permissionRequestId: 'toolu_permission_2',
      reason: 'Write is blocked by policy.',
      resolvedByActorId: 'policy-user'
    });
    expect(sdkPermissionResult).toEqual({
      behavior: 'deny',
      message: 'Write is blocked by policy.',
      interrupt: true,
      toolUseID: 'toolu_permission_2',
      decisionClassification: 'user_reject'
    });
  });

  it('lets Claude create new session ids and resumes only bound provider sessions', async () => {
    const capturedOptions: Array<{ resume?: string; sessionId?: string }> = [];
    const fakeQuery: ClaudeQueryFunction = async function* ({ options }) {
      capturedOptions.push({
        resume: options?.resume,
        sessionId: options?.sessionId
      });
      yield {
        type: 'result',
        subtype: 'success',
        duration_ms: 10,
        duration_api_ms: 8,
        is_error: false,
        num_turns: 1,
        result: 'ok',
        stop_reason: 'end_turn',
        total_cost_usd: 0,
        usage: {},
        modelUsage: {},
        permission_denials: [],
        uuid: '00000000-0000-4000-8000-000000000015',
        session_id: 'provider-session-1'
      } as const;
    };
    const adapter = new ClaudeAgentAdapter({
      query: fakeQuery,
      cwd: sandbox.workspacePath
    });

    for await (const _event of adapter.run({ scope, prompt: 'new', sandbox })) {
      // Drain events.
    }
    for await (const _event of adapter.run({
      providerSession: {
        metadata: null,
        provider: 'claude',
        providerProjectKey: null,
        providerSessionId: 'provider-session-1',
        status: 'active',
        threadId: scope.threadId ?? '',
        workspaceId: scope.workspaceId
      },
      scope,
      prompt: 'resume',
      sandbox
    })) {
      // Drain events.
    }

    expect(capturedOptions).toEqual([
      {
        resume: undefined,
        sessionId: undefined
      },
      {
        resume: 'provider-session-1',
        sessionId: undefined
      }
    ]);
  });
});
