import type { MessagePartDto } from '@agent-infra/contracts';

import type { TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';

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
  blocks: TranscriptBlock[];
  actionHostId: string;
};

export type AnswerContainerActionContext = {
  hostId: string;
  copyableTextParts: MessagePartDto[];
  copyableReasoningParts: MessagePartDto[];
  hasVisibleOperation: boolean;
  payloadScope: ActionPayloadScope;
};
