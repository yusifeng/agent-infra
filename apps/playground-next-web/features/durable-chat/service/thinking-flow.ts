import {
  buildResearchActivityViewModel,
  buildResearchTimelineRowsFromActivity,
  type ResearchTimelineRow
} from '@/features/durable-chat/service/research-activity';
import {
  buildVisibleLiveAssistantSegments
} from '@/features/durable-chat/service/live-assistant-presentation';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';
import type { ActiveSearchPanelData } from '@/features/durable-chat/types/search';
import type { AssistantTurnItem, TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';

export type PersistedResearchToken = {
  kind: 'persisted-research';
  id: string;
  items: AssistantTurnItem[];
  runId: string | null;
};

export type LiveSummaryToken = {
  kind: 'live-summary';
  id: string;
  runId: string | null;
  rows: ResearchTimelineRow[];
};

export type ReasoningToken = {
  kind: 'reasoning';
  id: string;
  text: string;
};

export type PersistedTextToken = {
  kind: 'persisted-text';
  id: string;
  part: Extract<AssistantTurnItem, { type: 'text' }>;
};

export type LiveTextToken = {
  kind: 'live-text';
  id: string;
  text: string;
  cacheKey: string;
};

export type ThinkingFlowToken =
  | PersistedResearchToken
  | LiveSummaryToken
  | ReasoningToken
  | PersistedTextToken
  | LiveTextToken;

export type ThinkingFlowSection =
  | {
      type: 'thinking';
      id: string;
      thinking: boolean;
      entries: Array<ReasoningToken | PersistedResearchToken | LiveSummaryToken>;
    }
  | {
      type: 'research';
      id: string;
      entry: PersistedResearchToken | LiveSummaryToken;
    }
  | {
      type: 'content';
      id: string;
      token: PersistedTextToken | LiveTextToken;
    };

export function buildThinkingFlowSections(tokens: ThinkingFlowToken[], openTrailingThinkingSection = false): ThinkingFlowSection[] {
  const sections: ThinkingFlowSection[] = [];
  let pendingThinkingEntries: Array<ReasoningToken | PersistedResearchToken | LiveSummaryToken> = [];
  let pendingThinkingId: string | null = null;

  function flushThinkingSection(thinking: boolean) {
    if (!pendingThinkingEntries.length || !pendingThinkingId) {
      return;
    }

    sections.push({
      type: 'thinking',
      id: pendingThinkingId,
      thinking,
      entries: pendingThinkingEntries
    });
    pendingThinkingEntries = [];
    pendingThinkingId = null;
  }

  for (const token of tokens) {
    if (token.kind === 'reasoning') {
      if (!pendingThinkingEntries.length) {
        pendingThinkingId = `thinking:${token.id}`;
      }
      pendingThinkingEntries.push(token);
      continue;
    }

    if (token.kind === 'persisted-research' || token.kind === 'live-summary') {
      if (pendingThinkingEntries.length > 0) {
        pendingThinkingEntries.push(token);
      } else {
        sections.push({
          type: 'research',
          id: `research:${token.id}`,
          entry: token
        });
      }
      continue;
    }

    flushThinkingSection(false);
    sections.push({
      type: 'content',
      id: `content:${token.id}`,
      token
    });
  }

  flushThinkingSection(openTrailingThinkingSection);

  return sections;
}

function isPersistedResearchEntryVisible(entry: PersistedResearchToken, showPersistedResearchStatus: boolean) {
  const activity = buildResearchActivityViewModel(entry.items);
  return buildResearchTimelineRowsFromActivity(activity, { includePending: showPersistedResearchStatus }).length > 0;
}

export function isThinkingFlowSectionVisible(section: ThinkingFlowSection, showPersistedResearchStatus: boolean) {
  if (section.type === 'content') {
    return true;
  }

  if (section.type === 'research') {
    return section.entry.kind === 'live-summary'
      ? true
      : isPersistedResearchEntryVisible(section.entry, showPersistedResearchStatus);
  }

  return section.entries.some((entry) =>
    entry.kind === 'reasoning' || entry.kind === 'live-summary'
      ? true
      : isPersistedResearchEntryVisible(entry, showPersistedResearchStatus)
  );
}

export function buildPersistedThinkingTokens(items: AssistantTurnItem[], runId: string | null): ThinkingFlowToken[] {
  const tokens: ThinkingFlowToken[] = [];
  let pendingResearchItems: AssistantTurnItem[] = [];
  let pendingResearchId: string | null = null;

  function flushPendingResearchItems() {
    if (!pendingResearchItems.length || !pendingResearchId) {
      return;
    }

    tokens.push({
      kind: 'persisted-research',
      id: pendingResearchId,
      items: pendingResearchItems,
      runId
    });
    pendingResearchItems = [];
    pendingResearchId = null;
  }

  for (const item of items) {
    if (item.type === 'reasoning') {
      flushPendingResearchItems();
      const text = item.part.textValue?.trim();
      if (text) {
        tokens.push({
          kind: 'reasoning',
          id: item.id,
          text
        });
      }
      continue;
    }

    if (item.type === 'search-status' || item.type === 'search-summary' || item.type === 'tool-part') {
      if (!pendingResearchItems.length) {
        pendingResearchId = item.id;
      }
      pendingResearchItems.push(item);
      continue;
    }

    if (item.type === 'text') {
      flushPendingResearchItems();
      tokens.push({
        kind: 'persisted-text',
        id: item.id,
        part: item
      });
    }
  }

  flushPendingResearchItems();
  return tokens;
}

export function buildPersistedThinkingTokensFromBlocks(
  blocks: Array<Extract<TranscriptBlock, { type: 'assistant-turn' }>>
): ThinkingFlowToken[] {
  return blocks.flatMap((block) => buildPersistedThinkingTokens(block.items, block.runId));
}

export function buildLiveThinkingTokens(
  liveAssistantDraft: LiveAssistantDraft,
  getLiveSearchPanelData?: (runId: string, toolCallIds: string[]) => ActiveSearchPanelData | null
): ThinkingFlowToken[] {
  const tokens: ThinkingFlowToken[] = [];
  const visibleSegments = buildVisibleLiveAssistantSegments(liveAssistantDraft, getLiveSearchPanelData);

  for (const { segment, researchRows } of visibleSegments) {
    const reasoning = segment.reasoning?.trim();
    if (reasoning) {
      tokens.push({
        kind: 'reasoning',
        id: `${segment.id}:reasoning`,
        text: reasoning
      });
    }

    if (segment.text) {
      tokens.push({
        kind: 'live-text',
        id: `${segment.id}:text`,
        text: segment.text,
        cacheKey: `live:${liveAssistantDraft.runId}:${segment.id}`
      });
    }

    if (researchRows.length > 0) {
      tokens.push({
        kind: 'live-summary',
        id: `${segment.id}:research`,
        runId: liveAssistantDraft.runId,
        rows: researchRows
      });
    }
  }

  return tokens;
}
