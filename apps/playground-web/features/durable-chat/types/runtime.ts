export type ChatPhase = 'idle' | 'thinking' | 'streaming' | 'transcript-final' | 'failed';

export type DurableChatRuntimeOptions = {
  initialThreadId?: string | null;
};
