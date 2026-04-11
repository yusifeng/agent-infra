import { RuntimeUnavailableError, type AgentInfraRuntimePort } from '@agent-infra/app';

import { createPlaygroundAppServices, getPlaygroundBaseServices, type PlaygroundAppServices } from './playground-base-services';

let playgroundReadServicesPromise: Promise<PlaygroundAppServices> | null = null;

const readOnlyRuntimePort: AgentInfraRuntimePort = {
  async prepare() {
    throw new RuntimeUnavailableError('runtime execution is not configured for read-only playground services');
  },
  async runTextTurn() {
    throw new RuntimeUnavailableError('runtime execution is not configured for read-only playground services');
  }
};

async function buildPlaygroundReadServices(): Promise<PlaygroundAppServices> {
  const base = await getPlaygroundBaseServices();
  return createPlaygroundAppServices(base, readOnlyRuntimePort);
}

export async function getPlaygroundReadServices(): Promise<PlaygroundAppServices> {
  if (!playgroundReadServicesPromise) {
    playgroundReadServicesPromise = buildPlaygroundReadServices().catch((error) => {
      playgroundReadServicesPromise = null;
      throw error;
    });
  }

  return playgroundReadServicesPromise;
}
