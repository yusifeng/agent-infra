import crypto from 'node:crypto';

import type { AgentInfraRuntimePort } from '@agent-infra/app';
import { createDbConfigFromEnv } from '@agent-infra/db';
import {
  createDurableChatAppServices,
  createDurableChatBaseServices,
  type DurableChatAppServices,
  type DurableChatBaseServices
} from '@agent-infra/durable-chat-server';

export type PlaygroundBaseServices = DurableChatBaseServices;
export type PlaygroundAppServices = DurableChatAppServices;

let playgroundBaseServicesPromise: Promise<PlaygroundBaseServices> | null = null;

async function buildPlaygroundBaseServices(): Promise<PlaygroundBaseServices> {
  return createDurableChatBaseServices(createDbConfigFromEnv());
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

export function createPlaygroundAppServices(
  base: PlaygroundBaseServices,
  runtime: AgentInfraRuntimePort
): PlaygroundAppServices {
  return createDurableChatAppServices(base, runtime, {
    idGenerator: () => crypto.randomUUID(),
    now: () => new Date()
  });
}
