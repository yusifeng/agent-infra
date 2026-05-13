export type SearchPanelResultItem = {
  rank: number;
  title: string;
  url: string;
  snippet: string;
  sourceName: string;
  hostname: string;
  publishedAt?: string | null;
};

export type SearchPanelSection = {
  toolCallId: string;
  query: string;
  resultCount: number;
  retrievedAt?: string | null;
  results: SearchPanelResultItem[];
};

export type ActiveSearchPanelData = {
  runId: string;
  toolCallIds: string[];
  provider: string;
  resultCount: number;
  sourceNames: string[];
  sections: SearchPanelSection[];
};
