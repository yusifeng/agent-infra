export type LiveAssistantToolState = {
  toolCallId: string;
  toolName: string;
  phase: 'start' | 'completed' | 'failed';
  input?: Record<string, unknown> | null;
};

export type LiveAssistantSegment = {
  id: string;
  messageId: string;
  text: string;
  reasoning: string | null;
  tools: LiveAssistantToolState[];
  eventType: 'start' | 'thinking' | 'streaming' | 'searching';
};

export type LiveAssistantDraft = {
  runId: string;
  messageId: string;
  source?: 'live' | 'restored';
  committedText: string;
  partialText: string;
  segmentText: string;
  segmentTextMessageId: string | null;
  partialReasoning: string | null;
  segmentReasoningMessageId: string | null;
  activeTools: LiveAssistantToolState[];
  eventType: 'start' | 'thinking' | 'streaming' | 'searching';
  segments: LiveAssistantSegment[];
};
