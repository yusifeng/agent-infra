import { normalizeRunAttachStreamEvent, normalizeRunStreamEvent } from '@agent-infra/durable-chat-client';

import type {
  PlaygroundPrivateStreamEventDto,
  PlaygroundStreamEventDto,
  ThreadTitleUpdatedEventDto
} from '@/features/durable-chat/types/playground-stream';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

export function normalizePlaygroundPrivateStreamEvent(value: unknown): PlaygroundPrivateStreamEventDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const type = asString(record.type);
  if (type !== 'thread.title_updated') {
    return null;
  }

  const threadId = asString(record.threadId);
  const title = asString(record.title);
  const updatedAt = asString(record.updatedAt);
  if (!threadId || title === null || !updatedAt) {
    return null;
  }

  const event: ThreadTitleUpdatedEventDto = {
    type,
    threadId,
    title,
    updatedAt
  };
  return event;
}

export function normalizePlaygroundStreamEvent(value: unknown): PlaygroundStreamEventDto | null {
  return normalizeRunAttachStreamEvent(value) ?? normalizeRunStreamEvent(value) ?? normalizePlaygroundPrivateStreamEvent(value);
}

export function parsePlaygroundSseChunk(buffer: string) {
  const frames = buffer.replaceAll('\r\n', '\n').split('\n\n');
  const remainder = frames.pop() ?? '';
  const events: PlaygroundStreamEventDto[] = [];

  for (const frame of frames) {
    const lines = frame.split('\n');
    let eventName = '';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
        continue;
      }

      if (line.startsWith('data:')) {
        const dataLine = line.slice(5);
        dataLines.push(dataLine.startsWith(' ') ? dataLine.slice(1) : dataLine);
      }
    }

    const data = dataLines.join('\n');
    if (!eventName || !data) {
      continue;
    }

    try {
      const parsed = normalizePlaygroundStreamEvent(JSON.parse(data));
      if (parsed?.type === eventName) {
        events.push(parsed);
      }
    } catch {
      continue;
    }
  }

  return {
    events,
    remainder
  };
}
