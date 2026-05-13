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

export function isPlaygroundWebSearchConfigured() {
  return Boolean(process.env.TAVILY_API_KEY?.trim());
}

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
    const [
      { TavilySearchProvider },
      { createRunSearchPlannerState },
      { createPolicyAwareSearchWebTool, resolveSearchPlannerMode },
      { createOpenUrlTool }
    ] = await Promise.all([
      import('@/search/tavily-provider'),
      import('@/tools/search-planner'),
      import('@/tools/search-web-with-policy'),
      import('@/tools/open-url')
    ]);
    const tavilyApiKey = process.env.TAVILY_API_KEY?.trim();

    return {
      tools: (context) => {
        if (!context.webSearchEnabled || !tavilyApiKey) {
          return [];
        }

        const plannerState = createRunSearchPlannerState(resolveSearchPlannerMode(context.model));

        return [
          createPolicyAwareSearchWebTool({
            plannerState,
            provider: new TavilySearchProvider({
              apiKey: tavilyApiKey
            })
          }),
          createOpenUrlTool({
            plannerState
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
    },
    async generateText(input) {
      try {
        return await durableRuntime.generateText(input);
      } catch (error) {
        throw mapRuntimePiConfigError(error);
      }
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
