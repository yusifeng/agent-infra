import type { MessagePartDto } from '@agent-infra/contracts';

import type { TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';

export type AnswerContainerBlock = Extract<TranscriptBlock, { type: 'assistant-turn' }>;

export type AnswerContainerKind = 'assistant-answer';

export type AnswerContainerItemRef = {
  transcriptBlockId: string;
  itemId: string;
};

export type ActionPayloadScope = {
  text: boolean;
  reasoning: boolean;
  search: boolean;
  tool: boolean;
};

export type AnswerContainer = {
  id: string;
  kind: AnswerContainerKind;
  runId: string | null;
  transcriptBlockIds: string[];
  blocks: AnswerContainerBlock[];
  actionHostId: string;
};

export type AnswerContainerActionContext = {
  hostId: string;
  copyableTextParts: MessagePartDto[];
  copyableReasoningParts: MessagePartDto[];
  hasVisibleOperation: boolean;
  payloadScope: ActionPayloadScope;
};
