import type {
  AnswerCandidateDto,
  AnswerSelectionDto,
  MessageDto,
  RunDto,
  RunFeedbackDto,
  RunTimelineResponseDto,
  RuntimePiMetaDto,
  ThreadMessagesPageInfoDto
} from '@agent-infra/contracts';

import type { PlaygroundThreadDto } from '@/features/durable-chat/repo/chat-api';
import { buildAnswerContainers } from '@/features/durable-chat/service/build-answer-containers';
import { buildAnswerCandidateGroups } from '@/features/durable-chat/service/build-answer-candidate-groups';
import {
  deriveMainChatResponseStatus,
  shouldShowMainChatLoading
} from '@/features/durable-chat/service/chat-runtime';
import { buildDeepseekModePresentation } from '@/features/durable-chat/service/deepseek-mode-presentation';
import { buildTranscriptPresentation } from '@/features/durable-chat/service/transcript-presentation';
import type { ChatPhase } from '@/features/durable-chat/types/runtime';
import type { LiveAssistantDraft, LiveAssistantDraftsByRunId } from '@/features/durable-chat/types/live-assistant-draft';

export type ChatRuntimeViewModelInput = {
  activeResponseRun: RunTimelineResponseDto['run'];
  activeResponseRuns?: RunDto[];
  activeThreadId: string | null;
  answerCandidates?: AnswerCandidateDto[];
  answerSelections?: AnswerSelectionDto[];
  chatPhase: ChatPhase;
  draft: string;
  liveAssistantDraft: LiveAssistantDraft | null;
  liveAssistantDraftsByRunId?: LiveAssistantDraftsByRunId;
  loadingThreadId: string | null;
  messagePageInfo: ThreadMessagesPageInfoDto | null;
  messages: MessageDto[];
  meta: RuntimePiMetaDto | null;
  optimisticUserMessage: MessageDto | null;
  pendingNavigationTitle: { threadId: string; title: string } | null;
  pendingNewThreadLoadingId: string;
  persistingTurn: boolean;
  runFeedback?: RunFeedbackDto[];
  selectedModelKey: string;
  threads: PlaygroundThreadDto[];
  timeline: RunTimelineResponseDto | null;
};

export function buildChatRuntimeViewModel(input: ChatRuntimeViewModelInput) {
  const activeThread = input.threads.find((thread) => thread.id === input.activeThreadId) ?? null;
  const selectedModelOption =
    input.meta?.modelOptions.find((option) => option.key === input.selectedModelKey) ??
    input.meta?.modelOptions[0] ??
    null;
  const deepseekModePresentation = buildDeepseekModePresentation({
    modelOptions: input.meta?.modelOptions ?? [],
    selectedModelKey: input.selectedModelKey
  });
  const selectedRun = input.timeline?.run ?? null;
  const runEvents = input.timeline?.runEvents ?? [];
  const toolInvocations = input.timeline?.toolInvocations ?? [];
  const currentThreadTitle =
    activeThread?.title?.trim() ||
    (input.pendingNavigationTitle?.threadId === input.activeThreadId ? input.pendingNavigationTitle.title : null);
  const currentThreadPinned = activeThread?.pinned === true;
  const responseStatus = deriveMainChatResponseStatus({
    activeResponseRun: input.activeResponseRun,
    activeResponseRuns: input.activeResponseRuns,
    activeThreadId: input.activeThreadId,
    loadingThreadId: input.loadingThreadId,
    chatPhase: input.chatPhase,
    persistingTurn: input.persistingTurn,
    pendingNewThreadLoadingId: input.pendingNewThreadLoadingId
  });
  const isChatResponding = shouldShowMainChatLoading(responseStatus);
  const { displayedMessages, displayedTranscriptBlocks } = buildTranscriptPresentation({
    messages: input.messages,
    optimisticUserMessage: input.optimisticUserMessage,
    liveAssistantDraft: input.liveAssistantDraft
  });
  const displayedAnswerContainers = buildAnswerContainers(displayedTranscriptBlocks);
  const displayedAnswerCandidateGroups = buildAnswerCandidateGroups({
    activeResponseRuns: input.activeResponseRuns ?? (input.activeResponseRun ? [input.activeResponseRun] : []),
    answerCandidates: input.answerCandidates ?? [],
    answerContainers: displayedAnswerContainers,
    answerSelections: input.answerSelections ?? [],
    liveAssistantDraftsByRunId: input.liveAssistantDraftsByRunId ?? {},
    runFeedback: input.runFeedback ?? []
  });

  return {
    activeThread,
    currentThreadPinned,
    currentThreadTitle,
    deepseekModePresentation,
    displayedAnswerCandidateGroups,
    displayedAnswerContainers,
    displayedMessages,
    displayedTranscriptBlocks,
    hasOlderMessages: input.messagePageInfo?.hasOlder === true,
    inputLocked: isChatResponding,
    isChatResponding,
    liveAssistantActionsAvailable: input.liveAssistantDraft !== null && input.persistingTurn && !isChatResponding,
    responseStatus,
    runEvents,
    selectedModelOption,
    selectedRun,
    sendDisabled: !input.draft.trim() || isChatResponding || !input.meta?.runtimeConfigured || !selectedModelOption,
    showResponseLoading: isChatResponding,
    toolInvocations
  };
}
