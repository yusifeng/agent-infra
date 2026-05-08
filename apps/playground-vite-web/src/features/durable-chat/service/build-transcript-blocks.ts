import type { MessageDto } from '@agent-infra/contracts';

import { parseSearchLoadingEntry, parseSearchSummaryEntry } from '@/features/durable-chat/service/content-node-search';
import type { AssistantTurnItem, SearchStatusBlock, SearchSummaryBlock, SearchSummaryEntry, TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';

function flushPendingSearchBlocks(
  items: AssistantTurnItem[],
  pendingStatuses: Array<{ toolCallId: string; query: string }>,
  completedEntries: SearchSummaryEntry[],
  runId: string | null,
  idBase: string
) {
  if (pendingStatuses.length > 0) {
    const status: SearchStatusBlock = {
      runId,
      entries: [...pendingStatuses]
    };

    items.push({
      type: 'search-status',
      id: `${idBase}:search-status:${items.length}`,
      status
    });
    pendingStatuses.length = 0;
  }

  if (completedEntries.length > 0) {
    const summary: SearchSummaryBlock = {
      runId,
      entries: [...completedEntries]
    };

    items.push({
      type: 'search-summary',
      id: `${idBase}:search-summary:${items.length}`,
      summary
    });
    completedEntries.length = 0;
  }
}

function buildAssistantTurnBlock(messages: MessageDto[]): TranscriptBlock {
  const firstMessage = messages[0]!;
  const runId = firstMessage.runId ?? null;
  const items: AssistantTurnItem[] = [];
  const pendingSearchStatuses: Array<{ toolCallId: string; query: string }> = [];
  const completedSearchEntries: SearchSummaryEntry[] = [];

  for (const message of messages) {
    for (const part of message.parts) {
      const searchStatus = parseSearchLoadingEntry(part);
      if (searchStatus) {
        pendingSearchStatuses.push(searchStatus);
        continue;
      }

      const searchEntry = parseSearchSummaryEntry(part);
      if (searchEntry) {
        const pendingIndex = pendingSearchStatuses.findIndex((entry) => entry.toolCallId === searchEntry.toolCallId);
        if (pendingIndex >= 0) {
          pendingSearchStatuses.splice(pendingIndex, 1);
        }
        completedSearchEntries.push(searchEntry);
        continue;
      }

      if (part.type === 'tool-call' || part.type === 'tool-result') {
        flushPendingSearchBlocks(items, pendingSearchStatuses, completedSearchEntries, runId, firstMessage.id);
        items.push({
          type: 'tool-part',
          id: `${message.id}:${part.id}`,
          part
        });
        continue;
      }

      flushPendingSearchBlocks(items, pendingSearchStatuses, completedSearchEntries, runId, firstMessage.id);

      if (part.type === 'text' && part.textValue?.trim()) {
        items.push({
          type: 'text',
          id: `${message.id}:${part.id}`,
          part,
          cacheKey: `${message.id}:${part.id}`
        });
        continue;
      }

      if (part.type === 'reasoning' && part.textValue?.trim()) {
        items.push({
          type: 'reasoning',
          id: `${message.id}:${part.id}`,
          part
        });
      }
    }
  }

  flushPendingSearchBlocks(items, pendingSearchStatuses, completedSearchEntries, runId, firstMessage.id);

  return {
    type: 'assistant-turn',
    id: `assistant-turn:${firstMessage.runId ?? firstMessage.id}:${firstMessage.seq}`,
    runId,
    sourceMessages: messages,
    items
  };
}

function isAssistantTurnMessage(message: MessageDto) {
  return (message.role === 'assistant' || message.role === 'tool') && Boolean(message.runId);
}

function collectAssistantTurnMessages(messages: MessageDto[], startIndex: number) {
  const firstMessage = messages[startIndex]!;
  const groupedMessages = [firstMessage];
  const runId = firstMessage.runId;
  let index = startIndex;

  while (index + 1 < messages.length) {
    const nextMessage = messages[index + 1]!;
    if (nextMessage.role === 'tool' && nextMessage.runId === runId) {
      groupedMessages.push(nextMessage);
      index += 1;
      continue;
    }

    break;
  }

  return {
    groupedMessages,
    nextIndex: index
  };
}

export function buildTranscriptBlocks(messages: MessageDto[]): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!;

    if (message.role === 'user') {
      blocks.push({
        type: 'user-message',
        id: `user-message:${message.id}`,
        message
      });
      continue;
    }

    if (!isAssistantTurnMessage(message)) {
      continue;
    }

    if (message.role === 'assistant') {
      const { groupedMessages, nextIndex } = collectAssistantTurnMessages(messages, index);
      blocks.push(buildAssistantTurnBlock(groupedMessages));
      index = nextIndex;
      continue;
    }

    blocks.push(buildAssistantTurnBlock([message]));
  }

  return blocks;
}

export function filterTranscriptBlocksForLiveRun(blocks: TranscriptBlock[], liveRunId: string | null): TranscriptBlock[] {
  if (!liveRunId) {
    return blocks;
  }

  return blocks.filter((block) => block.type !== 'assistant-turn' || block.runId !== liveRunId);
}
