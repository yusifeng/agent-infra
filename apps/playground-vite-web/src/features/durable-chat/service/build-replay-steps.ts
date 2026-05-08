import { parseSearchLoadingEntry, parseSearchSummaryEntry } from '@/features/durable-chat/service/content-node-search';
import { getReplayNodeDelayMs, getReplayTextDelayMs } from '@/features/durable-chat/service/replay-timing';
import type {
  ReplaySearchLoadingStep,
  ReplaySearchSummaryStep,
  ReplaySession,
  ReplayStep,
  ReplayTextRole,
  ReplayTextStep
} from '@/features/durable-chat/types/replay';
import type { SearchSummaryEntry, TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';

function resolveThreadId(blocks: TranscriptBlock[]) {
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

function buildUserReplaySteps(block: Extract<TranscriptBlock, { type: 'user-message' }>, threadId: string): ReplayStep[] {
  const steps: ReplayStep[] = [];

  for (const part of block.message.parts) {
    if ((part.type === 'text' || part.type === 'reasoning') && part.textValue?.trim()) {
      steps.push(
        createTextStep({
          threadId,
          blockId: block.id,
          runId: block.message.runId ?? null,
          messageId: block.message.id,
          role: 'user',
          variant: part.type === 'reasoning' ? 'reasoning' : 'text',
          content: part.textValue.trim()
        })
      );
    }
  }

  return steps;
}

function buildAssistantReplaySteps(block: Extract<TranscriptBlock, { type: 'assistant-turn' }>, threadId: string): ReplayStep[] {
  const steps: ReplayStep[] = [];

  for (const message of block.sourceMessages) {
    for (const part of message.parts) {
      if ((part.type === 'text' || part.type === 'reasoning') && part.textValue?.trim()) {
        steps.push(
          createTextStep({
            threadId,
            blockId: block.id,
            runId: block.runId,
            messageId: message.id,
            role: 'assistant',
            variant: part.type === 'reasoning' ? 'reasoning' : 'text',
            content: part.textValue.trim()
          })
        );
        continue;
      }

      const searchStatus = parseSearchLoadingEntry(part);
      if (searchStatus) {
        steps.push(
          createSearchLoadingStep({
            threadId,
            blockId: block.id,
            runId: block.runId,
            messageId: message.id,
            toolCallId: searchStatus.toolCallId,
            query: searchStatus.query || null,
            sourceNames: []
          })
        );
        continue;
      }

      const searchEntry = parseSearchSummaryEntry(part);
      if (searchEntry) {
        const loadingIndex = steps.findIndex(
          (step) =>
            step.kind === 'search-loading' &&
            step.blockId === block.id &&
            step.toolCallIds.includes(searchEntry.toolCallId)
        );

        if (loadingIndex >= 0) {
          const loadingStep = steps[loadingIndex] as ReplaySearchLoadingStep;
          loadingStep.sourceNames = searchEntry.sourceNames;
          loadingStep.delayMs = getReplayNodeDelayMs('search-loading', { resultCount: searchEntry.resultCount });
        } else {
          steps.push(
            createSearchLoadingStep({
              threadId,
              blockId: block.id,
              runId: block.runId,
              messageId: message.id,
              toolCallId: searchEntry.toolCallId,
              query: searchEntry.query,
              sourceNames: searchEntry.sourceNames,
              resultCount: searchEntry.resultCount
            })
          );
        }

        steps.push(
          createSearchSummaryStep({
            threadId,
            blockId: block.id,
            runId: block.runId,
            messageId: message.id,
            entry: searchEntry
          })
        );
      }
    }
  }

  return steps;
}

export function buildReplaySteps(blocks: TranscriptBlock[]): ReplayStep[] {
  const threadId = resolveThreadId(blocks);
  const steps: ReplayStep[] = [];

  for (const block of blocks) {
    if (block.type === 'user-message') {
      steps.push(...buildUserReplaySteps(block, threadId));
      continue;
    }

    steps.push(...buildAssistantReplaySteps(block, threadId));
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

export function buildReplaySession(blocks: TranscriptBlock[]): ReplaySession {
  const steps = buildReplaySteps(blocks);
  const threadId = resolveThreadId(blocks);

  return {
    id: `replay:${threadId}:${steps.map((step) => step.id).join('|')}`,
    threadId,
    mode: 'thread',
    steps,
    initialTranscriptBlocks: [],
    startedAt: null
  };
}
