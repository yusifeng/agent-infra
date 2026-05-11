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
    expect(visibleSegments[0]?.searchEntries).toEqual({
      isSearching: true,
      text: '正在搜索网页'
    });
    expect(hasVisibleLiveAssistantContent(draft)).toBe(true);
  });

  it('upgrades completed live search labels with cached panel data', () => {
    const draft = createLiveDraft({
      runId: 'run-1',
      segments: [
        {
          id: 'seg-search-completed',
          messageId: 'message-1',
          text: '',
          reasoning: null,
          tools: [
            {
              toolCallId: 'call-1',
              toolName: 'searchWeb',
              phase: 'completed',
              input: { query: '速水玲香 金田一少年事件簿' }
            }
          ],
          eventType: 'streaming'
        }
      ]
    });

    const visibleSegments = buildVisibleLiveAssistantSegments(draft, () => ({
      runId: 'run-1',
      toolCallIds: ['call-1'],
      provider: 'tavily',
      resultCount: 9,
      sourceNames: ['百度百科'],
      sections: [
        {
          toolCallId: 'call-1',
          query: '速水玲香 金田一少年事件簿',
          resultCount: 9,
          results: [
            {
              rank: 1,
              title: '速水玲香',
              url: 'https://baike.baidu.com/item/x',
              snippet: '...',
              sourceName: '百度百科',
              hostname: 'baike.baidu.com',
              publishedAt: null
            }
          ]
        }
      ]
    }));

    expect(visibleSegments[0]?.searchEntries).toEqual({
      isSearching: false,
      text: '搜索到 9 个网页',
      searchToolCallIds: ['call-1'],
      sources: [
        {
          hostname: 'baike.baidu.com',
          sourceName: '百度百科'
        }
      ]
    });
  });
});
