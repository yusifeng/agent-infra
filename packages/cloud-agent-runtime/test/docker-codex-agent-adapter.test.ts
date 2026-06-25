import { describe, expect, it } from 'vitest';
import type { ThreadEvent } from '@openai/codex-sdk';

import { DockerCodexAgentAdapter } from '../src/docker-codex-agent-adapter';
import { InMemoryProviderTranscriptStore } from '../src/in-memory-transcript-store';
import type { AgentRuntimeEvent, RuntimeScope, SandboxSession } from '../src/types';

const scope: RuntimeScope = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  workspaceId: 'workspace-1',
  threadId: 'thread-1',
  runId: 'run-1'
};

const sandbox: SandboxSession = {
  id: 'sandbox-1',
  provider: 'docker',
  scope,
  status: 'running',
  workspacePath: '/tmp/private-host/workspace',
  createdAt: new Date('2026-01-01T00:00:00.000Z')
};

describe('DockerCodexAgentAdapter', () => {
  it('runs Codex inside the guest workspace and maps streamed events', async () => {
    const transcriptStore = new InMemoryProviderTranscriptStore();
    const sdkEvents: ThreadEvent[] = [
      {
        type: 'thread.started',
        thread_id: 'codex-thread-1'
      },
      {
        type: 'item.started',
        item: {
          id: 'cmd-1',
          type: 'command_execution',
          command: 'pwd',
          aggregated_output: '',
          status: 'in_progress'
        }
      },
      {
        type: 'item.completed',
        item: {
          id: 'cmd-1',
          type: 'command_execution',
          command: 'pwd',
          aggregated_output: '/workspace',
          exit_code: 0,
          status: 'completed'
        }
      },
      {
        type: 'item.completed',
        item: {
          id: 'msg-1',
          type: 'agent_message',
          text: '/workspace'
        }
      },
      {
        type: 'turn.completed',
        usage: {
          input_tokens: 1,
          cached_input_tokens: 0,
          output_tokens: 1,
          reasoning_output_tokens: 0
        }
      }
    ];
    const adapter = new DockerCodexAgentAdapter({
      apiKey: 'test-key',
      docker: async (input) => {
        expect(input.args).toContain('--workdir');
        expect(input.args).toContain('/workspace');
        expect(input.args.join(' ')).toContain('target=/workspace');
        expect(input.args.join(' ')).toContain('target=/agent-home');
        expect(input.args.join(' ')).toContain('target=/agent-credentials,readonly');
        expect(input.args.join(' ')).toContain('/opt/agent-runtime/codex-agent-runner.mjs');
        expect(input.stdin).toContain('"workingDirectory":"/workspace"');
        expect(input.stdin).toContain('"approvalPolicy":"never"');
        expect(input.stdin).not.toContain('/tmp/private-host/workspace');

        return {
          exitCode: 0,
          stderr: '',
          stdout: sdkEvents.map((event) => JSON.stringify({ type: 'thread_event', event })).join('\n')
        };
      },
      env: {
        CODEX_HOME: '/host/codex-home',
        OPENAI_API_KEY: 'env-key',
        PATH: '/host/bin'
      },
      hostConfigDir: '/tmp/private-host/codex-home',
      hostCredentialsDir: '/tmp/private-host/credentials',
      hostWorkspacePath: '/tmp/private-host/workspace',
      transcriptStore
    });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of adapter.run({ scope, prompt: 'pwd', sandbox })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      'agent_start',
      'provider_session_bound',
      'tool_call_started',
      'tool_call_completed',
      'agent_message_delta',
      'agent_completed'
    ]);
    expect(events.at(0)?.payload?.cwd).toBe('/workspace');
    expect(events.at(0)?.payload?.hostWorkspacePath).toBeUndefined();
    expect(events.at(1)?.payload).toMatchObject({
      providerSessionId: 'codex-thread-1',
      threadId: 'thread-1',
      workspaceId: 'workspace-1'
    });
    expect(events.at(3)?.payload).toMatchObject({
      command: 'pwd',
      resultSummary: '/workspace',
      toolCallId: 'cmd-1'
    });
    expect(events.at(-1)?.payload).toMatchObject({
      content: '/workspace',
      providerSessionId: 'codex-thread-1'
    });

    const transcript = await transcriptStore.load({
      scope,
      key: {
        provider: 'codex',
        providerSessionId: 'codex-thread-1'
      }
    });
    expect(transcript.map((entry) => entry.entryType)).toEqual(sdkEvents.map((event) => event.type));
    expect(transcript[0]?.runId).toBe('run-1');
  });

  it('normalizes absolute guest workspace file changes', async () => {
    const adapter = new DockerCodexAgentAdapter({
      docker: async () => ({
        exitCode: 0,
        stderr: '',
        stdout: [
          {
            type: 'thread.started',
            thread_id: 'codex-thread-1'
          } satisfies ThreadEvent,
          {
            type: 'item.completed',
            item: {
              id: 'change-1',
              type: 'file_change',
              changes: [{ path: '/workspace/snake/index.html', kind: 'add' }],
              status: 'completed'
            }
          } satisfies ThreadEvent,
          {
            type: 'turn.completed',
            usage: {
              input_tokens: 1,
              cached_input_tokens: 0,
              output_tokens: 1,
              reasoning_output_tokens: 0
            }
          } satisfies ThreadEvent
        ].map((event) => JSON.stringify({ type: 'thread_event', event })).join('\n')
      }),
      hostConfigDir: '/tmp/private-host/codex-home',
      hostWorkspacePath: '/tmp/private-host/workspace'
    });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of adapter.run({ scope, prompt: 'write', sandbox })) {
      events.push(event);
    }

    expect(events.find((event) => event.type === 'file_change_detected')?.payload).toMatchObject({
      path: 'snake/index.html',
      changeType: 'created',
      toolCallId: 'change-1'
    });
  });

  it('passes provider session ids to the Docker runner for resume', async () => {
    const adapter = new DockerCodexAgentAdapter({
      docker: async (input) => {
        expect(input.stdin).toContain('"resume":"codex-thread-existing"');
        return {
          exitCode: 0,
          stderr: '',
          stdout: [
            {
              type: 'item.completed',
              item: {
                id: 'msg-1',
                type: 'agent_message',
                text: 'resumed'
              }
            } satisfies ThreadEvent,
            {
              type: 'turn.completed',
              usage: {
                input_tokens: 1,
                cached_input_tokens: 0,
                output_tokens: 1,
                reasoning_output_tokens: 0
              }
            } satisfies ThreadEvent
          ].map((event) => JSON.stringify({ type: 'thread_event', event })).join('\n')
        };
      },
      hostConfigDir: '/tmp/private-host/codex-home',
      hostWorkspacePath: '/tmp/private-host/workspace'
    });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of adapter.run({
      scope,
      prompt: 'continue',
      providerSession: {
        provider: 'codex',
        providerProjectKey: null,
        providerSessionId: 'codex-thread-existing',
        status: 'active',
        threadId: 'thread-1',
        workspaceId: 'workspace-1',
        metadata: null
      },
      sandbox
    })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      'agent_start',
      'agent_message_delta',
      'agent_completed'
    ]);
    expect(events.at(-1)?.payload).toMatchObject({
      content: 'resumed',
      providerSessionId: 'codex-thread-existing'
    });
  });

  it('maps Docker runner failures', async () => {
    const adapter = new DockerCodexAgentAdapter({
      docker: async () => ({
        exitCode: 17,
        stderr: 'container failed',
        stdout: ''
      }),
      hostConfigDir: '/tmp/private-host/codex-home',
      hostWorkspacePath: '/tmp/private-host/workspace'
    });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of adapter.run({ scope, prompt: 'hello', sandbox })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual(['agent_start', 'agent_failed']);
    expect(events.at(-1)?.payload?.error).toContain('Docker Codex agent failed with exit code 17');
  });
});
