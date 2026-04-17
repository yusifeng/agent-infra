export { assistantMessageHasVisibleContent, messagePartHasVisibleContent } from '@agent-infra/durable-chat-client';
import type { MessageDto } from '@agent-infra/contracts';

export async function copyTextToClipboard(text: string) {
  const normalizedText = text.trim();
  if (!normalizedText || typeof navigator === 'undefined' || !navigator.clipboard) {
    return;
  }

  await navigator.clipboard.writeText(normalizedText);
}

export async function copyMessageToClipboard(message: MessageDto) {
  const text = message.parts
    .flatMap((part) => {
      if (part.type === 'text' || part.type === 'reasoning' || part.type === 'tool-result') {
        return part.textValue ? [part.textValue] : [];
      }

      return [];
    })
    .join('\n\n')
    .trim();

  await copyTextToClipboard(text);
}
