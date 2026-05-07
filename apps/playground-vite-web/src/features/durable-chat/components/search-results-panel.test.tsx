import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SearchResultsPanel } from './search-results-panel';
import type { ActiveSearchPanelData } from '@/features/durable-chat/types/search';

function createSearchResult(): ActiveSearchPanelData {
  return {
    runId: 'run-1',
    toolCallIds: ['call-1'],
    provider: 'tavily',
    resultCount: 1,
    sourceNames: ['The Verge'],
    sections: [
      {
        toolCallId: 'call-1',
        query: 'Claude latest news',
        resultCount: 1,
        retrievedAt: '2026-05-08T00:00:00.000Z',
        results: [
          {
            rank: 0,
            title: 'Claude gets a new update',
            url: 'https://www.theverge.com/claude-update',
            snippet: 'Anthropic announced a new Claude release.',
            sourceName: 'The Verge',
            hostname: 'theverge.com',
            publishedAt: '2026-05-08T00:00:00.000Z'
          }
        ]
      }
    ]
  };
}

describe('SearchResultsPanel', () => {
  it('renders a loading state', () => {
    const markup = renderToStaticMarkup(
      <SearchResultsPanel open loading error={null} result={null} onClose={() => {}} />
    );

    expect(markup).toContain('搜索结果');
    expect(markup).toContain('正在加载搜索结果...');
  });

  it('renders an error state', () => {
    const markup = renderToStaticMarkup(
      <SearchResultsPanel open={true} loading={false} error="Search failed." result={null} onClose={() => {}} />
    );

    expect(markup).toContain('Search failed.');
  });

  it('renders populated search results', () => {
    const markup = renderToStaticMarkup(
      <SearchResultsPanel open loading={false} error={null} result={createSearchResult()} onClose={() => {}} />
    );

    expect(markup).toContain('Claude latest news');
    expect(markup).toContain('Claude gets a new update');
    expect(markup).toContain('Anthropic announced a new Claude release.');
    expect(markup).toContain('The Verge');
  });
});
