'use client';

import type { ComponentType } from 'react';

import { createPiAgent } from './agent';
import { initPiStorage } from './storage';

export type PiRuntimeState = {
  ChatPanel: ComponentType<Record<string, unknown>>;
  agent: unknown;
};

export async function loadPiRuntime(): Promise<PiRuntimeState> {
  const [piWebUi, piAgentCore, piAi] = await Promise.all([
    import('@mariozechner/pi-web-ui'),
    import('@mariozechner/pi-agent-core'),
    import('@mariozechner/pi-ai')
  ]);

  initPiStorage(piWebUi as unknown as Record<string, unknown>);
  const agent = createPiAgent(piAgentCore as unknown as Record<string, unknown>, piAi as unknown as Record<string, unknown>);

  const ChatPanel = (piWebUi.ChatPanel ?? piWebUi.Chat) as ComponentType<Record<string, unknown>> | undefined;
  if (!ChatPanel) {
    throw new Error('[pi] Missing ChatPanel export from @mariozechner/pi-web-ui');
  }

  return {
    ChatPanel,
    agent
  };
}
