import type { MessageDto, MessagePartDto } from '@agent-infra/contracts';

import type { ContentNode } from '@/features/durable-chat/types/content-nodes';
import type {
  AssistantTurnItem,
  SearchStatusBlock,
  SearchSummaryBlock,
  SearchSummaryEntry,
  TranscriptBlock
} from '@/features/durable-chat/types/transcript-blocks';

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

function buildAssistantBlockHintId(message: MessageDto) {
  return `assistant-turn:${message.runId ?? message.id}:${message.seq}`;
}

function buildPartIndex(messages: MessageDto[]) {
  const partsById = new Map<string, MessagePartDto>();

  for (const message of messages) {
    for (const part of message.parts) {
      partsById.set(part.id, part);
    }
  }

  return partsById;
}

function flushPendingSearchItems(
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

function buildAssistantTurnItems(args: {
  nodes: ContentNode[];
  partsById: Map<string, MessagePartDto>;
  runId: string | null;
  idBase: string;
}): AssistantTurnItem[] {
  const { nodes, partsById, runId, idBase } = args;
  const items: AssistantTurnItem[] = [];
  const pendingSearchStatuses: Array<{ toolCallId: string; query: string }> = [];
  const completedSearchEntries: SearchSummaryEntry[] = [];

  for (const node of nodes) {
    if (node.kind === 'assistant-search-loading') {
      pendingSearchStatuses.push({
        toolCallId: node.toolCallId,
        query: node.query
      });
      continue;
    }

    if (node.kind === 'assistant-search-summary') {
      const pendingIndex = pendingSearchStatuses.findIndex((entry) => entry.toolCallId === node.entry.toolCallId);
      if (pendingIndex >= 0) {
        pendingSearchStatuses.splice(pendingIndex, 1);
      }
      completedSearchEntries.push(node.entry);
      continue;
    }

    flushPendingSearchItems(items, pendingSearchStatuses, completedSearchEntries, runId, idBase);

    if (node.kind === 'assistant-tool-part') {
      items.push({
        type: 'tool-part',
        id: `${node.messageId}:${node.sourcePartId}`,
        part: node.part
      });
      continue;
    }

    if (!node.sourcePartId) {
      continue;
    }

    const part = partsById.get(node.sourcePartId);
    if (!part) {
      continue;
    }

    if (node.kind === 'assistant-text') {
      items.push({
        type: 'text',
        id: `${node.messageId}:${node.sourcePartId}`,
        part,
        cacheKey: node.cacheKey
      });
      continue;
    }

    if (node.kind === 'assistant-reasoning') {
      items.push({
        type: 'reasoning',
        id: `${node.messageId}:${node.sourcePartId}`,
        part
      });
    }
  }

  flushPendingSearchItems(items, pendingSearchStatuses, completedSearchEntries, runId, idBase);
  return items;
}

export function projectNormalTranscriptBlocks(args: {
  messages: MessageDto[];
  contentNodes: ContentNode[];
}): TranscriptBlock[] {
  const { messages, contentNodes } = args;
  const blocks: TranscriptBlock[] = [];
  const partsById = buildPartIndex(messages);
  const nodesByBlockHintId = new Map<string, ContentNode[]>();

  for (const node of contentNodes) {
    if (!node.blockHintId) {
      continue;
    }

    const existing = nodesByBlockHintId.get(node.blockHintId);
    if (existing) {
      existing.push(node);
      continue;
    }

    nodesByBlockHintId.set(node.blockHintId, [node]);
  }

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
      const blockHintId = buildAssistantBlockHintId(message);

      blocks.push({
        type: 'assistant-turn',
        id: blockHintId,
        runId: message.runId ?? null,
        sourceMessages: groupedMessages,
        items: buildAssistantTurnItems({
          nodes: nodesByBlockHintId.get(blockHintId) ?? [],
          partsById,
          runId: message.runId ?? null,
          idBase: message.id
        })
      });

      index = nextIndex;
      continue;
    }

    const blockHintId = buildAssistantBlockHintId(message);
    blocks.push({
      type: 'assistant-turn',
      id: blockHintId,
      runId: message.runId ?? null,
      sourceMessages: [message],
      items: buildAssistantTurnItems({
        nodes: nodesByBlockHintId.get(blockHintId) ?? [],
        partsById,
        runId: message.runId ?? null,
        idBase: message.id
      })
    });
  }

  return blocks;
}
