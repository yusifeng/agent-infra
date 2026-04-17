import {
  RuntimeSelectionError,
  RuntimeUnavailableError,
  type AgentInfraRuntimePort
} from '@agent-infra/app';
import { createLazyPiRuntime } from '@agent-infra/runtime-pi/lazy';
import type { RuntimePiRuntime } from '@agent-infra/runtime-pi/types';

import { createPlaygroundAppServices, getPlaygroundBaseServices, type PlaygroundAppServices } from './playground-base-services';

type PlaygroundRuntimeServices = PlaygroundAppServices & {
  durableRuntime: RuntimePiRuntime;
};

let playgroundRuntimeServicesPromise: Promise<PlaygroundRuntimeServices> | null = null;

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
  const base = await getPlaygroundBaseServices();
  const durableRuntime = createLazyPiRuntime(async () => {
    const { createDemoTools } = await import('@agent-infra/runtime-pi/tools');

    return {
      tools: (context) => createDemoTools(context)
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

  return {
    ...appServices,
    durableRuntime
  };
}

export async function getPlaygroundRuntimeServices(): Promise<PlaygroundRuntimeServices> {
  if (!playgroundRuntimeServicesPromise) {
    playgroundRuntimeServicesPromise = buildPlaygroundRuntimeServices().catch((error) => {
      playgroundRuntimeServicesPromise = null;
      throw error;
    });
  }

  return playgroundRuntimeServicesPromise;
}

export const getPlaygroundServices = getPlaygroundRuntimeServices;
