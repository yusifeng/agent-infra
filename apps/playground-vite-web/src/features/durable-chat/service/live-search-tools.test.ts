import { describe, expect, it } from 'vitest';

import type { LiveAssistantSegment } from '@agent-infra/durable-chat-client';

import { collectLiveSearchEntries } from './live-search-tools';

function createSegment(overrides: Partial<LiveAssistantSegment> = {}): LiveAssistantSegment {
  return {
    id: overrides.id ?? 'segment-1',
    messageId: overrides.messageId ?? 'message-1',
    text: overrides.text ?? '',
    reasoning: overrides.reasoning ?? null,
    tools: overrides.tools ?? [],
    eventType: overrides.eventType ?? 'streaming'
  };
}

describe('collectLiveSearchEntries', () => {
  it('returns every searchWeb tool in segment order', () => {
    const entries = collectLiveSearchEntries(
      createSegment({
        tools: [
          {
            toolCallId: 'call-search-1',
            toolName: 'searchWeb',
            phase: 'completed',
            input: { query: 'Claude latest news' }
          },
          {
            toolCallId: 'call-runtime',
            toolName: 'getRuntimeInfo',
            phase: 'completed',
            input: {}
          },
          {
            toolCallId: 'call-search-2',
            toolName: 'searchWeb',
            phase: 'start',
            input: { query: 'Claude deeper search' }
          }
        ]
      })
    );

    expect(entries).toEqual([
      {
        toolCallId: 'call-search-1',
        query: 'Claude latest news',
        state: 'completed'
      },
      {
        toolCallId: 'call-search-2',
        query: 'Claude deeper search',
        state: 'start'
      }
    ]);
  });
});
