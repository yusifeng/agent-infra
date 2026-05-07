import { performance } from 'node:perf_hooks';

import {
  RuntimeSelectionError,
  RuntimeUnavailableError,
  type AgentInfraRuntimePort
} from '@agent-infra/app';
import { createLazyPiRuntime } from '@agent-infra/runtime-pi/lazy';
import type { RuntimePiRuntime } from '@agent-infra/runtime-pi/types';

import {
  createPlaygroundAppServices,
  getPlaygroundBaseServices,
  type PlaygroundAppServices
} from './playground-base-services.js';

type PlaygroundRuntimeServices = PlaygroundAppServices & {
  durableRuntime: RuntimePiRuntime;
};

let playgroundRuntimeServicesPromise: Promise<PlaygroundRuntimeServices> | null = null;
const playgroundRuntimeServicesState = {
  initialized: false,
  initializing: false,
  lastInitDurationMs: null as number | null
};

function mapRuntimePiConfigError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown runtime-pi configuration error';

  if (
    message.includes('Unknown OpenAI model') ||
    message.includes('Unknown DeepSeek model') ||
    message.includes('Unsupported runtime-pi model selection') ||
    message.includes('could not infer a provider') ||
    message.includes('requires both provider and model')
  ) {
    return new RuntimeSelectionError(message, error);
  }

  return new RuntimeUnavailableError(message, error);
}

async function buildPlaygroundRuntimeServices(): Promise<PlaygroundRuntimeServices> {
  playgroundRuntimeServicesState.initializing = true;
  const startedAt = performance.now();
  const base = await getPlaygroundBaseServices();
  const durableRuntime = createLazyPiRuntime(async () => {
    const [{ TavilySearchProvider }, { createSearchWebTool }] = await Promise.all([
      import('./search/tavily-provider.js'),
      import('./tools/search-web.js')
    ]);
    const tavilyApiKey = process.env.TAVILY_API_KEY?.trim();

    return {
      tools: (context) => {
        if (!context.webSearchEnabled || !tavilyApiKey) {
          return [];
        }

        return [
          createSearchWebTool({
            provider: new TavilySearchProvider({
              apiKey: tavilyApiKey
            })
          })
        ];
      }
    };
  });

  const runtimePort: AgentInfraRuntimePort = {
    async prepare(preferred) {
      try {
        return await durableRuntime.prepare(preferred);
      } catch (error) {
        throw mapRuntimePiConfigError(error);
      }
    },
    async runTextTurn(repositories, input) {
      await durableRuntime.runTurn(
        {
          runRepo: repositories.runRepo,
          messageRepo: repositories.messageRepo,
          toolRepo: repositories.toolRepo,
          runEventRepo: repositories.runEventRepo
        },
        input
      );
    }
  };

  const appServices = createPlaygroundAppServices(base, runtimePort);

  const services = {
    ...appServices,
    durableRuntime
  };
  playgroundRuntimeServicesState.initialized = true;
  playgroundRuntimeServicesState.lastInitDurationMs = Number((performance.now() - startedAt).toFixed(1));
  playgroundRuntimeServicesState.initializing = false;

  return services;
}

export async function getPlaygroundRuntimeServices(): Promise<PlaygroundRuntimeServices> {
  if (!playgroundRuntimeServicesPromise) {
    playgroundRuntimeServicesPromise = buildPlaygroundRuntimeServices().catch((error) => {
      playgroundRuntimeServicesPromise = null;
      playgroundRuntimeServicesState.initializing = false;
      throw error;
    });
  }

  return playgroundRuntimeServicesPromise;
}

export function getPlaygroundRuntimeServicesState() {
  return { ...playgroundRuntimeServicesState };
}
