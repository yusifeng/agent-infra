import { describe, expect, it } from 'vitest';
import type { ThreadEvent, ThreadOptions, TurnOptions } from '@openai/codex-sdk';

import { CodexAgentAdapter, type CodexClientLike, type CodexThreadLike } from '../src/codex-agent-adapter';
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
  workspacePath: '/workspace',
  createdAt: new Date('2026-01-01T00:00:00.000Z')
};

describe('CodexAgentAdapter', () => {
  it('maps streamed Codex thread events into provider-neutral runtime events', async () => {
    const optionsSeen: ThreadOptions[] = [];
    const turnOptionsSeen: TurnOptions[] = [];
    const events: ThreadEvent[] = [
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
          id: 'patch-1',
          type: 'file_change',
          changes: [{ path: 'snake/index.html', kind: 'add' }],
          status: 'completed'
        }
      },
      {
        type: 'item.completed',
        item: {
          id: 'msg-1',
          type: 'agent_message',
          text: 'done'
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
    const fakeThread: CodexThreadLike = {
      id: null,
      async runStreamed(input, turnOptions) {
        expect(input).toBe('create snake');
        turnOptionsSeen.push(turnOptions ?? {});
        return {
          events: (async function* () {
            yield* events;
          })()
        };
      }
    };
    const fakeCodex: CodexClientLike = {
      startThread(options) {
        optionsSeen.push(options ?? {});
        return fakeThread;
      },
      resumeThread() {
        throw new Error('resumeThread should not be called');
      }
    };
    const transcriptStore = new InMemoryProviderTranscriptStore();
    const adapter = new CodexAgentAdapter({
      codex: fakeCodex,
      transcriptStore
    });
    const runtimeEvents: AgentRuntimeEvent[] = [];

    for await (const event of adapter.run({ scope, prompt: 'create snake', sandbox })) {
      runtimeEvents.push(event);
    }

    expect(optionsSeen).toEqual([
      expect.objectContaining({
        approvalPolicy: 'never',
        sandboxMode: 'workspace-write',
        skipGitRepoCheck: true,
        workingDirectory: '/workspace'
      })
    ]);
    expect(turnOptionsSeen).toEqual([expect.objectContaining({ signal: undefined })]);
    expect(runtimeEvents.map((event) => event.type)).toEqual([
      'agent_start',
      'provider_session_bound',
      'tool_call_started',
      'tool_call_completed',
      'file_change_detected',
      'agent_message_delta',
      'agent_completed'
    ]);
    expect(runtimeEvents.at(1)?.payload?.providerSessionId).toBe('codex-thread-1');
    expect(runtimeEvents.at(2)?.payload).toMatchObject({
      toolCallId: 'cmd-1',
      toolName: 'command_execution',
      command: 'pwd'
    });
    expect(runtimeEvents.at(4)?.payload).toMatchObject({
      path: 'snake/index.html',
      changeType: 'created',
      toolCallId: 'patch-1'
    });
    expect(runtimeEvents.at(-1)?.payload).toMatchObject({
      content: 'done',
      providerSessionId: 'codex-thread-1'
    });

    const transcript = await transcriptStore.load({
      scope,
      key: {
        provider: 'codex',
        providerSessionId: 'codex-thread-1'
      }
    });
    expect(transcript.map((entry) => entry.entryType)).toEqual(events.map((event) => event.type));
  });

  it('emits provider session binding when a new thread already exposes an id', async () => {
    const fakeThread: CodexThreadLike = {
      id: 'codex-thread-eager',
      async runStreamed() {
        return {
          events: (async function* () {
            yield {
              type: 'turn.completed',
              usage: {
                input_tokens: 1,
                cached_input_tokens: 0,
                output_tokens: 1,
                reasoning_output_tokens: 0
              }
            } satisfies ThreadEvent;
          })()
        };
      }
    };
    const fakeCodex: CodexClientLike = {
      startThread() {
        return fakeThread;
      },
      resumeThread() {
        throw new Error('resumeThread should not be called');
      }
    };
    const adapter = new CodexAgentAdapter({ codex: fakeCodex });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of adapter.run({ scope, prompt: 'hello', sandbox })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      'agent_start',
      'provider_session_bound',
      'agent_completed'
    ]);
    expect(events.at(1)?.payload?.providerSessionId).toBe('codex-thread-eager');
    expect(events.at(-1)?.payload?.providerSessionId).toBe('codex-thread-eager');
  });

  it('resumes an existing provider session without rebinding it', async () => {
    const optionsSeen: ThreadOptions[] = [];
    let resumedId = '';
    const fakeThread: CodexThreadLike = {
      id: 'codex-thread-1',
      async runStreamed() {
        return {
          events: (async function* () {
            yield {
              type: 'item.completed',
              item: {
                id: 'msg-1',
                type: 'agent_message',
                text: 'resumed'
              }
            } satisfies ThreadEvent;
            yield {
              type: 'turn.completed',
              usage: {
                input_tokens: 1,
                cached_input_tokens: 0,
                output_tokens: 1,
                reasoning_output_tokens: 0
              }
            } satisfies ThreadEvent;
          })()
        };
      }
    };
    const fakeCodex: CodexClientLike = {
      startThread() {
        throw new Error('startThread should not be called');
      },
      resumeThread(id, options) {
        resumedId = id;
        optionsSeen.push(options ?? {});
        return fakeThread;
      }
    };
    const adapter = new CodexAgentAdapter({ codex: fakeCodex });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of adapter.run({
      scope,
      prompt: 'continue',
      sandbox,
      providerSession: {
        provider: 'codex',
        providerSessionId: 'codex-thread-1',
        status: 'active',
        threadId: scope.threadId ?? 'thread-1',
        workspaceId: scope.workspaceId
      }
    })) {
      events.push(event);
    }

    expect(resumedId).toBe('codex-thread-1');
    expect(optionsSeen).toEqual([
      expect.objectContaining({
        workingDirectory: '/workspace'
      })
    ]);
    expect(events.map((event) => event.type)).toEqual(['agent_start', 'agent_message_delta', 'agent_completed']);
    expect(events.at(-1)?.payload?.providerSessionId).toBe('codex-thread-1');
  });

  it('maps MCP tool success and failure events', async () => {
    const fakeThread: CodexThreadLike = {
      id: null,
      async runStreamed() {
        return {
          events: (async function* () {
            yield {
              type: 'thread.started',
              thread_id: 'codex-thread-mcp'
            } satisfies ThreadEvent;
            yield {
              type: 'item.started',
              item: {
                id: 'mcp-1',
                type: 'mcp_tool_call',
                server: 'docs',
                tool: 'search',
                arguments: { q: 'runtime' },
                status: 'in_progress'
              }
            } satisfies ThreadEvent;
            yield {
              type: 'item.completed',
              item: {
                id: 'mcp-1',
                type: 'mcp_tool_call',
                server: 'docs',
                tool: 'search',
                arguments: { q: 'runtime' },
                result: {
                  content: [],
                  structured_content: { count: 1 }
                },
                status: 'completed'
              }
            } satisfies ThreadEvent;
            yield {
              type: 'item.completed',
              item: {
                id: 'mcp-2',
                type: 'mcp_tool_call',
                server: 'docs',
                tool: 'fetch',
                arguments: 'bad',
                error: { message: 'not found' },
                status: 'failed'
              }
            } satisfies ThreadEvent;
            yield {
              type: 'turn.completed',
              usage: {
                input_tokens: 1,
                cached_input_tokens: 0,
                output_tokens: 1,
                reasoning_output_tokens: 0
              }
            } satisfies ThreadEvent;
          })()
        };
      }
    };
    const adapter = new CodexAgentAdapter({
      codex: {
        startThread: () => fakeThread,
        resumeThread: () => {
          throw new Error('resumeThread should not be called');
        }
      }
    });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of adapter.run({ scope, prompt: 'use mcp', sandbox })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      'agent_start',
      'provider_session_bound',
      'tool_call_started',
      'tool_call_completed',
      'tool_call_failed',
      'agent_completed'
    ]);
    expect(events.at(2)?.payload).toMatchObject({
      toolCallId: 'mcp-1',
      toolName: 'docs.search',
      input: { q: 'runtime' }
    });
    expect(events.at(3)?.payload?.resultSummary).toBe('{"count":1}');
    expect(events.at(4)?.payload).toMatchObject({
      toolCallId: 'mcp-2',
      toolName: 'docs.fetch',
      error: 'not found'
    });
  });

  it('surfaces turn failures as failed agent runs', async () => {
    const fakeThread: CodexThreadLike = {
      id: null,
      async runStreamed() {
        return {
          events: (async function* () {
            yield {
              type: 'thread.started',
              thread_id: 'codex-thread-failed'
            } satisfies ThreadEvent;
            yield {
              type: 'turn.failed',
              error: { message: 'Codex failed' }
            } satisfies ThreadEvent;
          })()
        };
      }
    };
    const adapter = new CodexAgentAdapter({
      codex: {
        startThread: () => fakeThread,
        resumeThread: () => {
          throw new Error('resumeThread should not be called');
        }
      }
    });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of adapter.run({ scope, prompt: 'fail', sandbox })) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual(['agent_start', 'provider_session_bound', 'agent_failed']);
    expect(events.at(-1)?.payload).toMatchObject({
      error: 'Codex failed',
      providerSessionId: 'codex-thread-failed'
    });
  });

  it('passes AbortSignal to streamed turns and reports timeout failures', async () => {
    const turnOptionsSeen: TurnOptions[] = [];
    const fakeThread: CodexThreadLike = {
      id: 'codex-thread-timeout',
      async runStreamed(_input, turnOptions) {
        turnOptionsSeen.push(turnOptions ?? {});
        return {
          events: (async function* () {
            await new Promise((resolve) => setTimeout(resolve, 15));
            yield {
              type: 'turn.started'
            } satisfies ThreadEvent;
          })()
        };
      }
    };
    const adapter = new CodexAgentAdapter({
      codex: {
        startThread: () => fakeThread,
        resumeThread: () => {
          throw new Error('resumeThread should not be called');
        }
      },
      timeoutMs: 1
    });
    const events: AgentRuntimeEvent[] = [];

    for await (const event of adapter.run({ scope, prompt: 'timeout', sandbox })) {
      events.push(event);
    }

    expect(turnOptionsSeen[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(turnOptionsSeen[0]?.signal?.aborted).toBe(true);
    expect(events.map((event) => event.type)).toEqual(['agent_start', 'agent_failed']);
    expect(events.at(-1)?.payload).toMatchObject({
      error: 'Codex agent timed out after 1ms',
      providerSessionId: 'codex-thread-timeout'
    });
  });

  it('injects provider-neutral continuity context into the Codex prompt', async () => {
    let promptSeen = '';
    const fakeThread: CodexThreadLike = {
      id: 'codex-thread-1',
      async runStreamed(input) {
        promptSeen = input;
        return {
          events: (async function* () {
            yield {
              type: 'turn.completed',
              usage: {
                input_tokens: 1,
                cached_input_tokens: 0,
                output_tokens: 1,
                reasoning_output_tokens: 0
              }
            } satisfies ThreadEvent;
          })()
        };
      }
    };
    const fakeCodex: CodexClientLike = {
      startThread() {
        return fakeThread;
      },
      resumeThread() {
        throw new Error('resumeThread should not be called');
      }
    };
    const adapter = new CodexAgentAdapter({ codex: fakeCodex });

    for await (const _event of adapter.run({
      continuity: {
        fromOrdinal: 3,
        previousProviderSessionId: 'codex-thread-old',
        sourceRunIds: ['run-old'],
        strategy: 'compact',
        summary: 'Prior provider transcript was compacted.',
        toOrdinal: 8
      },
      scope,
      prompt: 'continue',
      sandbox
    })) {
      // Drain events.
    }

    expect(promptSeen).toContain('Provider session continuity context:');
    expect(promptSeen).toContain('- strategy: compact');
    expect(promptSeen).toContain('- previous provider session id: codex-thread-old');
    expect(promptSeen).toContain('User message:\ncontinue');
  });
});
