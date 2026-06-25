import { describe, expect, it } from 'vitest';

import { AdapterAgentRunner } from '../src/adapter-agent-runner';
import type { AgentAdapter, AgentRuntimeEvent, RuntimeScope, SandboxSession } from '../src/types';

const scope: RuntimeScope = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  workspaceId: 'workspace-1',
  threadId: 'thread-1',
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

describe('AdapterAgentRunner', () => {
  it('collects adapter lifecycle events into a run result', async () => {
    const adapter: AgentAdapter = {
      provider: 'test',
      async *run() {
        yield {
          type: 'agent_start',
          payload: { provider: 'test' }
        } satisfies AgentRuntimeEvent;
        yield {
          type: 'agent_completed',
          payload: {
            content: 'done',
            providerSessionId: 'provider-session-1'
          }
        } satisfies AgentRuntimeEvent;
      }
    };
    const runner = new AdapterAgentRunner({ adapter });

    const result = await runner.run({
      scope,
      prompt: 'hello',
      sandbox
    });

    expect(result.content).toBe('done');
    expect(result.providerSessionId).toBe('provider-session-1');
    expect(result.failure).toBeNull();
    expect(result.events.map((event) => event.type)).toEqual(['agent_start', 'agent_completed']);
  });
});
