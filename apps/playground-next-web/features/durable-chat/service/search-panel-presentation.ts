import type { ActiveSearchPanelData } from '@/features/durable-chat/types/search';

export type SearchResultsPanelViewModel = {
  subtitle: string | null;
  sections: Array<{
    toolCallId: string;
    query: string;
    results: Array<{
      key: string;
      rank: number;
      title: string;
      url: string;
      snippet: string;
      sourceName: string;
      hostname: string;
      publishedAtLabel: string | null;
    }>;
  }>;
};

export function formatSearchPanelDateLabel(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function buildSearchResultsPanelViewModel(result: ActiveSearchPanelData | null): SearchResultsPanelViewModel | null {
  if (!result) {
    return null;
  }

  return {
    subtitle: `已阅读 ${result.resultCount} 个网页${result.sourceNames.length > 0 ? ` · ${result.sourceNames.join(' · ')}` : ''}`,
    sections: result.sections.map((section) => ({
      toolCallId: section.toolCallId,
      query: section.query,
      results: section.results.map((item) => ({
        key: `${section.toolCallId}:${item.rank}:${item.url}`,
        rank: item.rank,
        title: item.title,
        url: item.url,
        snippet: item.snippet,
        sourceName: item.sourceName,
        hostname: item.hostname,
        publishedAtLabel: formatSearchPanelDateLabel(item.publishedAt)
      }))
    }))
  };
}
