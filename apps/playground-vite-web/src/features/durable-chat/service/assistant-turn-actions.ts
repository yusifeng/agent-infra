import type { AssistantTurnItem, TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';

export type AssistantTurnActionContext = {
  copyText: string;
  showActions: boolean;
};

function isCopyableAssistantItem(item: AssistantTurnItem) {
  return item.type === 'text' || item.type === 'reasoning';
}

export function collectAssistantTurnCopyText(items: AssistantTurnItem[]) {
  return items
    .flatMap((item) => {
      if (!isCopyableAssistantItem(item)) {
        return [];
      }

      return item.part.textValue ? [item.part.textValue] : [];
    })
    .join('\n\n')
    .trim();
}

export function buildAssistantTurnActionContexts(blocks: TranscriptBlock[]) {
  const contexts = new Map<string, AssistantTurnActionContext>();

  for (const block of blocks) {
    if (!block || block.type !== 'assistant-turn') {
      continue;
    }

    const copyText = collectAssistantTurnCopyText(block.items);
    contexts.set(block.id, {
      copyText,
      showActions: copyText.length > 0
    });
  }

  return contexts;
}
