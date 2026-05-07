import type { MessageDto } from '@agent-infra/contracts';
import { upsertMessage } from '@agent-infra/durable-chat-client';

import { buildTranscriptBlocks, filterTranscriptBlocksForLiveRun } from '@/features/durable-chat/service/build-transcript-blocks';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';

export function buildTranscriptPresentation(args: {
  messages: MessageDto[];
  optimisticUserMessage: MessageDto | null;
  liveAssistantDraft: LiveAssistantDraft | null;
}) {
  const { messages, optimisticUserMessage, liveAssistantDraft } = args;
  const displayedMessages = optimisticUserMessage ? upsertMessage(messages, optimisticUserMessage) : messages;
  const displayedTranscriptBlocks = filterTranscriptBlocksForLiveRun(
    buildTranscriptBlocks(displayedMessages),
    liveAssistantDraft?.runId ?? null
  );

  return {
    displayedMessages,
    displayedTranscriptBlocks
  };
}
