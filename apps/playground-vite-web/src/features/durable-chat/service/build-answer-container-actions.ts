import type { AnswerContainer, AnswerContainerActionContext } from '@/features/durable-chat/types/answer-containers';
import type { AssistantTurnItem } from '@/features/durable-chat/types/transcript-blocks';

function collectCopyableParts(items: AssistantTurnItem[], type: 'text' | 'reasoning') {
  return items.flatMap((item) => {
    if (item.type !== type) {
      return [];
    }

    return item.part.textValue?.trim() ? [item.part] : [];
  });
}

export function buildAnswerContainerActionContexts(containers: AnswerContainer[]) {
  const contexts = new Map<string, AnswerContainerActionContext>();

  for (const container of containers) {
    const items = container.blocks.flatMap((block) => block.items);
    const copyableTextParts = collectCopyableParts(items, 'text');
    const copyableReasoningParts = collectCopyableParts(items, 'reasoning');
    const hasSearchItems = items.some((item) => item.type === 'search-status' || item.type === 'search-summary');
    const hasToolItems = items.some((item) => item.type === 'tool-part');

    contexts.set(container.actionHostId, {
      hostId: container.actionHostId,
      copyableTextParts,
      copyableReasoningParts,
      hasVisibleOperation: copyableTextParts.length > 0 || copyableReasoningParts.length > 0,
      payloadScope: {
        text: copyableTextParts.length > 0,
        reasoning: copyableReasoningParts.length > 0,
        search: hasSearchItems,
        tool: hasToolItems
      }
    });
  }

  return contexts;
}
