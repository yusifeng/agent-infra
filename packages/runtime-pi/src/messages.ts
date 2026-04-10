import type { Message, MessagePart } from '@agent-infra/core';
import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { ImageContent, Model, TextContent, ToolCall, ToolResultMessage } from '@mariozechner/pi-ai';

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0
  }
};

function buildTextBlocks(parts: MessagePart[]): TextContent[] {
  return parts
    .filter((part) => part.type === 'text' && typeof part.textValue === 'string' && part.textValue.length > 0)
    .map((part) => ({ type: 'text', text: part.textValue ?? '' }));
}

function parseImageBlocks(value: unknown): ImageContent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (block): block is ImageContent =>
      typeof block === 'object' &&
      block !== null &&
      (block as { type?: unknown }).type === 'image' &&
      typeof (block as { data?: unknown }).data === 'string' &&
      typeof (block as { mimeType?: unknown }).mimeType === 'string'
  );
}

function parseToolCall(part: MessagePart): ToolCall | null {
  const value = part.jsonValue;
  if (!value || typeof value.toolName !== 'string' || typeof value.toolCallId !== 'string') {
    return null;
  }

  return {
    type: 'toolCall',
    id: value.toolCallId,
    name: value.toolName,
    arguments: typeof value.input === 'object' && value.input !== null ? (value.input as Record<string, unknown>) : {}
  };
}

function parseToolResultContent(part: MessagePart): Array<TextContent | ImageContent> {
  const value = part.jsonValue;
  const content = value?.content;

  if (Array.isArray(content)) {
    return [
      ...content.filter(
        (block): block is TextContent => typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text' && typeof (block as { text?: unknown }).text === 'string'
      ),
      ...parseImageBlocks(content)
    ];
  }

  if (typeof part.textValue === 'string' && part.textValue.length > 0) {
    return [{ type: 'text', text: part.textValue }];
  }

  return [];
}

function buildAssistantContent(parts: MessagePart[]): Array<TextContent | ToolCall | { type: 'thinking'; thinking: string }> {
  const sorted = [...parts].sort((left, right) => left.partIndex - right.partIndex);
  const content: Array<TextContent | ToolCall | { type: 'thinking'; thinking: string }> = [];

  for (const part of sorted) {
    if (part.type === 'text' && typeof part.textValue === 'string' && part.textValue.length > 0) {
      content.push({ type: 'text', text: part.textValue });
      continue;
    }

    if (part.type === 'reasoning' && typeof part.textValue === 'string' && part.textValue.length > 0) {
      content.push({ type: 'thinking', thinking: part.textValue });
      continue;
    }

    if (part.type === 'tool-call') {
      const toolCall = parseToolCall(part);
      if (toolCall) {
        content.push(toolCall);
      }
    }
  }

  return content;
}

export function buildInitialAgentState(
  history: Array<Message & { parts: MessagePart[] }>,
  model: Model<any>,
  defaultSystemPrompt: string
): {
  systemPrompt: string;
  messages: AgentMessage[];
} {
  const systemPromptParts: string[] = [];
  const messages: AgentMessage[] = [];

  for (const message of history) {
    if (message.role === 'system') {
      const prompt = buildTextBlocks(message.parts)
        .map((part) => part.text)
        .join('\n')
        .trim();

      if (prompt) {
        systemPromptParts.push(prompt);
      }
      continue;
    }

    if (message.role === 'user') {
      const textBlocks = buildTextBlocks(message.parts);
      const imageBlocks = message.parts.flatMap((part) => parseImageBlocks(part.jsonValue?.content));
      const content = imageBlocks.length > 0 ? [...textBlocks, ...imageBlocks] : textBlocks.map((part) => part.text).join('\n').trim();
      messages.push({
        role: 'user',
        content: typeof content === 'string' ? content : content.length === 1 && content[0]?.type === 'text' ? content[0].text : content,
        timestamp: message.createdAt.getTime()
      });
      continue;
    }

    if (message.role === 'assistant') {
      const content = buildAssistantContent(message.parts);
      messages.push({
        role: 'assistant',
        content,
        api: typeof message.metadata?.api === 'string' ? message.metadata.api : model.api,
        provider: typeof message.metadata?.provider === 'string' ? message.metadata.provider : model.provider,
        model: typeof message.metadata?.model === 'string' ? message.metadata.model : model.id,
        usage: structuredClone(EMPTY_USAGE),
        stopReason: content.some((part) => part.type === 'toolCall') ? 'toolUse' : 'stop',
        timestamp: message.createdAt.getTime()
      });
      continue;
    }

    if (message.role === 'tool') {
      const toolResultPart = message.parts.find((part) => part.type === 'tool-result');
      if (!toolResultPart) {
        continue;
      }

      const value = toolResultPart.jsonValue ?? {};
      const toolResult: ToolResultMessage = {
        role: 'toolResult',
        toolCallId: typeof value.toolCallId === 'string' ? value.toolCallId : message.id,
        toolName: typeof value.toolName === 'string' ? value.toolName : 'unknown',
        content: parseToolResultContent(toolResultPart),
        details: value.details,
        isError: value.isError === true,
        timestamp: message.createdAt.getTime()
      };

      messages.push(toolResult);
    }
  }

  return {
    systemPrompt: systemPromptParts.join('\n\n').trim() || defaultSystemPrompt,
    messages
  };
}

export function convertToLlm(messages: AgentMessage[]) {
  return messages.filter((message) => message.role === 'user' || message.role === 'assistant' || message.role === 'toolResult');
}
