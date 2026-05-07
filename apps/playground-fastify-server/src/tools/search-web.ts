import crypto from 'node:crypto';

import type { AgentTool } from '@mariozechner/pi-agent-core';
import { Type } from '@sinclair/typebox';

import type { WebSearchProvider, WebSearchRequest, WebSearchResponse } from '../search/provider.js';

function normalizeSearchRequest(input: {
  query?: string;
  maxResults?: number;
  topic?: string;
  searchDepth?: string;
}): WebSearchRequest {
  const query = input.query?.trim() ?? '';
  if (!query) {
    throw new Error('searchWeb requires a non-empty query.');
  }

  return {
    query,
    maxResults:
      typeof input.maxResults === 'number' && Number.isFinite(input.maxResults) ? Math.min(Math.max(Math.trunc(input.maxResults), 1), 10) : 8,
    topic: input.topic === 'news' ? 'news' : 'general',
    searchDepth: input.searchDepth === 'advanced' ? 'advanced' : 'basic'
  };
}

function buildSummary(response: WebSearchResponse) {
  const sources = Array.from(
    new Map(
      response.results
        .filter((result) => result.sourceName && result.hostname)
        .map((result) => [
          `${result.hostname}:${result.sourceName}`,
          {
            sourceName: result.sourceName,
            hostname: result.hostname
          }
        ])
    ).values()
  ).slice(0, 4);
  const summaryText =
    response.answer?.trim() ||
    `已阅读 ${response.results.length} 个网页，查询“${response.query}”并提取了可用于回答的网页信息。`;

  return {
    kind: 'web-search-summary' as const,
    searchId: crypto.randomUUID(),
    query: response.query,
    provider: response.provider,
    resultCount: response.results.length,
    sourceNames: sources.map((source) => source.sourceName),
    sources,
    summaryText,
    memory: {
      query: response.query,
      summary: summaryText,
      sources: response.results.slice(0, 3).map((result) => ({
        title: result.title,
        url: result.url,
        sourceName: result.sourceName
      })),
      retrievedAt: response.retrievedAt
    }
  };
}

export function createSearchWebTool(options: {
  provider: WebSearchProvider;
}): AgentTool {
  return {
    name: 'searchWeb',
    label: 'Search the Web',
    description:
      'Search the web for recent or external information. Use this when the answer depends on current events, factual updates, or information not already present in the conversation. Do not use it for questions that can be answered directly from existing context or general knowledge.',
    parameters: Type.Object({
      query: Type.String({ description: 'A concise web search query.' }),
      maxResults: Type.Optional(Type.Number({ description: 'Maximum number of results to return, from 1 to 10.' })),
      topic: Type.Optional(Type.Union([Type.Literal('general'), Type.Literal('news')], { description: 'Search focus.' })),
      searchDepth: Type.Optional(Type.Union([Type.Literal('basic'), Type.Literal('advanced')], { description: 'Search depth.' }))
    }),
    async execute(toolCallId: string, params: unknown) {
      const request = normalizeSearchRequest((params ?? {}) as { query?: string; maxResults?: number; topic?: string; searchDepth?: string });
      const response = await options.provider.search(request);
      const summary = buildSummary(response);

      return {
        content: [{ type: 'text', text: summary.summaryText }],
        details: summary,
        artifact: {
          kind: 'web-search-results',
          searchId: summary.searchId,
          toolCallId,
          query: response.query,
          provider: response.provider,
          resultCount: response.results.length,
          results: response.results,
          retrievedAt: response.retrievedAt
        }
      };
    }
  };
}
