import {
  buildLiveThinkingTokens,
  buildPersistedThinkingTokens,
  buildPersistedThinkingTokensFromBlocks,
  buildThinkingFlowSections,
  isThinkingFlowSectionVisible,
  type ThinkingFlowSection
} from '@/features/durable-chat/service/thinking-flow';
import type { AnswerContainerBlock } from '@/features/durable-chat/types/answer-containers';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';
import type { ActiveSearchPanelData } from '@/features/durable-chat/types/search';
import type { AssistantTurnItem } from '@/features/durable-chat/types/transcript-blocks';

export type AssistantMessageContentSection = ThinkingFlowSection;

export function buildPersistedAssistantContentSections(
  items: AssistantTurnItem[],
  runId: string | null,
  showPersistedResearchStatus: boolean
): AssistantMessageContentSection[] {
  return buildThinkingFlowSections(buildPersistedThinkingTokens(items, runId), false).filter((section) =>
    isThinkingFlowSectionVisible(section, showPersistedResearchStatus)
  );
}

export function hasVisiblePersistedAssistantContent(
  items: AssistantTurnItem[],
  runId: string | null,
  showPersistedResearchStatus: boolean
) {
  return buildPersistedAssistantContentSections(items, runId, showPersistedResearchStatus).length > 0;
}

export function buildAnswerContainerContentSections(
  blocks: AnswerContainerBlock[],
  showPersistedResearchStatus: boolean
): AssistantMessageContentSection[] {
  return buildThinkingFlowSections(buildPersistedThinkingTokensFromBlocks(blocks), false).filter((section) =>
    isThinkingFlowSectionVisible(section, showPersistedResearchStatus)
  );
}

export function buildLiveAssistantContentSections(
  liveAssistantDraft: LiveAssistantDraft,
  getLiveSearchPanelData?: (runId: string, toolCallIds: string[]) => ActiveSearchPanelData | null
): AssistantMessageContentSection[] {
  return buildThinkingFlowSections(buildLiveThinkingTokens(liveAssistantDraft, getLiveSearchPanelData), true);
}
