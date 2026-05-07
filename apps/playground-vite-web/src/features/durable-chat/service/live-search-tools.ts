import type { LiveAssistantSegment, LiveAssistantToolState } from '@agent-infra/durable-chat-client';

export type LiveSearchEntry = {
  toolCallId: string;
  query: string;
  state: LiveAssistantToolState['phase'];
};

export function collectLiveSearchEntries(segment: LiveAssistantSegment): LiveSearchEntry[] {
  return segment.tools
    .filter((tool) => tool.toolName === 'searchWeb')
    .map((tool) => ({
      toolCallId: tool.toolCallId,
      query: typeof tool.input?.query === 'string' ? tool.input.query : '',
      state: tool.phase
    }));
}
