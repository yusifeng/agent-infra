import type { MessageDto, RunFeedbackDto, RuntimePiMetaDto } from '@agent-infra/contracts';

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
      feedbackContext?: {
        feedback: RunFeedbackDto | null;
      };
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
  runFeedback = [],
  transcriptBlocks
}: {
  answerContainers: AnswerContainer[];
  answerCandidateGroups?: AnswerCandidateGroup[];
  runFeedback?: RunFeedbackDto[];
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
  const feedbackByRunId = new Map(runFeedback.map((feedback) => [feedback.runId, feedback] as const));

  return transcriptBlocks.flatMap((block): TranscriptRenderItem[] => {
    if (block.type === 'user-message') {
      const group = candidateGroupsByTriggerMessageId.get(block.message.id);
      const userMessageItem: TranscriptRenderItem = {
        type: 'transcript-block',
        key: block.id,
        block
      };

      if (!group) {
        return [userMessageItem];
      }

      const userSelectedCandidate =
        group.selection?.source === 'user'
          ? group.candidates.find((candidate) => candidate.candidate.runId === group.selection?.selectedRunId)
          : null;

      if (userSelectedCandidate?.answerContainer) {
        return [
          userMessageItem,
          {
            type: 'answer-container',
            key: `${group.id}:selected`,
            container: userSelectedCandidate.answerContainer,
            feedbackContext: {
              feedback: userSelectedCandidate.feedback
            }
          }
        ];
      }

      return [
        userMessageItem,
        {
          type: 'answer-candidate-group',
          key: group.id,
          group
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
              container,
              feedbackContext:
                container.runId
                  ? {
                      feedback: feedbackByRunId.get(container.runId) ?? null
                    }
                  : undefined
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
  runFeedback,
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
  runFeedback?: RunFeedbackDto[];
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
    transcriptRenderItems: buildTranscriptRenderItems({ answerCandidateGroups, answerContainers, runFeedback, transcriptBlocks })
  };
}
