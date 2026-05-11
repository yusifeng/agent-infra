import type { LiveAssistantDraft, LiveAssistantSegment } from '@/features/durable-chat/types/live-assistant-draft';
import type { ActiveSearchPanelData } from '@/features/durable-chat/types/search';

import { buildLiveResearchStatusLabelViewModel } from './research-activity';

export type VisibleLiveAssistantSegment = {
  segment: LiveAssistantSegment;
  searchEntries: ReturnType<typeof buildLiveResearchStatusLabelViewModel>;
};

function buildLiveSearchSummaryOverride(panelData: ActiveSearchPanelData | null) {
  if (!panelData || panelData.resultCount <= 0) {
    return null;
  }

  const sources = [...new Set(panelData.sections.flatMap((section) => section.results.map((result) => result.sourceName)))]
    .slice(0, 4)
    .map((sourceName) => {
      const result = panelData.sections.flatMap((section) => section.results).find((candidate) => candidate.sourceName === sourceName);
      return result
        ? {
            hostname: result.hostname,
            sourceName
          }
        : null;
    })
    .filter((entry): entry is { hostname: string; sourceName: string } => Boolean(entry));

  return {
    isSearching: false,
    text: `搜索到 ${panelData.resultCount} 个网页`,
    searchToolCallIds: panelData.toolCallIds,
    sources
  };
}

export function collectLiveDraftCopyText(liveAssistantDraft: LiveAssistantDraft) {
  return liveAssistantDraft.segments
    .flatMap((segment) => [segment.reasoning, segment.text].filter((value): value is string => Boolean(value)))
    .join('\n\n')
    .trim();
}

export function buildVisibleLiveAssistantSegments(
  liveAssistantDraft: LiveAssistantDraft,
  getSearchPanelData?: (runId: string, toolCallIds: string[]) => ActiveSearchPanelData | null
): VisibleLiveAssistantSegment[] {
  return liveAssistantDraft.segments.flatMap((segment) => {
    const fallbackSearchEntries = buildLiveResearchStatusLabelViewModel(segment.tools);
    const searchEntries =
      !fallbackSearchEntries?.isSearching &&
      liveAssistantDraft.runId &&
      fallbackSearchEntries?.searchToolCallIds?.length &&
      getSearchPanelData
        ? buildLiveSearchSummaryOverride(getSearchPanelData(liveAssistantDraft.runId, fallbackSearchEntries.searchToolCallIds)) ??
          fallbackSearchEntries
        : fallbackSearchEntries;
    const hasVisibleContent = Boolean(segment.reasoning || segment.text || searchEntries);
    if (!hasVisibleContent) {
      return [];
    }

    return [
      {
        segment,
        searchEntries
      }
    ];
  });
}

export function hasVisibleLiveAssistantContent(liveAssistantDraft: LiveAssistantDraft) {
  return buildVisibleLiveAssistantSegments(liveAssistantDraft).length > 0;
}
