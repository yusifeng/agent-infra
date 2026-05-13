'use client';

import type { MessageDto, SharedMessageDto } from '@agent-infra/contracts';

import { ChatThemeProvider } from '@/components/chat-theme-provider';
import { ChatMessageList } from '@/components/chat-shell/message-list';

type ShareTranscriptProps = {
  messages: SharedMessageDto[];
  publicId: string;
};

function toMessageDto(message: SharedMessageDto, publicId: string): MessageDto {
  return {
    id: message.id,
    threadId: `share:${publicId}`,
    runId: message.runId ?? null,
    role: message.role,
    seq: message.seq,
    status: 'completed',
    metadata: {
      shared: true
    },
    createdAt: message.createdAt,
    parts: message.parts.map((part) => ({
      id: part.id,
      messageId: part.messageId,
      partIndex: part.partIndex,
      type: part.type,
      textValue: part.textValue ?? null,
      jsonValue: part.jsonValue ?? null,
      createdAt: part.createdAt
    }))
  };
}

export function ShareTranscript({ messages, publicId }: ShareTranscriptProps) {
  const messageDtos = messages.map((message) => toMessageDto(message, publicId));

  return (
    <ChatThemeProvider>
      <ChatMessageList
        meta={null}
        error={null}
        durableRecoveryState={{ phase: 'idle', message: null }}
        hasOlderMessages={false}
        historyLoading={false}
        loadingMessages={false}
        activeThreadId={`share:${publicId}`}
        messages={messageDtos}
        liveAssistantDraft={null}
        showLoadingText={false}
        centeredEmptyState={false}
        onLoadOlderMessages={() => undefined}
      />
    </ChatThemeProvider>
  );
}
