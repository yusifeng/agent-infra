import { performance } from 'node:perf_hooks';

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
  },
  async generateText() {
    throw new RuntimeUnavailableError('runtime execution is not configured for playground app services');
  }
};

let playgroundAppServicesPromise: Promise<PlaygroundAppServices> | null = null;
const playgroundAppServicesState = {
  initialized: false,
  initializing: false,
  lastInitDurationMs: null as number | null
};

async function buildPlaygroundAppServices(): Promise<PlaygroundAppServices> {
  playgroundAppServicesState.initializing = true;
  const startedAt = performance.now();

  try {
    const base = await getPlaygroundBaseServices();
    const services = createPlaygroundAppServices(base, unavailableRuntimePort);
    playgroundAppServicesState.initialized = true;
    playgroundAppServicesState.lastInitDurationMs = Number((performance.now() - startedAt).toFixed(1));
    return services;
  } finally {
    playgroundAppServicesState.initializing = false;
  }
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

export function getPlaygroundAppServicesState() {
  return { ...playgroundAppServicesState };
}
