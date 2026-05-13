import type { MessageDto } from '@agent-infra/contracts';

import { buildContentNodes } from '@/features/durable-chat/service/build-content-nodes';
import { projectNormalTranscriptBlocks } from '@/features/durable-chat/service/project-normal-transcript-blocks';
import type { TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';

export function buildTranscriptBlocks(messages: MessageDto[]): TranscriptBlock[] {
  return projectNormalTranscriptBlocks({
    messages,
    contentNodes: buildContentNodes(messages)
  });
}

export function filterTranscriptBlocksForLiveRun(blocks: TranscriptBlock[], liveRunId: string | null): TranscriptBlock[] {
  if (!liveRunId) {
    return blocks;
  }

  return blocks.filter((block) => block.type !== 'assistant-turn' || block.runId !== liveRunId);
}
