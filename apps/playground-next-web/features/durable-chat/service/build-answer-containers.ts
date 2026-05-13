import type { AnswerContainer } from '@/features/durable-chat/types/answer-containers';
import type { TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';

function createContainerId(runId: string | null, blockIds: string[]) {
  if (runId) {
    return `answer-container:${runId}:${blockIds[0] ?? 'empty'}`;
  }

  return `answer-container:legacy:${blockIds.join('|')}`;
}

function createAnswerContainer(blocks: Extract<TranscriptBlock, { type: 'assistant-turn' }>[]): AnswerContainer {
  const runId = blocks[0]?.runId ?? null;
  const transcriptBlockIds = blocks.map((block) => block.id);
  const id = createContainerId(runId, transcriptBlockIds);

  return {
    id,
    kind: 'assistant-answer',
    runId,
    transcriptBlockIds,
    blocks,
    actionHostId: id
  };
}

function canGroupIntoContainer(
  previous: Extract<TranscriptBlock, { type: 'assistant-turn' }> | null,
  next: TranscriptBlock
): next is Extract<TranscriptBlock, { type: 'assistant-turn' }> {
  return previous !== null && next.type === 'assistant-turn' && previous.runId !== null && previous.runId === next.runId;
}

export function buildAnswerContainers(blocks: TranscriptBlock[]): AnswerContainer[] {
  const containers: AnswerContainer[] = [];
  let pendingBlocks: Extract<TranscriptBlock, { type: 'assistant-turn' }>[] = [];
  let previousAssistantBlock: Extract<TranscriptBlock, { type: 'assistant-turn' }> | null = null;

  function flushPendingBlocks() {
    if (pendingBlocks.length === 0) {
      return;
    }

    containers.push(createAnswerContainer(pendingBlocks));
    pendingBlocks = [];
    previousAssistantBlock = null;
  }

  for (const block of blocks) {
    if (block.type !== 'assistant-turn') {
      flushPendingBlocks();
      continue;
    }

    if (pendingBlocks.length === 0) {
      pendingBlocks.push(block);
      previousAssistantBlock = block;
      continue;
    }

    if (canGroupIntoContainer(previousAssistantBlock, block)) {
      pendingBlocks.push(block);
      previousAssistantBlock = block;
      continue;
    }

    flushPendingBlocks();
    pendingBlocks.push(block);
    previousAssistantBlock = block;
  }

  flushPendingBlocks();

  return containers;
}
