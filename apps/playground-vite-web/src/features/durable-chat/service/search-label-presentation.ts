import type { SearchSummaryBlock } from '@/features/durable-chat/types/transcript-blocks';

export type SearchResultLabelSource = {
  hostname: string;
  sourceName: string;
};

export type SearchResultLabelViewModel = {
  totalResults: number;
  text: string;
  sources: SearchResultLabelSource[];
};

export type SearchStatusLabelState = 'searching' | 'completed' | 'failed';

export type SearchStatusLabelViewModel = {
  isSearching: boolean;
  state: SearchStatusLabelState;
  text: string;
};

export function buildSearchResultLabelViewModel(summary: SearchSummaryBlock): SearchResultLabelViewModel {
  const totalResults = summary.entries.reduce((total, entry) => total + entry.resultCount, 0);
  const sources = Array.from(
    new Map(
      summary.entries
        .flatMap((entry) => entry.sources)
        .filter((source) => source.sourceName && source.hostname)
        .map((source) => [`${source.hostname}:${source.sourceName}`, source])
    ).values()
  ).slice(0, 4);

  return {
    totalResults,
    text: `已阅读 ${totalResults} 个网页`,
    sources
  };
}

export function buildSearchStatusLabelViewModel(
  query?: string,
  state: SearchStatusLabelState = 'searching'
): SearchStatusLabelViewModel {
  return {
    isSearching: state === 'searching',
    state,
    text:
      state === 'searching'
        ? query
          ? `正在搜索网页 · ${query}`
          : '正在搜索网页...'
        : state === 'failed'
          ? '网页搜索失败'
          : '网页搜索完成'
  };
}
