import {
  buildResearchActivityViewModel,
  buildResearchStatusLabelViewModel,
  buildResearchSummaryLabelViewModel
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
  item: Extract<AssistantTurnItem, { type: 'search-status' | 'search-summary' }>;
  runId: string | null;
};

export type LiveSummaryToken = {
  kind: 'live-summary';
  id: string;
  runId: string | null;
  searchEntries: NonNullable<ReturnType<typeof buildResearchStatusLabelViewModel>>;
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
  const activity = buildResearchActivityViewModel([entry.item]);
  return Boolean(
    (showPersistedResearchStatus ? buildResearchStatusLabelViewModel(activity) : null) ||
      buildResearchSummaryLabelViewModel(activity)
  );
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

  for (const item of items) {
    if (item.type === 'reasoning') {
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

    if (item.type === 'search-status' || item.type === 'search-summary') {
      tokens.push({
        kind: 'persisted-research',
        id: item.id,
        item,
        runId
      });
      continue;
    }

    if (item.type === 'text') {
      tokens.push({
        kind: 'persisted-text',
        id: item.id,
        part: item
      });
    }
  }

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

  for (const { segment, searchEntries } of visibleSegments) {
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

    if (searchEntries) {
      tokens.push({
        kind: 'live-summary',
        id: `${segment.id}:research`,
        runId: liveAssistantDraft.runId,
        searchEntries
      });
    }
  }

  return tokens;
}
