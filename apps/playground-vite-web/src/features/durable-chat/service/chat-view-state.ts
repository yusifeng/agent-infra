import type { MessageDto, RunDto, RuntimePiMetaDto, ThreadDto, ThreadMessagesPageInfoDto } from '@agent-infra/contracts';
import { deriveMainChatResponseStatus, shouldShowMainChatLoading } from '@agent-infra/durable-chat-client';

import { buildTranscriptPresentation } from '@/features/durable-chat/service/transcript-presentation';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';
import type { ChatPhase } from '@/features/durable-chat/types/runtime';

type BuildChatViewStateArgs = {
  threads: ThreadDto[];
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

  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;
  const selectedModelOption = meta?.modelOptions.find((option) => option.key === selectedModelKey) ?? meta?.modelOptions[0] ?? null;
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
  const hasOlderMessages = messagePageInfo?.hasOlder === true;

  return {
    activeThread,
    selectedModelOption,
    currentThreadTitle,
    responseStatus,
    isChatResponding,
    showResponseLoading,
    sendDisabled,
    inputLocked,
    displayedMessages,
    displayedTranscriptBlocks,
    hasOlderMessages
  };
}
