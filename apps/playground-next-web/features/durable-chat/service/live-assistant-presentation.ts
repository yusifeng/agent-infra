import type { LiveAssistantDraft, LiveAssistantSegment } from '@/features/durable-chat/types/live-assistant-draft';
import type { ActiveSearchPanelData } from '@/features/durable-chat/types/search';

import {
  buildLiveResearchTimelineRows,
  collectCompletedLiveSearchToolCallIds,
  type ResearchTimelineRow
} from './research-activity';

export type VisibleLiveAssistantSegment = {
  segment: LiveAssistantSegment;
  researchRows: ResearchTimelineRow[];
};

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
    const completedSearchToolCallIds = collectCompletedLiveSearchToolCallIds(segment.tools);
    const panelData =
      liveAssistantDraft.runId && completedSearchToolCallIds.length > 0 && getSearchPanelData
        ? getSearchPanelData(liveAssistantDraft.runId, completedSearchToolCallIds)
        : null;
    const researchRows = buildLiveResearchTimelineRows(segment.tools, panelData);
    const hasVisibleContent = Boolean(segment.reasoning || segment.text || researchRows.length > 0);
    if (!hasVisibleContent) {
      return [];
    }

    return [
      {
        segment,
        researchRows
      }
    ];
  });
}

export function hasVisibleLiveAssistantContent(liveAssistantDraft: LiveAssistantDraft) {
  return buildVisibleLiveAssistantSegments(liveAssistantDraft).length > 0;
}
