export { assistantMessageHasVisibleContent, messagePartHasVisibleContent } from '@agent-infra/durable-chat-client';
import type { MessageDto } from '@agent-infra/contracts';

import { writeClipboardText } from '@/features/durable-chat/repo/browser-clipboard';

export async function copyTextToClipboard(text: string) {
  await writeClipboardText(text);
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
