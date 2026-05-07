import { describe, expect, it } from 'vitest';

import { buildSearchResultLabelViewModel, buildSearchStatusLabelViewModel } from '@/features/durable-chat/service/search-label-presentation';
import type { SearchSummaryBlock } from '@/features/durable-chat/types/transcript-blocks';

const summary: SearchSummaryBlock = {
  runId: 'run-1',
  entries: [
    {
      toolCallId: 'tool-1',
      query: 'latest claude news',
      resultCount: 10,
      sourceNames: ['TechCrunch', 'WSJ'],
      sources: [
        { hostname: 'techcrunch.com', sourceName: 'TechCrunch' },
        { hostname: 'wsj.com', sourceName: 'WSJ' }
      ]
    },
    {
      toolCallId: 'tool-2',
      query: 'claude updates',
      resultCount: 5,
      sourceNames: ['TechCrunch', 'Ars Technica'],
      sources: [
        { hostname: 'techcrunch.com', sourceName: 'TechCrunch' },
        { hostname: 'arstechnica.com', sourceName: 'Ars Technica' }
      ]
    }
  ]
};

describe('search label presentation', () => {
  it('builds a search result label with deduplicated sources', () => {
    expect(buildSearchResultLabelViewModel(summary)).toEqual({
      totalResults: 15,
      text: '已阅读 15 个网页',
      sources: [
        { hostname: 'techcrunch.com', sourceName: 'TechCrunch' },
        { hostname: 'wsj.com', sourceName: 'WSJ' },
        { hostname: 'arstechnica.com', sourceName: 'Ars Technica' }
      ]
    });
  });

  it('builds searching status text with a query when present', () => {
    expect(buildSearchStatusLabelViewModel('latest claude news')).toEqual({
      isSearching: true,
      state: 'searching',
      text: '正在搜索网页 · latest claude news'
    });
  });

  it('builds failed/completed status text without a query', () => {
    expect(buildSearchStatusLabelViewModel(undefined, 'failed')).toEqual({
      isSearching: false,
      state: 'failed',
      text: '网页搜索失败'
    });

    expect(buildSearchStatusLabelViewModel(undefined, 'completed')).toEqual({
      isSearching: false,
      state: 'completed',
      text: '网页搜索完成'
    });
  });
});
