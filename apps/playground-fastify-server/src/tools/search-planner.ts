export type SearchPlannerMode = 'quick' | 'expert';

export type SearchPhase = 'search' | 'browse' | 'answer';

export type SearchCandidate = {
  url: string;
  title: string;
  snippet: string | null;
  domain: string;
};

export type RemainingBudget = {
  searchWeb: number;
  openUrl: number;
};

export type SearchPlannerBudget = {
  maxSearchCalls: number;
  maxOpenUrlCalls: number;
};

export type RunSearchPlannerState = {
  phase: SearchPhase;
  mode: SearchPlannerMode;
  searchCalls: number;
  openUrlCalls: number;
  normalizedQueries: string[];
  openedUrls: string[];
  openedDomains: string[];
  latestSearchResults: SearchCandidate[];
  consecutivePolicyBlocks: number;
};

export type SearchPolicyBlockReason =
  | 'search_budget_exceeded'
  | 'open_url_budget_exceeded'
  | 'duplicate_query'
  | 'phase_disallows_search'
  | 'phase_disallows_open_url'
  | 'duplicate_open_url'
  | 'duplicate_open_domain';

export type PolicyDecision =
  | { action: 'allow' }
  | {
      action: 'block';
      reason: SearchPolicyBlockReason;
      message: string;
      allowedNextTools?: string[];
    }
  | {
      action: 'redirect';
      toolName: 'openUrl';
      args: OpenUrlInput;
      message: string;
    };

export type PolicyToolResult =
  | {
      status: 'blocked_by_policy';
      reason: SearchPolicyBlockReason;
      message: string;
      allowedNextTools: string[];
      remainingBudget: RemainingBudget;
    }
  | {
      status: 'redirected_by_policy';
      message: string;
      suggestedToolCall: {
        name: 'openUrl';
        args: OpenUrlInput;
      };
      remainingBudget: RemainingBudget;
    };

export type OpenUrlInput = {
  url: string;
  maxChars?: number;
};

export type OpenUrlResult = {
  url: string;
  finalUrl: string;
  title: string;
  siteName?: string | null;
  contentText: string;
  contentQuality: 'good' | 'partial' | 'failed';
};

const SEARCH_QUERY_MODIFIERS = [
  '人物介绍',
  '详细',
  '角色',
  '故事',
  '登场',
  '身世'
] as const;

export function getSearchPlannerBudget(mode: SearchPlannerMode): SearchPlannerBudget {
  if (mode === 'expert') {
    return {
      maxSearchCalls: 2,
      maxOpenUrlCalls: 3
    };
  }

  return {
    maxSearchCalls: 1,
    maxOpenUrlCalls: 2
  };
}

export function createRunSearchPlannerState(mode: SearchPlannerMode): RunSearchPlannerState {
  return {
    phase: 'search',
    mode,
    searchCalls: 0,
    openUrlCalls: 0,
    normalizedQueries: [],
    openedUrls: [],
    openedDomains: [],
    latestSearchResults: [],
    consecutivePolicyBlocks: 0
  };
}

export function getRemainingBudget(state: RunSearchPlannerState): RemainingBudget {
  const budget = getSearchPlannerBudget(state.mode);

  return {
    searchWeb: Math.max(0, budget.maxSearchCalls - state.searchCalls),
    openUrl: Math.max(0, budget.maxOpenUrlCalls - state.openUrlCalls)
  };
}

export function deriveSearchPhase(state: RunSearchPlannerState): SearchPhase {
  if (state.consecutivePolicyBlocks >= 2) {
    return 'answer';
  }

  const remainingBudget = getRemainingBudget(state);
  if (remainingBudget.openUrl > 0 && state.latestSearchResults.length > 0) {
    return 'browse';
  }

  if (remainingBudget.searchWeb > 0) {
    return 'search';
  }

  return 'answer';
}

export function normalizeSearchQuery(query: string) {
  let normalized = query.trim().toLowerCase();
  normalized = normalized.replace(/["'“”‘’]/g, ' ');
  normalized = normalized.replace(/\s+/g, ' ');

  for (const modifier of SEARCH_QUERY_MODIFIERS) {
    normalized = normalized.replaceAll(modifier, ' ');
  }

  return normalized.replace(/\s+/g, ' ').trim();
}

export function normalizePlannerUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    if ((parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443')) {
      parsed.port = '';
    }

    return parsed.toString();
  } catch {
    return url.trim();
  }
}

export function derivePlannerDomain(url: string) {
  try {
    return new URL(url).hostname.trim().toLowerCase();
  } catch {
    return '';
  }
}

export function createBlockedPolicyToolResult(args: {
  state: RunSearchPlannerState;
  reason: SearchPolicyBlockReason;
  message: string;
  allowedNextTools?: string[];
}): PolicyToolResult {
  return {
    status: 'blocked_by_policy',
    reason: args.reason,
    message: args.message,
    allowedNextTools: args.allowedNextTools ?? [],
    remainingBudget: getRemainingBudget(args.state)
  };
}

export function createRedirectedPolicyToolResult(args: {
  state: RunSearchPlannerState;
  message: string;
  suggestedToolCall: {
    name: 'openUrl';
    args: OpenUrlInput;
  };
}): PolicyToolResult {
  return {
    status: 'redirected_by_policy',
    message: args.message,
    suggestedToolCall: args.suggestedToolCall,
    remainingBudget: getRemainingBudget(args.state)
  };
}
