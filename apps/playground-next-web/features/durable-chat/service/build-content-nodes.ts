import type { MessageDto } from '@agent-infra/contracts';

import { parseSearchLoadingEntry, parseSearchSummaryEntry } from '@/features/durable-chat/service/content-node-search';
import type { ContentNode } from '@/features/durable-chat/types/content-nodes';

function isAssistantTurnMessage(message: MessageDto) {
  return message.role === 'assistant' || (message.role === 'tool' && Boolean(message.runId));
}

function collectAssistantTurnMessages(messages: MessageDto[], startIndex: number) {
  const firstMessage = messages[startIndex]!;
  const groupedMessages = [firstMessage];
  const runId = firstMessage.runId;
  let index = startIndex;

  while (index + 1 < messages.length) {
    const nextMessage = messages[index + 1]!;
    if (runId && nextMessage.role === 'tool' && nextMessage.runId === runId) {
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

function buildUserBlockHintId(message: MessageDto) {
  return `user-message:${message.id}`;
}

function buildAssistantBlockHintId(message: MessageDto) {
  return `assistant-turn:${message.runId ?? message.id}:${message.seq}`;
}

function createNodeId(messageId: string, partId: string, kind: ContentNode['kind']) {
  return `content-node:${messageId}:${partId}:${kind}`;
}

export function buildContentNodes(messages: MessageDto[]): ContentNode[] {
  const nodes: ContentNode[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!;

    if (message.role === 'user') {
      const blockHintId = buildUserBlockHintId(message);

      for (const part of message.parts) {
        if (!part.textValue?.trim()) {
          continue;
        }

        if (part.type === 'text') {
          nodes.push({
            id: createNodeId(message.id, part.id, 'user-text'),
            kind: 'user-text',
            threadId: message.threadId,
            runId: message.runId ?? null,
            messageId: message.id,
            sourcePartId: part.id,
            blockHintId,
            text: part.textValue.trim()
          });
          continue;
        }

        if (part.type === 'reasoning') {
          nodes.push({
            id: createNodeId(message.id, part.id, 'user-reasoning'),
            kind: 'user-reasoning',
            threadId: message.threadId,
            runId: message.runId ?? null,
            messageId: message.id,
            sourcePartId: part.id,
            blockHintId,
            text: part.textValue.trim()
          });
        }
      }

      continue;
    }

    if (!isAssistantTurnMessage(message)) {
      continue;
    }

    const { groupedMessages, nextIndex } = collectAssistantTurnMessages(messages, index);
    const blockHintId = buildAssistantBlockHintId(message);

    for (const groupedMessage of groupedMessages) {
      for (const part of groupedMessage.parts) {
        if (part.type === 'text' && part.textValue?.trim()) {
          nodes.push({
            id: createNodeId(groupedMessage.id, part.id, 'assistant-text'),
            kind: 'assistant-text',
            threadId: groupedMessage.threadId,
            runId: groupedMessage.runId ?? null,
            messageId: groupedMessage.id,
            sourcePartId: part.id,
            blockHintId,
            text: part.textValue.trim(),
            cacheKey: `${groupedMessage.id}:${part.id}`
          });
          continue;
        }

        if (part.type === 'reasoning' && part.textValue?.trim()) {
          nodes.push({
            id: createNodeId(groupedMessage.id, part.id, 'assistant-reasoning'),
            kind: 'assistant-reasoning',
            threadId: groupedMessage.threadId,
            runId: groupedMessage.runId ?? null,
            messageId: groupedMessage.id,
            sourcePartId: part.id,
            blockHintId,
            text: part.textValue.trim()
          });
          continue;
        }

        const searchLoadingEntry = parseSearchLoadingEntry(part);
        if (searchLoadingEntry) {
          nodes.push({
            id: createNodeId(groupedMessage.id, part.id, 'assistant-search-loading'),
            kind: 'assistant-search-loading',
            threadId: groupedMessage.threadId,
            runId: groupedMessage.runId ?? null,
            messageId: groupedMessage.id,
            sourcePartId: part.id,
            blockHintId,
            toolCallId: searchLoadingEntry.toolCallId,
            query: searchLoadingEntry.query
          });
          continue;
        }

        const searchSummaryEntry = parseSearchSummaryEntry(part);
        if (searchSummaryEntry) {
          nodes.push({
            id: createNodeId(groupedMessage.id, part.id, 'assistant-search-summary'),
            kind: 'assistant-search-summary',
            threadId: groupedMessage.threadId,
            runId: groupedMessage.runId ?? null,
            messageId: groupedMessage.id,
            sourcePartId: part.id,
            blockHintId,
            entry: searchSummaryEntry
          });
          continue;
        }

        if (part.type === 'tool-call' || part.type === 'tool-result') {
          nodes.push({
            id: createNodeId(groupedMessage.id, part.id, 'assistant-tool-part'),
            kind: 'assistant-tool-part',
            threadId: groupedMessage.threadId,
            runId: groupedMessage.runId ?? null,
            messageId: groupedMessage.id,
            sourcePartId: part.id,
            blockHintId,
            part
          });
        }
      }
    }

    index = nextIndex;
  }

  return nodes;
}
