import { describe, expect, it } from 'vitest';

import { buildSearchResultsPanelViewModel, formatSearchPanelDateLabel } from '@/features/durable-chat/service/search-panel-presentation';
import type { ActiveSearchPanelData } from '@/features/durable-chat/types/search';

const result: ActiveSearchPanelData = {
  runId: 'run-1',
  toolCallIds: ['tool-1'],
  provider: 'tavily',
  resultCount: 10,
  sourceNames: ['TechCrunch', 'The Verge'],
  sections: [
    {
      toolCallId: 'tool-1',
      query: 'latest claude news',
      resultCount: 10,
      retrievedAt: '2026-05-08T00:00:00.000Z',
      results: [
        {
          rank: 1,
          title: 'Claude update',
          url: 'https://example.com/claude',
          snippet: 'A concise summary',
          sourceName: 'TechCrunch',
          hostname: 'techcrunch.com',
          publishedAt: '2026-05-08T00:00:00.000Z'
        }
      ]
    }
  ]
};

describe('search panel presentation', () => {
  it('formats a published date label for panel items', () => {
    expect(formatSearchPanelDateLabel('2026-05-08T00:00:00.000Z')).toBe('05/08');
    expect(formatSearchPanelDateLabel('not-a-date')).toBeNull();
    expect(formatSearchPanelDateLabel(null)).toBeNull();
  });

  it('builds a presentation view-model for the search panel', () => {
    expect(buildSearchResultsPanelViewModel(result)).toEqual({
      subtitle: '已阅读 10 个网页 · TechCrunch · The Verge',
      sections: [
        {
          toolCallId: 'tool-1',
          query: 'latest claude news',
          results: [
            {
              key: 'tool-1:1:https://example.com/claude',
              rank: 1,
              title: 'Claude update',
              url: 'https://example.com/claude',
              snippet: 'A concise summary',
              sourceName: 'TechCrunch',
              hostname: 'techcrunch.com',
              publishedAtLabel: '05/08'
            }
          ]
        }
      ]
    });
  });

  it('returns null when no panel result is available', () => {
    expect(buildSearchResultsPanelViewModel(null)).toBeNull();
  });
});
