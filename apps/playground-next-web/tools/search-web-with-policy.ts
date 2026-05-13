import type { AgentTool } from '@mariozechner/pi-agent-core';

import type { WebSearchProvider, WebSearchResponse } from '../search/provider';
import {
  type OpenUrlInput,
  type PolicyDecision,
  type RunSearchPlannerState,
  type SearchCandidate,
  type SearchPlannerMode,
  createBlockedPolicyToolResult,
  createRedirectedPolicyToolResult,
  derivePlannerDomain,
  deriveSearchPhase,
  getRemainingBudget,
  normalizePlannerUrl,
  normalizeSearchQuery
} from './search-planner';
import { buildSummary, normalizeSearchRequest, searchWebParameters } from './search-web';

function mapSearchCandidates(response: WebSearchResponse): SearchCandidate[] {
  const candidates: SearchCandidate[] = [];
  const seenUrls = new Set<string>();
  const seenDomains = new Set<string>();

  for (const result of response.results) {
    const url = result.url.trim();
    if (!url) {
      continue;
    }

    const normalizedUrl = normalizePlannerUrl(url);
    if (seenUrls.has(normalizedUrl)) {
      continue;
    }

    seenUrls.add(normalizedUrl);
    const domain = result.hostname.trim().toLowerCase() || derivePlannerDomain(url);
    if (!domain || seenDomains.has(domain)) {
      continue;
    }

    seenDomains.add(domain);
    candidates.push({
      url,
      title: result.title.trim(),
      snippet: result.snippet.trim() || null,
      domain
    });

    if (candidates.length >= 3) {
      break;
    }
  }

  return candidates;
}

export function resolveSearchPlannerMode(model: string): SearchPlannerMode {
  return model === 'deepseek-v4-pro' ? 'expert' : 'quick';
}

export function evaluateSearchWebPolicy(input: {
  state: RunSearchPlannerState;
  query: string;
}): PolicyDecision {
  const { state } = input;
  const normalizedQuery = normalizeSearchQuery(input.query);
  state.phase = deriveSearchPhase(state);
  const remainingBudget = getRemainingBudget(state);

  if (state.phase === 'browse' && state.latestSearchResults.length > 0) {
    const candidate =
      state.latestSearchResults.find(
        (item) =>
          !state.openedUrls.includes(normalizePlannerUrl(item.url)) &&
          !state.openedDomains.includes(item.domain)
      ) ?? state.latestSearchResults[0] ?? null;
    if (candidate) {
      return {
        action: 'redirect',
        toolName: 'openUrl',
        args: {
          url: candidate.url
        } satisfies OpenUrlInput,
        message: 'Search results are already available. Open a selected page instead of starting another search.'
      };
    }
  }

  if (remainingBudget.searchWeb <= 0) {
    return {
      action: 'block',
      reason: 'search_budget_exceeded',
      message: 'Search budget has been reached for this run. Answer using existing evidence or browse an already discovered page.',
      allowedNextTools: state.latestSearchResults.length > 0 ? ['openUrl'] : []
    };
  }

  if (state.phase !== 'search') {
    return {
      action: 'block',
      reason: 'phase_disallows_search',
      message: 'This run is no longer in the search phase. Answer with existing evidence or use the allowed browse tools.',
      allowedNextTools: state.latestSearchResults.length > 0 ? ['openUrl'] : []
    };
  }

  if (state.normalizedQueries.includes(normalizedQuery)) {
    return {
      action: 'block',
      reason: 'duplicate_query',
      message: 'This search query is too similar to one that already ran in the current run. Reuse existing results or browse a selected page.',
      allowedNextTools: state.latestSearchResults.length > 0 ? ['openUrl'] : []
    };
  }

  return { action: 'allow' };
}

function createPolicyResultArtifact(input: {
  toolCallId: string;
  result:
    | ReturnType<typeof createBlockedPolicyToolResult>
    | ReturnType<typeof createRedirectedPolicyToolResult>;
}) {
  return {
    kind: 'tool-policy-result',
    toolCallId: input.toolCallId,
    toolName: 'searchWeb',
    ...input.result
  };
}

export function createPolicyAwareSearchWebTool(options: {
  provider: WebSearchProvider;
  plannerState: RunSearchPlannerState;
}): AgentTool {
  return {
    name: 'searchWeb',
    label: 'Search the Web',
    description:
      'Search the web for recent or external information. Use this when the answer depends on current events, factual updates, or information not already present in the conversation. Do not use it for questions that can be answered directly from existing context or general knowledge.',
    parameters: searchWebParameters,
    async execute(toolCallId: string, params: unknown) {
      const request = normalizeSearchRequest((params ?? {}) as { query?: string; maxResults?: number; topic?: string; searchDepth?: string });
      const decision = evaluateSearchWebPolicy({
        state: options.plannerState,
        query: request.query
      });

      if (decision.action === 'block') {
        options.plannerState.consecutivePolicyBlocks += 1;
        options.plannerState.phase = deriveSearchPhase(options.plannerState);
        const result = createBlockedPolicyToolResult({
          state: options.plannerState,
          reason: decision.reason,
          message: decision.message,
          allowedNextTools: decision.allowedNextTools
        });

        return {
          content: [{ type: 'text', text: result.message }],
          details: result,
          artifact: createPolicyResultArtifact({
            toolCallId,
            result
          })
        };
      }

      if (decision.action === 'redirect') {
        options.plannerState.consecutivePolicyBlocks += 1;
        options.plannerState.phase = deriveSearchPhase(options.plannerState);
        const result = createRedirectedPolicyToolResult({
          state: options.plannerState,
          message: decision.message,
          suggestedToolCall: {
            name: decision.toolName,
            args: decision.args
          }
        });

        return {
          content: [{ type: 'text', text: result.message }],
          details: result,
          artifact: createPolicyResultArtifact({
            toolCallId,
            result
          })
        };
      }

      const response = await options.provider.search(request);
      const summary = buildSummary(response);
      options.plannerState.searchCalls += 1;
      options.plannerState.normalizedQueries.push(normalizeSearchQuery(request.query));
      options.plannerState.latestSearchResults = mapSearchCandidates(response);
      options.plannerState.consecutivePolicyBlocks = 0;
      options.plannerState.phase = deriveSearchPhase(options.plannerState);

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
