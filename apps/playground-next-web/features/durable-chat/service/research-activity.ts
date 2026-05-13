import type { LiveAssistantToolState } from '@agent-infra/durable-chat-client';

import { asRecord, deriveHostname } from '@/features/durable-chat/schema/search-panel';
import type { AssistantTurnItem, SearchSummaryEntry } from '@/features/durable-chat/types/transcript-blocks';

export type ResearchPendingEntry =
  | {
      kind: 'search';
      toolCallId: string;
      query: string;
    }
  | {
      kind: 'open';
      toolCallId: string;
      url: string;
    };

export type ResearchOpenPageEntry = {
  toolCallId: string;
  url: string;
  finalUrl: string;
  title: string;
  siteName: string | null;
  hostname: string;
  contentQuality: 'good' | 'partial' | 'failed';
};

export type ResearchPolicyEntry = {
  toolCallId: string;
  toolName: 'searchWeb' | 'openUrl';
  status: 'blocked_by_policy' | 'redirected_by_policy';
  reason: string;
  message: string;
  allowedNextTools: string[];
  suggestedToolName: 'openUrl' | null;
  suggestedUrl: string | null;
};

export type ResearchActivityViewModel = {
  pendingEntries: ResearchPendingEntry[];
  searches: SearchSummaryEntry[];
  openedPages: ResearchOpenPageEntry[];
  policyEntries: ResearchPolicyEntry[];
  searchToolCallIds: string[];
  visibleItems: AssistantTurnItem[];
};

export type ResearchSummaryLabelViewModel = {
  text: string;
  sources: Array<{
    hostname: string;
    sourceName: string;
  }>;
  detailQueries: string[];
  detailPages: Array<{
    title: string;
    url: string;
    sourceName: string;
  }>;
};

export type ResearchStatusLabelViewModel = {
  isSearching: boolean;
  text: string;
  searchToolCallIds?: string[];
  sources?: Array<{
    hostname: string;
    sourceName: string;
  }>;
};

function isSearchSummaryItem(item: AssistantTurnItem): item is Extract<AssistantTurnItem, { type: 'search-summary' }> {
  return item.type === 'search-summary';
}

function isSearchStatusItem(item: AssistantTurnItem): item is Extract<AssistantTurnItem, { type: 'search-status' }> {
  return item.type === 'search-status';
}

function parseOpenUrlCallPart(item: Extract<AssistantTurnItem, { type: 'tool-part' }>) {
  if (item.part.type !== 'tool-call') {
    return null;
  }

  const value = item.part.jsonValue ?? {};
  if (value.toolName !== 'openUrl' || typeof value.toolCallId !== 'string') {
    return null;
  }

  const input = asRecord(value.input);
  const url = typeof input?.url === 'string' ? input.url.trim() : '';
  if (!url) {
    return null;
  }

  return {
    kind: 'open',
    toolCallId: value.toolCallId,
    url
  } satisfies Extract<ResearchPendingEntry, { kind: 'open' }>;
}

function parseOpenUrlResultPart(item: Extract<AssistantTurnItem, { type: 'tool-part' }>) {
  if (item.part.type !== 'tool-result') {
    return null;
  }

  const value = item.part.jsonValue ?? {};
  if (value.toolName !== 'openUrl' || typeof value.toolCallId !== 'string') {
    return null;
  }

  const details = asRecord(value.details);
  if (!details) {
    return null;
  }

  const status = typeof details.status === 'string' ? details.status.toLowerCase() : null;
  if (status === 'failed' || status === 'error' || status === 'blocked' || status === 'blocked_by_policy') {
    return null;
  }

  const url = typeof details.url === 'string' ? details.url.trim() : '';
  const finalUrl = typeof details.finalUrl === 'string' ? details.finalUrl.trim() : url;
  const title = typeof details.title === 'string' ? details.title.trim() : finalUrl;
  const siteName = typeof details.siteName === 'string' && details.siteName.trim().length > 0 ? details.siteName.trim() : null;
  const contentQuality =
    details.contentQuality === 'good' || details.contentQuality === 'partial' || details.contentQuality === 'failed'
      ? details.contentQuality
      : 'failed';

  if (!url || !finalUrl || !title) {
    return null;
  }

  return {
    toolCallId: value.toolCallId,
    url,
    finalUrl,
    title,
    siteName,
    hostname: deriveHostname(finalUrl),
    contentQuality
  } satisfies ResearchOpenPageEntry;
}

function parsePolicyResultPart(item: Extract<AssistantTurnItem, { type: 'tool-part' }>) {
  if (item.part.type !== 'tool-result') {
    return null;
  }

  const value = item.part.jsonValue ?? {};
  if ((value.toolName !== 'searchWeb' && value.toolName !== 'openUrl') || typeof value.toolCallId !== 'string') {
    return null;
  }

  const details = asRecord(value.details);
  if (!details || (details.status !== 'blocked_by_policy' && details.status !== 'redirected_by_policy')) {
    return null;
  }

  const suggestedToolCall = asRecord(details.suggestedToolCall);
  const suggestedArgs = asRecord(suggestedToolCall?.args);
  return {
    toolCallId: value.toolCallId,
    toolName: value.toolName,
    status: details.status,
    reason: typeof details.reason === 'string' ? details.reason : '',
    message: typeof details.message === 'string' ? details.message : '',
    allowedNextTools: Array.isArray(details.allowedNextTools)
      ? details.allowedNextTools.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : [],
    suggestedToolName: suggestedToolCall?.name === 'openUrl' ? 'openUrl' : null,
    suggestedUrl: typeof suggestedArgs?.url === 'string' ? suggestedArgs.url.trim() : null
  } satisfies ResearchPolicyEntry;
}

export function buildResearchActivityViewModel(items: AssistantTurnItem[]): ResearchActivityViewModel {
  const pendingEntries: ResearchPendingEntry[] = [];
  const searches: SearchSummaryEntry[] = [];
  const openedPages: ResearchOpenPageEntry[] = [];
  const policyEntries: ResearchPolicyEntry[] = [];
  const visibleItems: AssistantTurnItem[] = [];

  for (const item of items) {
    if (isSearchStatusItem(item)) {
      pendingEntries.push(
        ...item.status.entries.map((entry) => ({
          kind: 'search' as const,
          toolCallId: entry.toolCallId,
          query: entry.query
        }))
      );
      continue;
    }

    if (isSearchSummaryItem(item)) {
      for (const entry of item.summary.entries) {
        const pendingIndex = pendingEntries.findIndex((candidate) => candidate.toolCallId === entry.toolCallId);
        if (pendingIndex >= 0) {
          pendingEntries.splice(pendingIndex, 1);
        }
        searches.push(entry);
      }
      continue;
    }

    if (item.type === 'tool-part') {
      const pendingOpen = parseOpenUrlCallPart(item);
      if (pendingOpen) {
        pendingEntries.push(pendingOpen);
        continue;
      }

      const openResult = parseOpenUrlResultPart(item);
      if (openResult) {
        const pendingIndex = pendingEntries.findIndex((entry) => entry.toolCallId === openResult.toolCallId);
        if (pendingIndex >= 0) {
          pendingEntries.splice(pendingIndex, 1);
        }
        openedPages.push(openResult);
        continue;
      }

      const policyEntry = parsePolicyResultPart(item);
      if (policyEntry) {
        const pendingIndex = pendingEntries.findIndex((entry) => entry.toolCallId === policyEntry.toolCallId);
        if (pendingIndex >= 0) {
          pendingEntries.splice(pendingIndex, 1);
        }
        policyEntries.push(policyEntry);
        continue;
      }
    }

    visibleItems.push(item);
  }

  return {
    pendingEntries,
    searches,
    openedPages,
    policyEntries,
    searchToolCallIds: searches.map((entry) => entry.toolCallId),
    visibleItems
  };
}

export function buildResearchSummaryLabelViewModel(summary: ResearchActivityViewModel): ResearchSummaryLabelViewModel | null {
  const totalResults = summary.searches.reduce((total, entry) => total + entry.resultCount, 0);
  const browseCount = summary.openedPages.length;

  if (totalResults === 0 && browseCount === 0) {
    return null;
  }

  const text =
    totalResults > 0 && browseCount > 0
      ? `搜索到 ${totalResults} 个网页 · 浏览 ${browseCount} 个页面`
      : totalResults > 0
        ? `搜索到 ${totalResults} 个网页`
        : `浏览 ${browseCount} 个页面`;

  const searchSources = summary.searches.flatMap((entry) => entry.sources);
  const browseSources = summary.openedPages
    .map((entry) => ({
      hostname: entry.hostname,
      sourceName: entry.siteName || entry.hostname || entry.title
    }))
    .filter((entry) => entry.hostname && entry.sourceName);

  const sources = Array.from(
    new Map(
      [...searchSources, ...browseSources].map((source) => [`${source.hostname}:${source.sourceName}`, source])
    ).values()
  ).slice(0, 4);

  return {
    text,
    sources,
    detailQueries: Array.from(new Set(summary.searches.map((entry) => entry.query).filter(Boolean))),
    detailPages: summary.openedPages.map((entry) => ({
      title: entry.title,
      url: entry.finalUrl,
      sourceName: entry.siteName || entry.hostname || entry.title
    }))
  };
}

export function buildResearchStatusLabelViewModel(summary: ResearchActivityViewModel): ResearchStatusLabelViewModel | null {
  const pendingSearchCount = summary.pendingEntries.filter((entry) => entry.kind === 'search').length;
  const pendingOpenCount = summary.pendingEntries.filter((entry) => entry.kind === 'open').length;

  if (pendingSearchCount === 0 && pendingOpenCount === 0) {
    return null;
  }

  const parts: string[] = [];
  if (pendingSearchCount > 0) {
    parts.push(pendingSearchCount === 1 ? '正在搜索网页' : `正在搜索 ${pendingSearchCount} 个查询`);
  }
  if (pendingOpenCount > 0) {
    parts.push(pendingOpenCount === 1 ? '正在浏览 1 个页面' : `正在浏览 ${pendingOpenCount} 个页面`);
  }

  return {
    isSearching: true,
    text: parts.join(' · ')
  };
}

export type LiveResearchEntry = {
  kind: 'search' | 'open';
  toolCallId: string;
  state: LiveAssistantToolState['phase'];
  label: string;
};

export function collectLiveResearchEntries(tools: LiveAssistantToolState[] | undefined): LiveResearchEntry[] {
  const entries: LiveResearchEntry[] = [];

  for (const tool of tools ?? []) {
    if (tool.toolName === 'searchWeb') {
      entries.push({
        kind: 'search',
        toolCallId: tool.toolCallId,
        state: tool.phase,
        label: typeof tool.input?.query === 'string' ? tool.input.query : ''
      });
      continue;
    }

    if (tool.toolName === 'openUrl') {
      entries.push({
        kind: 'open',
        toolCallId: tool.toolCallId,
        state: tool.phase,
        label: typeof tool.input?.url === 'string' ? tool.input.url : ''
      });
    }
  }

  return entries;
}

export function collectCompletedLiveSearchToolCallIds(tools: LiveAssistantToolState[]) {
  return [...new Set(
    collectLiveResearchEntries(tools)
      .filter((entry) => entry.kind === 'search' && entry.state === 'completed')
      .map((entry) => entry.toolCallId)
  )];
}

export function buildLiveResearchStatusLabelViewModel(tools: LiveAssistantToolState[]): ResearchStatusLabelViewModel | null {
  const entries = collectLiveResearchEntries(tools);
  const pendingSearchCount = entries.filter((entry) => entry.kind === 'search' && entry.state === 'start').length;
  const pendingOpenCount = entries.filter((entry) => entry.kind === 'open' && entry.state === 'start').length;

  if (pendingSearchCount > 0 || pendingOpenCount > 0) {
    const parts: string[] = [];
    if (pendingSearchCount > 0) {
      parts.push(pendingSearchCount === 1 ? '正在搜索网页' : `正在搜索 ${pendingSearchCount} 个查询`);
    }
    if (pendingOpenCount > 0) {
      parts.push(pendingOpenCount === 1 ? '正在浏览 1 个页面' : `正在浏览 ${pendingOpenCount} 个页面`);
    }

    return {
      isSearching: true,
      text: parts.join(' · ')
    };
  }

  const completedSearchCount = entries.filter((entry) => entry.kind === 'search' && entry.state === 'completed').length;
  const completedOpenCount = entries.filter((entry) => entry.kind === 'open' && entry.state === 'completed').length;

  if (completedSearchCount === 0 && completedOpenCount === 0) {
    return null;
  }

  const parts: string[] = [];
  if (completedSearchCount > 0) {
    parts.push(completedSearchCount === 1 ? '已完成搜索' : `已完成 ${completedSearchCount} 次搜索`);
  }
  if (completedOpenCount > 0) {
    parts.push(completedOpenCount === 1 ? '已浏览 1 个页面' : `已浏览 ${completedOpenCount} 个页面`);
  }

  return {
    isSearching: false,
    searchToolCallIds: completedSearchCount > 0 ? collectCompletedLiveSearchToolCallIds(tools) : undefined,
    text: parts.join(' · ')
  };
}
