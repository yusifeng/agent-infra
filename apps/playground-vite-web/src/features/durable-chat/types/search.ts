export type SearchPanelResultItem = {
  rank: number;
  title: string;
  url: string;
  snippet: string;
  sourceName: string;
  publishedAt?: string | null;
};

export type ActiveSearchPanelData = {
  runId: string;
  toolCallId: string;
  query: string;
  provider: string;
  resultCount: number;
  retrievedAt?: string | null;
  results: SearchPanelResultItem[];
};
