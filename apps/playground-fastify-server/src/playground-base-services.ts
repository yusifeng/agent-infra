import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';

import type { AgentInfraRuntimePort } from '@agent-infra/app';
import { createDbConfigFromEnv } from '@agent-infra/db';
import {
  createDurableChatAppServices,
  createDurableChatBaseServices,
  type DurableChatAppServices,
  type DurableChatBaseServices
} from '@agent-infra/durable-chat-server';

import { bootstrapPlaygroundAuthSchema } from './features/auth/repo/schema.js';
import { bootstrapPlaygroundThreadCatalog } from './features/thread-catalog/repo/schema.js';

export type PlaygroundBaseServices = DurableChatBaseServices;
export type PlaygroundAppServices = DurableChatAppServices;

let playgroundBaseServicesPromise: Promise<PlaygroundBaseServices> | null = null;
const playgroundBaseServicesState = {
  initialized: false,
  initializing: false,
  lastInitDurationMs: null as number | null
};

async function buildPlaygroundBaseServices(): Promise<PlaygroundBaseServices> {
  playgroundBaseServicesState.initializing = true;
  const startedAt = performance.now();

  try {
    const dbConfig = createDbConfigFromEnv();
    const services = await createDurableChatBaseServices(dbConfig);
    await bootstrapPlaygroundAuthSchema(dbConfig);
    await bootstrapPlaygroundThreadCatalog(dbConfig);
    playgroundBaseServicesState.initialized = true;
    playgroundBaseServicesState.lastInitDurationMs = Number((performance.now() - startedAt).toFixed(1));
    return services;
  } finally {
    playgroundBaseServicesState.initializing = false;
  }
}

export async function getPlaygroundBaseServices(): Promise<PlaygroundBaseServices> {
  if (!playgroundBaseServicesPromise) {
    playgroundBaseServicesPromise = buildPlaygroundBaseServices().catch((error) => {
      playgroundBaseServicesPromise = null;
      throw error;
    });
  }

  return playgroundBaseServicesPromise;
}

export function getPlaygroundBaseServicesState() {
  return { ...playgroundBaseServicesState };
}

export function createPlaygroundAppServices(
  base: PlaygroundBaseServices,
  runtime: AgentInfraRuntimePort
): PlaygroundAppServices {
  return createDurableChatAppServices(base, runtime, {
    idGenerator: () => crypto.randomUUID(),
    now: () => new Date()
  });
}
