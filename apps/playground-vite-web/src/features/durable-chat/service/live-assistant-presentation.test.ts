import { describe, expect, it } from 'vitest';

import { buildVisibleLiveAssistantSegments, collectLiveDraftCopyText, hasVisibleLiveAssistantContent } from './live-assistant-presentation';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';

function createLiveDraft(overrides: Partial<LiveAssistantDraft> = {}): LiveAssistantDraft {
  return {
    runId: 'run-1',
    messageId: 'message-1',
    source: 'live',
    committedText: '',
    partialText: '',
    segmentText: '',
    segmentTextMessageId: null,
    partialReasoning: null,
    segmentReasoningMessageId: null,
    activeTools: [],
    eventType: 'streaming',
    segments: [],
    ...overrides
  };
}

describe('live assistant presentation', () => {
  it('collects copy text across visible text and reasoning segments', () => {
    const draft = createLiveDraft({
      segments: [
        {
          id: 'seg-1',
          messageId: 'message-1',
          text: 'text 1',
          reasoning: 'reasoning 1',
          tools: [],
          eventType: 'streaming'
        },
        {
          id: 'seg-2',
          messageId: 'message-1',
          text: 'text 2',
          reasoning: null,
          tools: [],
          eventType: 'streaming'
        }
      ]
    });

    expect(collectLiveDraftCopyText(draft)).toBe('reasoning 1\n\ntext 1\n\ntext 2');
  });

  it('filters out empty segments but keeps search-only segments visible', () => {
    const draft = createLiveDraft({
      segments: [
        {
          id: 'seg-empty',
          messageId: 'message-1',
          text: '',
          reasoning: null,
          tools: [],
          eventType: 'streaming'
        },
        {
          id: 'seg-search',
          messageId: 'message-1',
          text: '',
          reasoning: null,
          tools: [
            {
              toolCallId: 'call-1',
              toolName: 'searchWeb',
              phase: 'start',
              input: { query: 'claude news' }
            }
          ],
          eventType: 'searching'
        }
      ]
    });

    const visibleSegments = buildVisibleLiveAssistantSegments(draft);
    expect(visibleSegments).toHaveLength(1);
    expect(visibleSegments[0]?.segment.id).toBe('seg-search');
    expect(visibleSegments[0]?.searchEntries).toHaveLength(1);
    expect(hasVisibleLiveAssistantContent(draft)).toBe(true);
  });
});
