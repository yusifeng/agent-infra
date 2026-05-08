import type { MessagePartDto } from '@agent-infra/contracts';

import type { SearchSummaryEntry } from '@/features/durable-chat/types/transcript-blocks';

export type ContentNodeKind =
  | 'user-text'
  | 'user-reasoning'
  | 'assistant-text'
  | 'assistant-reasoning'
  | 'assistant-search-loading'
  | 'assistant-search-summary'
  | 'assistant-tool-part';

export type BaseContentNode = {
  id: string;
  kind: ContentNodeKind;
  threadId: string;
  runId: string | null;
  messageId: string | null;
  sourcePartId: string | null;
  blockHintId: string | null;
};

export type UserTextContentNode = BaseContentNode & {
  kind: 'user-text';
  text: string;
};

export type UserReasoningContentNode = BaseContentNode & {
  kind: 'user-reasoning';
  text: string;
};

export type AssistantTextContentNode = BaseContentNode & {
  kind: 'assistant-text';
  text: string;
  cacheKey: string;
};

export type AssistantReasoningContentNode = BaseContentNode & {
  kind: 'assistant-reasoning';
  text: string;
};

export type AssistantSearchLoadingContentNode = BaseContentNode & {
  kind: 'assistant-search-loading';
  toolCallId: string;
  query: string;
};

export type AssistantSearchSummaryContentNode = BaseContentNode & {
  kind: 'assistant-search-summary';
  entry: SearchSummaryEntry;
};

export type AssistantToolPartContentNode = BaseContentNode & {
  kind: 'assistant-tool-part';
  part: MessagePartDto;
};

export type ContentNode =
  | UserTextContentNode
  | UserReasoningContentNode
  | AssistantTextContentNode
  | AssistantReasoningContentNode
  | AssistantSearchLoadingContentNode
  | AssistantSearchSummaryContentNode
  | AssistantToolPartContentNode;
