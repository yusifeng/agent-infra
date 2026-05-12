import type { MessageDto, RunDto, RuntimePiMetaDto, ThreadMessagesPageInfoDto } from '@agent-infra/contracts';
import { deriveMainChatResponseStatus, shouldShowMainChatLoading } from '@agent-infra/durable-chat-client';

import { buildAnswerContainers } from '@/features/durable-chat/service/build-answer-containers';
import { buildDeepseekModePresentation } from '@/features/durable-chat/service/deepseek-mode-presentation';
import { resolveThreadRuntimeSelection } from '@/features/durable-chat/service/thread-runtime-selection';
import { buildOrderedThreads } from '@/features/durable-chat/service/thread-list-presentation';
import { buildTranscriptPresentation } from '@/features/durable-chat/service/transcript-presentation';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';
import type { ChatPhase } from '@/features/durable-chat/types/runtime';
import type { PlaygroundThreadDto } from '@/features/durable-chat/types/thread';

type BuildChatViewStateArgs = {
  threads: PlaygroundThreadDto[];
  pinnedThreadIds: string[];
  activeThreadId: string | null;
  messages: MessageDto[];
  draft: string;
  optimisticUserMessage: MessageDto | null;
  meta: RuntimePiMetaDto | null;
  selectedModelKey: string;
  activeResponseRun: RunDto | null;
  chatPhase: ChatPhase;
  persistingTurn: boolean;
  loadingThreadId: string | null;
  messagePageInfo: ThreadMessagesPageInfoDto | null;
  liveAssistantDraft: LiveAssistantDraft | null;
  pendingNewThreadLoadingId: string;
};

export function buildChatViewState(args: BuildChatViewStateArgs) {
  const {
    threads,
    pinnedThreadIds,
    activeThreadId,
    messages,
    draft,
    optimisticUserMessage,
    meta,
    selectedModelKey,
    activeResponseRun,
    chatPhase,
    persistingTurn,
    loadingThreadId,
    messagePageInfo,
    liveAssistantDraft,
    pendingNewThreadLoadingId
  } = args;

  const displayedThreads = buildOrderedThreads({ threads, pinnedThreadIds });
  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;
  const { effectiveSelectedModelKey, selectedModelOption } = resolveThreadRuntimeSelection({
    activeThread,
    meta,
    selectedModelKey
  });
  const deepseekModePresentation = buildDeepseekModePresentation({
    modelOptions: meta?.modelOptions ?? [],
    selectedModelKey: effectiveSelectedModelKey
  });
  const currentThreadTitle = activeThread?.title?.trim() || activeThreadId || 'New chat';
  const responseStatus = deriveMainChatResponseStatus({
    activeResponseRun,
    activeThreadId,
    loadingThreadId,
    chatPhase,
    persistingTurn,
    pendingNewThreadLoadingId
  });
  const isChatResponding = shouldShowMainChatLoading(responseStatus);
  const showResponseLoading = shouldShowMainChatLoading(responseStatus);
  const sendDisabled = !draft.trim() || isChatResponding || !meta?.runtimeConfigured || !selectedModelOption;
  const inputLocked = isChatResponding;
  const { displayedMessages, displayedTranscriptBlocks } = buildTranscriptPresentation({
    messages,
    optimisticUserMessage,
    liveAssistantDraft
  });
  const displayedAnswerContainers = buildAnswerContainers(displayedTranscriptBlocks);
  const hasOlderMessages = messagePageInfo?.hasOlder === true;

  return {
    activeThread,
    displayedThreads,
    selectedModelOption,
    deepseekModePresentation,
    currentThreadTitle,
    responseStatus,
    isChatResponding,
    showResponseLoading,
    sendDisabled,
    inputLocked,
    displayedMessages,
    displayedTranscriptBlocks,
    displayedAnswerContainers,
    hasOlderMessages
  };
}
