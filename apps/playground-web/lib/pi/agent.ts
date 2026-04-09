'use client';

type PiAgentCoreModule = Record<string, unknown>;
type PiAiModule = Record<string, unknown>;

function pickAgentCtor(piAgentCore: PiAgentCoreModule): new (...args: any[]) => unknown {
  const candidate = piAgentCore.Agent;
  if (typeof candidate !== 'function') {
    throw new Error('[pi] Missing Agent export from @mariozechner/pi-agent-core');
  }
  return candidate as new (...args: any[]) => unknown;
}

function createModel(piAi: PiAiModule): unknown {
  const createOpenAIModel = piAi.createOpenAIModel as ((config?: Record<string, unknown>) => unknown) | undefined;
  if (typeof createOpenAIModel === 'function') {
    return createOpenAIModel({ model: 'gpt-4o-mini' });
  }

  const openai = piAi.openai as ((model: string) => unknown) | undefined;
  if (typeof openai === 'function') {
    return openai('gpt-4o-mini');
  }

  return undefined;
}

export function createPiAgent(piAgentCore: PiAgentCoreModule, piAi: PiAiModule): unknown {
  const Agent = pickAgentCtor(piAgentCore);

  const model = createModel(piAi);
  return new Agent({
    name: 'agent-infra-pi-experiment',
    system:
      'You are the pi-web-ui experiment assistant in agent-infra. Keep answers concise, pragmatic, and focused on helping evaluate the pi chat UX.',
    ...(model ? { model } : {})
  });
}
