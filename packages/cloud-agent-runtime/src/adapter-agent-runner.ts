import type { AgentAdapter, AgentRunInput, AgentRunner, AgentRuntimeEvent, AgentRunResult } from './types.js';

export interface AdapterAgentRunnerOptions {
  adapter: AgentAdapter;
  onEvent?: (event: AgentRuntimeEvent) => void | Promise<void>;
}

export class AdapterAgentRunner implements AgentRunner {
  private readonly adapter: AgentAdapter;
  private readonly onEvent?: (event: AgentRuntimeEvent) => void | Promise<void>;

  constructor(options: AdapterAgentRunnerOptions) {
    this.adapter = options.adapter;
    this.onEvent = options.onEvent;
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const events: AgentRuntimeEvent[] = [];
    let content = '';
    let failure: string | null = null;
    let providerSessionId: string | null = input.providerSession?.providerSessionId ?? null;

    for await (const event of this.adapter.run(input)) {
      events.push(event);
      await this.onEvent?.(event);

      if (event.type === 'agent_completed') {
        content = readEventString(event, 'content') ?? content;
        providerSessionId = readEventString(event, 'providerSessionId') ?? providerSessionId;
      }

      if (event.type === 'agent_failed') {
        failure = readEventString(event, 'error') ?? 'Agent run failed.';
        providerSessionId = readEventString(event, 'providerSessionId') ?? providerSessionId;
      }
    }

    return {
      content,
      events,
      failure,
      providerSessionId
    };
  }
}

function readEventString(event: AgentRuntimeEvent, key: string): string | null {
  const value = event.payload?.[key];
  return typeof value === 'string' ? value : null;
}
