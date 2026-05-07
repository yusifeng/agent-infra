import type { MessageDto, MessagePartDto } from '@agent-infra/contracts';

import type { AssistantTurnItem, SearchStatusBlock, SearchSummaryBlock, SearchSummaryEntry, TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function deriveHostname(rawUrl: string) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function parseSearchSummaryEntry(part: MessagePartDto): SearchSummaryEntry | null {
  if (part.type !== 'tool-result') {
    return null;
  }

  const value = part.jsonValue ?? {};
  if (value.toolName !== 'searchWeb' || typeof value.toolCallId !== 'string') {
    return null;
  }

  const details = asRecord(value.details);
  if (!details) {
    return null;
  }

  const query = typeof details.query === 'string' ? details.query.trim() : '';
  if (!query) {
    return null;
  }

  const explicitSources = Array.isArray(details.sources)
    ? details.sources
        .map((item) => asRecord(item))
        .filter((item): item is Record<string, unknown> => item !== null)
        .map((item) => ({
          sourceName: typeof item.sourceName === 'string' ? item.sourceName.trim() : '',
          hostname: typeof item.hostname === 'string' ? item.hostname.trim().toLowerCase() : ''
        }))
        .filter((item) => item.sourceName && item.hostname)
        .slice(0, 4)
    : [];

  const memory = asRecord(details.memory);
  const fallbackSources =
    explicitSources.length === 0 && Array.isArray(memory?.sources)
      ? memory.sources
          .map((item) => asRecord(item))
          .filter((item): item is Record<string, unknown> => item !== null)
          .map((item) => {
            const sourceName = typeof item.sourceName === 'string' ? item.sourceName.trim() : '';
            const url = typeof item.url === 'string' ? item.url.trim() : '';
            return {
              sourceName,
              hostname: deriveHostname(url)
            };
          })
          .filter((item) => item.sourceName && item.hostname)
          .slice(0, 4)
      : [];

  const sources = explicitSources.length > 0 ? explicitSources : fallbackSources;

  return {
    toolCallId: value.toolCallId,
    query,
    resultCount: typeof details.resultCount === 'number' ? details.resultCount : 0,
    sources,
    sourceNames: Array.isArray(details.sourceNames)
      ? details.sourceNames.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 4)
      : []
  };
}

function parseSearchStatusEntry(part: MessagePartDto) {
  if (part.type !== 'tool-call') {
    return null;
  }

  const value = part.jsonValue ?? {};
  if (value.toolName !== 'searchWeb' || typeof value.toolCallId !== 'string') {
    return null;
  }

  const input = asRecord(value.input);
  const query = typeof input?.query === 'string' ? input.query.trim() : '';

  return {
    toolCallId: value.toolCallId,
    query
  };
}

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
      const searchStatus = parseSearchStatusEntry(part);
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
