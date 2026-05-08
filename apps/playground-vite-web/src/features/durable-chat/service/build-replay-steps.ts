import type { MessageDto } from '@agent-infra/contracts';

import { buildContentNodes } from '@/features/durable-chat/service/build-content-nodes';
import { getReplayNodeDelayMs, getReplayTextDelayMs } from '@/features/durable-chat/service/replay-timing';
import type { ContentNode } from '@/features/durable-chat/types/content-nodes';
import type {
  ReplaySearchLoadingStep,
  ReplaySearchSummaryStep,
  ReplaySession,
  ReplayStep,
  ReplayTextRole,
  ReplayTextStep
} from '@/features/durable-chat/types/replay';
import type { SearchSummaryEntry, TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';

function resolveThreadId(contentNodes: ContentNode[]) {
  const firstNode = contentNodes[0];
  if (!firstNode) {
    return '';
  }

  return firstNode.threadId;
}

function resolveThreadIdFromBlocks(blocks: TranscriptBlock[]) {
  const firstBlock = blocks[0];
  if (!firstBlock) {
    return '';
  }

  if (firstBlock.type === 'user-message') {
    return firstBlock.message.threadId;
  }

  return firstBlock.sourceMessages[0]?.threadId ?? '';
}

function createTextStep(params: {
  threadId: string;
  blockId: string;
  runId: string | null;
  messageId: string;
  role: ReplayTextRole;
  variant: 'text' | 'reasoning';
  content: string;
}): ReplayTextStep {
  const step: ReplayTextStep = {
    id: `${params.blockId}:${params.messageId}:${params.variant}:${params.content.length}`,
    kind: 'text',
    threadId: params.threadId,
    runId: params.runId,
    messageId: params.messageId,
    blockId: params.blockId,
    role: params.role,
    variant: params.variant,
    content: params.content,
    sourceMessageIds: [params.messageId],
    delayMs: 0
  };

  step.delayMs = getReplayTextDelayMs(step);
  return step;
}

function createSearchLoadingStep(params: {
  threadId: string;
  blockId: string;
  runId: string | null;
  messageId: string;
  toolCallId: string;
  query: string | null;
  sourceNames: string[];
  resultCount?: number;
}): ReplaySearchLoadingStep {
  return {
    id: `${params.blockId}:${params.toolCallId}:loading`,
    kind: 'search-loading',
    threadId: params.threadId,
    runId: params.runId,
    messageId: params.messageId,
    blockId: params.blockId,
    toolCallIds: [params.toolCallId],
    query: params.query,
    sourceNames: params.sourceNames,
    delayMs: getReplayNodeDelayMs('search-loading', { resultCount: params.resultCount })
  };
}

function createSearchSummaryStep(params: {
  threadId: string;
  blockId: string;
  runId: string | null;
  messageId: string;
  entry: SearchSummaryEntry;
}): ReplaySearchSummaryStep {
  return {
    id: `${params.blockId}:${params.entry.toolCallId}:summary`,
    kind: 'search-summary',
    threadId: params.threadId,
    runId: params.runId,
    messageId: params.messageId,
    blockId: params.blockId,
    toolCallIds: [params.entry.toolCallId],
    query: params.entry.query,
    resultCount: params.entry.resultCount,
    sourceNames: params.entry.sourceNames,
    sources: params.entry.sources,
    delayMs: getReplayNodeDelayMs('search-summary')
  };
}

export function buildReplayStepsFromContentNodes(contentNodes: ContentNode[], fallbackThreadId = ''): ReplayStep[] {
  const threadId = resolveThreadId(contentNodes) || fallbackThreadId;
  const steps: ReplayStep[] = [];

  for (const node of contentNodes) {
    const blockId = node.blockHintId ?? node.id;
    const messageId = node.messageId ?? node.id;

    if (node.kind === 'user-text' || node.kind === 'user-reasoning') {
      steps.push(
        createTextStep({
          threadId,
          blockId,
          runId: node.runId,
          messageId,
          role: 'user',
          variant: node.kind === 'user-reasoning' ? 'reasoning' : 'text',
          content: node.text
        })
      );
      continue;
    }

    if (node.kind === 'assistant-text' || node.kind === 'assistant-reasoning') {
      steps.push(
        createTextStep({
          threadId,
          blockId,
          runId: node.runId,
          messageId,
          role: 'assistant',
          variant: node.kind === 'assistant-reasoning' ? 'reasoning' : 'text',
          content: node.text
        })
      );
      continue;
    }

    if (node.kind === 'assistant-search-loading') {
      steps.push(
        createSearchLoadingStep({
          threadId,
          blockId,
          runId: node.runId,
          messageId,
          toolCallId: node.toolCallId,
          query: node.query || null,
          sourceNames: []
        })
      );
      continue;
    }

    if (node.kind !== 'assistant-search-summary') {
      continue;
    }

    const loadingIndex = steps.findIndex(
      (step) =>
        step.kind === 'search-loading' &&
        step.blockId === blockId &&
        step.toolCallIds.includes(node.entry.toolCallId)
    );

    if (loadingIndex >= 0) {
      const loadingStep = steps[loadingIndex] as ReplaySearchLoadingStep;
      loadingStep.sourceNames = node.entry.sourceNames;
      loadingStep.delayMs = getReplayNodeDelayMs('search-loading', { resultCount: node.entry.resultCount });
    } else {
      steps.push(
        createSearchLoadingStep({
          threadId,
          blockId,
          runId: node.runId,
          messageId,
          toolCallId: node.entry.toolCallId,
          query: node.entry.query,
          sourceNames: node.entry.sourceNames,
          resultCount: node.entry.resultCount
        })
      );
    }

    steps.push(
      createSearchSummaryStep({
        threadId,
        blockId,
        runId: node.runId,
        messageId,
        entry: node.entry
      })
    );
  }

  steps.push({
    id: `replay:${threadId}:done:${steps.length}`,
    kind: 'done',
    threadId,
    runId: null,
    messageId: null,
    blockId: null,
    delayMs: getReplayNodeDelayMs('done')
  });

  return steps;
}

function extractMessagesFromBlocks(blocks: TranscriptBlock[]): MessageDto[] {
  const messages: MessageDto[] = [];
  const seenMessageIds = new Set<string>();

  for (const block of blocks) {
    if (block.type === 'user-message') {
      if (!seenMessageIds.has(block.message.id)) {
        seenMessageIds.add(block.message.id);
        messages.push(block.message);
      }
      continue;
    }

    for (const message of block.sourceMessages) {
      if (seenMessageIds.has(message.id)) {
        continue;
      }

      seenMessageIds.add(message.id);
      messages.push(message);
    }
  }

  return messages;
}

export function buildReplaySteps(blocks: TranscriptBlock[]): ReplayStep[] {
  return buildReplayStepsFromContentNodes(
    buildContentNodes(extractMessagesFromBlocks(blocks)),
    resolveThreadIdFromBlocks(blocks)
  );
}

export function buildReplaySessionFromContentNodes(contentNodes: ContentNode[], fallbackThreadId = ''): ReplaySession {
  const steps = buildReplayStepsFromContentNodes(contentNodes, fallbackThreadId);
  const threadId = resolveThreadId(contentNodes) || fallbackThreadId;

  return {
    id: `replay:${threadId}:${steps.map((step) => step.id).join('|')}`,
    threadId,
    mode: 'thread',
    steps,
    initialTranscriptBlocks: [],
    startedAt: null
  };
}

export function buildReplaySession(blocks: TranscriptBlock[]): ReplaySession {
  return buildReplaySessionFromContentNodes(
    buildContentNodes(extractMessagesFromBlocks(blocks)),
    resolveThreadIdFromBlocks(blocks)
  );
}
