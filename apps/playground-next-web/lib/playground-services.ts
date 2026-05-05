import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  RuntimeSelectionError,
  RuntimeUnavailableError,
  type AgentInfraRuntimePort
} from '@agent-infra/app';
import type { RuntimePiRuntime } from '@agent-infra/runtime-pi/types';

import { createPlaygroundAppServices, getPlaygroundBaseServices, type PlaygroundAppServices } from './playground-base-services';

type PlaygroundRuntimeServices = PlaygroundAppServices & {
  durableRuntime: RuntimePiRuntime;
};

type CreateLazyPiRuntime = typeof import('@agent-infra/runtime-pi/lazy').createLazyPiRuntime;
type CreateDemoTools = typeof import('@agent-infra/runtime-pi/tools').createDemoTools;

const runtimeRequire = createRequire(import.meta.url);
const RUNTIME_PI_LAZY_SPECIFIER = '@agent-infra/runtime-pi/lazy';
const RUNTIME_PI_TOOLS_SPECIFIER = '@agent-infra/runtime-pi/tools';
const RUNTIME_PI_FALLBACK_PATHS: Record<string, string> = {
  [RUNTIME_PI_LAZY_SPECIFIER]: path.resolve(process.cwd(), 'node_modules/@agent-infra/runtime-pi/dist/lazy.js'),
  [RUNTIME_PI_TOOLS_SPECIFIER]: path.resolve(process.cwd(), 'node_modules/@agent-infra/runtime-pi/dist/tools.js')
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

function resolveExternalModulePath(specifier: string) {
  try {
    return runtimeRequire.resolve(specifier);
  } catch {
    const fallbackPath = RUNTIME_PI_FALLBACK_PATHS[specifier];
    if (fallbackPath) {
      return fallbackPath;
    }

    throw new Error(`Unable to resolve external module: ${specifier}`);
  }
}

async function importExternalModule<T>(specifier: string): Promise<T> {
  const resolvedSpecifier = pathToFileURL(resolveExternalModulePath(specifier)).href;
  return await (0, eval)(`import(${JSON.stringify(resolvedSpecifier)})`) as T;
}

async function buildPlaygroundRuntimeServices(): Promise<PlaygroundRuntimeServices> {
  const base = await getPlaygroundBaseServices();
  const [{ createLazyPiRuntime }, { createDemoTools }] = await Promise.all([
    importExternalModule<{ createLazyPiRuntime: CreateLazyPiRuntime }>(RUNTIME_PI_LAZY_SPECIFIER),
    importExternalModule<{ createDemoTools: CreateDemoTools }>(RUNTIME_PI_TOOLS_SPECIFIER)
  ]);

  const durableRuntime = createLazyPiRuntime(async () => {

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
