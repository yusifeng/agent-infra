import type { MessageDto, MessagePartDto } from '@agent-infra/contracts';

export function messagePartHasVisibleContent(part: MessagePartDto) {
  if (part.type === 'text' || part.type === 'reasoning') {
    return Boolean(part.textValue?.trim());
  }

  if (part.type === 'tool-result') {
    return Boolean(part.textValue?.trim() || part.jsonValue !== null);
  }

  if (part.type === 'tool-call') {
    return part.jsonValue !== null;
  }

  return Boolean(part.textValue?.trim() || part.jsonValue);
}

export function assistantMessageHasVisibleContent(message: MessageDto) {
  if (message.role !== 'assistant') {
    return false;
  }

  return message.parts.some(messagePartHasVisibleContent);
}
