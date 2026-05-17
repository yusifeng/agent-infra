import type { MessageDto, RuntimePiMetaDto } from '@agent-infra/contracts';

import type { AnswerContainer } from '@/features/durable-chat/types/answer-containers';
import type { AnswerCandidateGroup } from '@/features/durable-chat/types/answer-candidate-groups';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';
import type { DurableRecoveryState } from '@/features/durable-chat/types/runtime';
import type { TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';

export type TranscriptRenderItem =
  | {
      type: 'answer-container';
      key: string;
      container: AnswerContainer;
    }
  | {
      type: 'answer-candidate-group';
      key: string;
      group: AnswerCandidateGroup;
    }
  | {
      type: 'transcript-block';
      key: string;
      block: TranscriptBlock;
    };

export type MessageListRenderPlan = {
  hasRuntimeWarning: boolean;
  runtimeWarningMessage: string | null;
  hasRecoveryNotice: boolean;
  recoveryNoticeMessage: string | null;
  hasVisibleActiveThreadMessages: boolean;
  showSilentThreadLoadingPlaceholder: boolean;
  showEmptyState: boolean;
  showTranscriptContent: boolean;
  showLiveAssistant: boolean;
  showEmptyThinkingIndicator: boolean;
  showTrailingThinkingIndicator: boolean;
  transcriptRenderItems: TranscriptRenderItem[];
};

export function buildTranscriptRenderItems({
  answerContainers,
  answerCandidateGroups = [],
  transcriptBlocks
}: {
  answerContainers: AnswerContainer[];
  answerCandidateGroups?: AnswerCandidateGroup[];
  transcriptBlocks: TranscriptBlock[];
}): TranscriptRenderItem[] {
  const answerContainerStartByBlockId = new Map(
    answerContainers
      .map((container) => [container.transcriptBlockIds[0], container] as const)
      .filter((entry): entry is readonly [string, AnswerContainer] => typeof entry[0] === 'string')
  );
  const answerContainerBlockIds = new Set(answerContainers.flatMap((container) => container.transcriptBlockIds));
  const candidateGroupsByTriggerMessageId = new Map(answerCandidateGroups.map((group) => [group.triggerMessageId, group] as const));
  const groupedCandidateRunIds = new Set(answerCandidateGroups.flatMap((group) => group.candidates.map((candidate) => candidate.candidate.runId)));

  return transcriptBlocks.flatMap((block): TranscriptRenderItem[] => {
    if (block.type === 'user-message') {
      const group = candidateGroupsByTriggerMessageId.get(block.message.id);
      return group
        ? [
            {
              type: 'transcript-block',
              key: block.id,
              block
            },
            {
              type: 'answer-candidate-group',
              key: group.id,
              group
            }
          ]
        : [
            {
              type: 'transcript-block',
              key: block.id,
              block
            }
          ];
    }

    if (block.type === 'assistant-turn' && block.runId && groupedCandidateRunIds.has(block.runId)) {
      return [];
    }

    if (block.type === 'assistant-turn' && answerContainerBlockIds.has(block.id)) {
      const container = answerContainerStartByBlockId.get(block.id);
      return container
        ? [
            {
              type: 'answer-container',
              key: block.id,
              container
            }
          ]
        : [];
    }

    return [
      {
        type: 'transcript-block',
        key: block.id,
        block
      }
    ];
  });
}

export function buildMessageListRenderPlan({
  activeThreadId,
  answerContainers,
  answerCandidateGroups,
  durableRecoveryState,
  liveAssistantDraft,
  loadingMessages,
  messages,
  meta,
  showLoadingText,
  transcriptBlocks
}: {
  activeThreadId: string | null;
  answerContainers: AnswerContainer[];
  answerCandidateGroups?: AnswerCandidateGroup[];
  durableRecoveryState: DurableRecoveryState;
  liveAssistantDraft: LiveAssistantDraft | null;
  loadingMessages: boolean;
  messages: MessageDto[];
  meta: RuntimePiMetaDto | null;
  showLoadingText: boolean;
  transcriptBlocks: TranscriptBlock[];
}): MessageListRenderPlan {
  const hasVisibleActiveThreadMessages = Boolean(
    activeThreadId &&
    messages.some((message) => message.threadId === activeThreadId)
  );
  const showSilentThreadLoadingPlaceholder = loadingMessages && !hasVisibleActiveThreadMessages;
  const showEmptyState = !showSilentThreadLoadingPlaceholder && messages.length === 0 && transcriptBlocks.length === 0 && liveAssistantDraft === null;
  const showTranscriptContent = !showSilentThreadLoadingPlaceholder && !showEmptyState;
  const liveDraftIsInCandidateGroup = Boolean(
    liveAssistantDraft &&
    answerCandidateGroups?.some((group) => group.candidates.some((candidate) => candidate.candidate.runId === liveAssistantDraft.runId))
  );

  return {
    hasRuntimeWarning: !meta?.runtimeConfigured && Boolean(meta?.runtimeConfigError),
    runtimeWarningMessage: meta?.runtimeConfigError ?? null,
    hasRecoveryNotice: durableRecoveryState.phase !== 'idle' && Boolean(durableRecoveryState.message),
    recoveryNoticeMessage: durableRecoveryState.message,
    hasVisibleActiveThreadMessages,
    showSilentThreadLoadingPlaceholder,
    showEmptyState,
    showTranscriptContent,
    showLiveAssistant: showTranscriptContent && liveAssistantDraft !== null && !liveDraftIsInCandidateGroup,
    showEmptyThinkingIndicator: showEmptyState && showLoadingText,
    showTrailingThinkingIndicator: showTranscriptContent && showLoadingText,
    transcriptRenderItems: buildTranscriptRenderItems({ answerCandidateGroups, answerContainers, transcriptBlocks })
  };
}
