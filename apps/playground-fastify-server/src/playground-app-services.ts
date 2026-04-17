import { RuntimeUnavailableError, type AgentInfraRuntimePort } from '@agent-infra/app';

import {
  createPlaygroundAppServices,
  getPlaygroundBaseServices,
  type PlaygroundAppServices
} from './playground-base-services.js';

const unavailableRuntimePort: AgentInfraRuntimePort = {
  async prepare() {
    throw new RuntimeUnavailableError('runtime execution is not configured for playground app services');
  },
  async runTextTurn() {
    throw new RuntimeUnavailableError('runtime execution is not configured for playground app services');
  }
};

let playgroundAppServicesPromise: Promise<PlaygroundAppServices> | null = null;

async function buildPlaygroundAppServices(): Promise<PlaygroundAppServices> {
  const base = await getPlaygroundBaseServices();
  return createPlaygroundAppServices(base, unavailableRuntimePort);
}

export async function getPlaygroundAppServices(): Promise<PlaygroundAppServices> {
  if (!playgroundAppServicesPromise) {
    playgroundAppServicesPromise = buildPlaygroundAppServices().catch((error) => {
      playgroundAppServicesPromise = null;
      throw error;
    });
  }

  return playgroundAppServicesPromise;
}
