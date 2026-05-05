export type { ChatPhase, DurableRecoveryState, MainChatResponseStatus } from '@agent-infra/durable-chat-client';

export type DurableChatRuntimeOptions = {
  initialThreadId?: string | null;
};
