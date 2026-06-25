import { describe, expect, it } from 'vitest';

import { DockerClaudeAgentAdapter } from '../src/docker-claude-agent-adapter';
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
  provider: 'docker',
  scope,
  status: 'running',
  workspacePath: '/tmp/workspace',
  createdAt: new Date('2026-01-01T00:00:00.000Z')
};

describe('DockerClaudeAgentAdapter', () => {
  it('runs Claude inside the guest workspace and maps SDK output', async () => {
    const transcriptStore = new InMemoryProviderTranscriptStore();
    const adapter = new DockerClaudeAgentAdapter({
      docker: async (input) => {
        expect(input.args).toContain('--workdir');
        expect(input.args).toContain('/workspace');
        expect(input.args.join(' ')).toContain('target=/workspace');
        expect(input.args.join(' ')).toContain('target=/agent-home');
        expect(input.args.join(' ')).toContain('target=/agent-credentials,readonly');
        expect(input.keepStdinOpen).toBe(false);
        expect(input.stdin).toContain('"cwd":"/workspace"');
        expect(input.stdin).not.toContain('"sessionId"');
        expect(input.stdin).toContain('"tools":["Bash"]');

        return {
          exitCode: 0,
          stderr: '',
          stdout: [
            JSON.stringify({
              type: 'sdk_message',
              message: {
                type: 'assistant',
                message: {
                  id: 'msg_1',
                  type: 'message',
                  role: 'assistant',
                  model: 'claude-test',
                  content: [{ type: 'text', text: '/workspace' }],
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
              }
            }),
            JSON.stringify({
              type: 'sdk_message',
              message: {
                type: 'result',
                subtype: 'success',
                duration_ms: 10,
                duration_api_ms: 8,
                is_error: false,
                num_turns: 1,
                result: '/workspace',
                stop_reason: 'end_turn',
                total_cost_usd: 0,
                usage: {},
                modelUsage: {},
                permission_denials: [],
                uuid: '00000000-0000-4000-8000-000000000003',
                session_id: '00000000-0000-4000-8000-000000000002'
              }
            })
          ].join('\n')
        };
      },
      hostConfigDir: '/tmp/agent-home',
      hostCredentialsDir: '/tmp/agent-credentials',
      hostWorkspacePath: '/tmp/workspace',
      tools: ['Bash'],
      allowedTools: ['Bash'],
      transcriptStore
    });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of adapter.run({ scope, prompt: 'pwd', sandbox })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      'agent_start',
      'provider_session_bound',
      'agent_message_delta',
      'agent_completed'
    ]);
    expect(events.at(0)?.payload?.cwd).toBe('/workspace');
    expect(events.at(0)?.payload?.hostWorkspacePath).toBeUndefined();
    expect(events.at(-1)?.payload?.content).toBe('/workspace');

    const transcript = await transcriptStore.load({
      scope,
      key: {
        provider: 'claude',
        providerSessionId: '00000000-0000-4000-8000-000000000002'
      }
    });
    expect(transcript.map((entry) => entry.entryType)).toEqual(['assistant', 'result']);
    expect(transcript[0]?.runId).toBe('run-1');
  });

  it('normalizes Docker guest workspace file paths in runtime events', async () => {
    const adapter = new DockerClaudeAgentAdapter({
      docker: async () => ({
        exitCode: 0,
        stderr: '',
        stdout: [
          JSON.stringify({
            type: 'sdk_message',
            message: {
              type: 'stream_event',
              event: {
                type: 'content_block_start',
                index: 0,
                content_block: {
                  type: 'tool_use',
                  id: 'toolu_1',
                  name: 'Write',
                  input: {}
                }
              },
              parent_tool_use_id: null,
              uuid: '00000000-0000-4000-8000-000000000031',
              session_id: '00000000-0000-4000-8000-000000000032'
            }
          }),
          JSON.stringify({
            type: 'sdk_message',
            message: {
              type: 'stream_event',
              event: {
                type: 'content_block_delta',
                index: 0,
                delta: {
                  type: 'input_json_delta',
                  partial_json: '{"file_path":"/workspace/snake/index.html","content":"ok"}'
                }
              },
              parent_tool_use_id: null,
              uuid: '00000000-0000-4000-8000-000000000033',
              session_id: '00000000-0000-4000-8000-000000000032'
            }
          }),
          JSON.stringify({
            type: 'sdk_message',
            message: {
              type: 'user',
              message: {
                role: 'user',
                content: [
                  {
                    type: 'tool_result',
                    tool_use_id: 'toolu_1',
                    content: 'File created successfully at: /workspace/snake/index.html'
                  }
                ]
              },
              parent_tool_use_id: null,
              uuid: '00000000-0000-4000-8000-000000000034',
              session_id: '00000000-0000-4000-8000-000000000032'
            }
          }),
          JSON.stringify({
            type: 'sdk_message',
            message: {
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
              uuid: '00000000-0000-4000-8000-000000000035',
              session_id: '00000000-0000-4000-8000-000000000032'
            }
          })
        ].join('\n')
      }),
      hostConfigDir: '/tmp/agent-home',
      hostWorkspacePath: '/tmp/workspace',
      tools: ['Write'],
      allowedTools: ['Write']
    });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of adapter.run({ scope, prompt: 'write', sandbox })) {
      events.push(event);
    }

    expect(events.find((event) => event.type === 'tool_call_completed')?.payload).toMatchObject({
      filePath: 'snake/index.html',
      toolCallId: 'toolu_1'
    });
    expect(events.find((event) => event.type === 'file_change_detected')?.payload).toMatchObject({
      path: 'snake/index.html',
      toolCallId: 'toolu_1'
    });
  });

  it('bridges Docker runner permission requests through a permission broker', async () => {
    const permissionRequests: PermissionRequest[] = [];
    const broker: PermissionBroker = {
      async resolve(request) {
        permissionRequests.push(request);
        return {
          decision: 'approved',
          resolvedByActorId: 'docker-policy',
          updatedInput: {
            command: 'pwd'
          },
          classification: 'user_temporary'
        };
      }
    };
    const adapter = new DockerClaudeAgentAdapter({
      docker: async (input) => {
        expect(input.stdin).toContain('"permissionBridge":true');
        expect(input.keepStdinOpen).toBe(true);
        return {
          exitCode: 0,
          stderr: '',
          stdout: [
            JSON.stringify({
              type: 'permission_requested',
              permissionRequestId: 'toolu_docker_permission_1',
              toolName: 'Bash',
              input: {
                command: 'pwd'
              },
              details: {
                input: {
                  command: 'pwd'
                },
                title: 'Claude wants to run pwd',
                toolName: 'Bash'
              }
            }),
            JSON.stringify({
              type: 'sdk_message',
              message: {
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
                uuid: '00000000-0000-4000-8000-000000000021',
                session_id: '00000000-0000-4000-8000-000000000022'
              }
            })
          ].join('\n')
        };
      },
      hostConfigDir: '/tmp/agent-home',
      hostWorkspacePath: '/tmp/workspace',
      permissionBroker: broker,
      tools: ['Bash'],
      allowedTools: ['Bash']
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
      permissionRequestId: 'toolu_docker_permission_1'
    });
    expect(events.at(2)?.payload).toMatchObject({
      decision: 'approved',
      permissionRequestId: 'toolu_docker_permission_1',
      resolvedByActorId: 'docker-policy'
    });
    expect(permissionRequests).toHaveLength(1);
    expect(permissionRequests[0]).toMatchObject({
      permissionRequestId: 'toolu_docker_permission_1',
      provider: 'claude',
      toolName: 'Bash',
      input: {
        command: 'pwd'
      }
    });
  });

  it('yields Docker permission requests before waiting on the permission broker', async () => {
    let permissionRequestObserved = false;
    const broker: PermissionBroker = {
      async resolve() {
        expect(permissionRequestObserved).toBe(true);
        return {
          decision: 'approved',
          resolvedByActorId: 'durable-policy'
        };
      }
    };
    const adapter = new DockerClaudeAgentAdapter({
      docker: async () => ({
        exitCode: 0,
        stderr: '',
        stdout: [
          JSON.stringify({
            type: 'permission_requested',
            permissionRequestId: 'toolu_durable_permission_1',
            toolName: 'Bash',
            input: {
              command: 'pwd'
            }
          }),
          JSON.stringify({
            type: 'sdk_message',
            message: {
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
              uuid: '00000000-0000-4000-8000-000000000041',
              session_id: '00000000-0000-4000-8000-000000000042'
            }
          })
        ].join('\n')
      }),
      hostConfigDir: '/tmp/agent-home',
      hostWorkspacePath: '/tmp/workspace',
      permissionBroker: broker,
      tools: ['Bash'],
      allowedTools: ['Bash']
    });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of adapter.run({ scope, prompt: 'run pwd', sandbox })) {
      events.push(event);
      if (event.type === 'permission_requested') {
        permissionRequestObserved = true;
      }
    }

    expect(events.map((event) => event.type)).toEqual([
      'agent_start',
      'permission_requested',
      'approval_resolved',
      'provider_session_bound',
      'agent_completed'
    ]);
  });

  it('passes resume only when an existing provider session is bound', async () => {
    let runnerInput: Record<string, unknown> | null = null;
    const adapter = new DockerClaudeAgentAdapter({
      docker: async (input) => {
        runnerInput = JSON.parse(input.stdin ?? '{}') as Record<string, unknown>;
        return {
          exitCode: 0,
          stderr: '',
          stdout: [
            JSON.stringify({
              type: 'sdk_message',
              message: {
                type: 'result',
                subtype: 'success',
                duration_ms: 10,
                duration_api_ms: 8,
                is_error: false,
                num_turns: 1,
                result: 'resumed',
                stop_reason: 'end_turn',
                total_cost_usd: 0,
                usage: {},
                modelUsage: {},
                permission_denials: [],
                uuid: '00000000-0000-4000-8000-000000000041',
                session_id: 'provider-session-1'
              }
            })
          ].join('\n')
        };
      },
      hostConfigDir: '/tmp/agent-home',
      hostWorkspacePath: '/tmp/workspace'
    });

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

    expect(runnerInput).toMatchObject({
      resume: 'provider-session-1'
    });
    expect(runnerInput).not.toHaveProperty('sessionId');
  });

  it('injects provider-neutral continuity context into the Docker runner prompt', async () => {
    let runnerInput: unknown = null;
    const adapter = new DockerClaudeAgentAdapter({
      docker: async (input) => {
        runnerInput = JSON.parse(input.stdin ?? '{}');
        return {
          exitCode: 0,
          stderr: '',
          stdout: [
            JSON.stringify({
              type: 'sdk_message',
              message: {
                type: 'result',
                subtype: 'success',
                duration_ms: 10,
                duration_api_ms: 8,
                is_error: false,
                num_turns: 1,
                result: 'continued',
                stop_reason: 'end_turn',
                total_cost_usd: 0,
                usage: {},
                modelUsage: {},
                permission_denials: [],
                uuid: '00000000-0000-4000-8000-000000000031',
                session_id: '00000000-0000-4000-8000-000000000032'
              }
            })
          ].join('\n')
        };
      },
      hostConfigDir: '/tmp/agent-home',
      hostWorkspacePath: '/tmp/workspace'
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

    expect(runnerInput).toMatchObject({
      prompt: expect.stringContaining('Provider session continuity context:')
    });
    expect(runnerInput).toMatchObject({
      prompt: expect.stringContaining('- previous provider session id: claude-session-old')
    });
    expect(runnerInput).toMatchObject({
      prompt: expect.stringContaining('User message:\ncontinue')
    });
  });
});
