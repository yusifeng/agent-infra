export type ChatPhase = 'idle' | 'thinking' | 'streaming' | 'transcript-final' | 'failed';

export type DurableRecoveryPhase = 'idle' | 'recovering' | 'restored';

export type DurableRecoveryState = {
  phase: DurableRecoveryPhase;
  message: string | null;
};
