export type ChatPhase = 'idle' | 'thinking' | 'streaming' | 'transcript-final' | 'failed';

export type MainChatResponseStatus = 'idle' | 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export type DurableRecoveryPhase = 'idle' | 'recovering' | 'restored';

export type DurableRecoveryState = {
  phase: DurableRecoveryPhase;
  message: string | null;
};
