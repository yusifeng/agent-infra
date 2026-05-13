import type { PublicChatShareResult } from '@agent-infra/app';

function asJsonRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function isPolicyToolResultPart(part: { type: string; jsonValue?: Record<string, unknown> | null }) {
  if (part.type !== 'tool-result') {
    return false;
  }

  const details = asJsonRecord(part.jsonValue?.details);
  return details?.status === 'blocked_by_policy' || details?.status === 'redirected_by_policy';
}

function readToolCallId(part: { jsonValue?: Record<string, unknown> | null }) {
  return typeof part.jsonValue?.toolCallId === 'string' ? part.jsonValue.toolCallId : null;
}

export function sanitizeMessagesForUi<
  TMessage extends { parts: TPart[] },
  TPart extends { type: string; jsonValue?: Record<string, unknown> | null }
>(messages: TMessage[]) {
  const blockedToolCallIds = new Set(
    messages
      .flatMap((message) => message.parts)
      .filter((part) => isPolicyToolResultPart(part))
      .map((part) => readToolCallId(part))
      .filter((toolCallId): toolCallId is string => Boolean(toolCallId))
  );

  if (blockedToolCallIds.size === 0) {
    return messages;
  }

  return messages.flatMap((message) => {
    const parts = message.parts.filter((part) => {
      const toolCallId = readToolCallId(part);
      if (!toolCallId || !blockedToolCallIds.has(toolCallId)) {
        return true;
      }

      return part.type !== 'tool-call' && part.type !== 'tool-result';
    });

    if (parts.length === 0) {
      return [];
    }

    return [{ ...message, parts }];
  });
}

export function sanitizePublicShareForUi(result: PublicChatShareResult): PublicChatShareResult {
  return {
    ...result,
    snapshot: {
      ...result.snapshot,
      messages: sanitizeMessagesForUi(result.snapshot.messages)
    }
  };
}
