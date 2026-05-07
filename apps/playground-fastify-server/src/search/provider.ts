export type WebSearchRequest = {
  query: string;
  maxResults?: number;
  topic?: 'general' | 'news';
  searchDepth?: 'basic' | 'advanced';
};

export type WebSearchResultItem = {
  rank: number;
  title: string;
  url: string;
  snippet: string;
  sourceName: string;
  hostname: string;
  publishedAt?: string | null;
};

export type WebSearchResponse = {
  query: string;
  provider: string;
  answer?: string | null;
  results: WebSearchResultItem[];
  retrievedAt: string;
};

export interface WebSearchProvider {
  search(input: WebSearchRequest): Promise<WebSearchResponse>;
}
