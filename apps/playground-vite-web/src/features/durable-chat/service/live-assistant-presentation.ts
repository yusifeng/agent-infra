import type { LiveAssistantDraft, LiveAssistantSegment } from '@/features/durable-chat/types/live-assistant-draft';

import { collectLiveSearchEntries } from './live-search-tools';

export type VisibleLiveAssistantSegment = {
  segment: LiveAssistantSegment;
  searchEntries: ReturnType<typeof collectLiveSearchEntries>;
};

export function collectLiveDraftCopyText(liveAssistantDraft: LiveAssistantDraft) {
  return liveAssistantDraft.segments
    .flatMap((segment) => [segment.reasoning, segment.text].filter((value): value is string => Boolean(value)))
    .join('\n\n')
    .trim();
}

export function buildVisibleLiveAssistantSegments(liveAssistantDraft: LiveAssistantDraft): VisibleLiveAssistantSegment[] {
  return liveAssistantDraft.segments.flatMap((segment) => {
    const searchEntries = collectLiveSearchEntries(segment);
    const hasVisibleContent = Boolean(segment.reasoning || segment.text || searchEntries.length > 0);
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
