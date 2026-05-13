import type { WebSearchProvider, WebSearchRequest, WebSearchResponse, WebSearchResultItem } from './provider';

type TavilySearchResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
  published_date?: string;
};

type TavilySearchResponse = {
  answer?: string | null;
  results?: TavilySearchResult[];
};

function clampMaxResults(value?: number) {
  if (!Number.isFinite(value)) {
    return 8;
  }

  const normalized = Math.trunc(value as number);
  return Math.min(Math.max(normalized, 1), 10);
}

function trimSnippet(value: string, maxLength = 220) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1)}…`;
}

function deriveSourceName(rawUrl: string) {
  try {
    const hostname = new URL(rawUrl).hostname.replace(/^www\./, '');
    const [firstLabel] = hostname.split('.');
    return firstLabel || hostname;
  } catch {
    return rawUrl;
  }
}

function deriveHostname(rawUrl: string) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

function normalizeResult(result: TavilySearchResult, index: number): WebSearchResultItem | null {
  const title = result.title?.trim();
  const url = result.url?.trim();

  if (!title || !url) {
    return null;
  }

  return {
    rank: index + 1,
    title,
    url,
    snippet: trimSnippet(result.content ?? ''),
    sourceName: deriveSourceName(url),
    hostname: deriveHostname(url),
    publishedAt: result.published_date?.trim() || null
  };
}

export class TavilySearchProvider implements WebSearchProvider {
  constructor(
    private readonly options: {
      apiKey: string;
      baseUrl?: string;
      fetchImpl?: typeof fetch;
    }
  ) {}

  async search(input: WebSearchRequest): Promise<WebSearchResponse> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await fetchImpl(`${this.options.baseUrl ?? 'https://api.tavily.com'}/search`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.options.apiKey}`
      },
      body: JSON.stringify({
        query: input.query,
        topic: input.topic ?? 'general',
        search_depth: input.searchDepth ?? 'basic',
        max_results: clampMaxResults(input.maxResults),
        include_answer: true,
        include_raw_content: false
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Tavily search failed (${response.status}): ${body || 'empty response body'}`);
    }

    const data = (await response.json()) as TavilySearchResponse;
    const results = (data.results ?? [])
      .map((result, index) => normalizeResult(result, index))
      .filter((result): result is WebSearchResultItem => result !== null);

    return {
      query: input.query,
      provider: 'tavily',
      answer: data.answer?.trim() || null,
      results,
      retrievedAt: new Date().toISOString()
    };
  }
}
