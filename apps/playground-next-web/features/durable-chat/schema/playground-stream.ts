export type ThreadTitleUpdatedEvent = {
  type: 'thread.title_updated';
  threadId: string;
  title: string;
  updatedAt: string;
};

export type PlaygroundStreamEvent = ThreadTitleUpdatedEvent;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

export function normalizePlaygroundStreamEvent(value: unknown): PlaygroundStreamEvent | null {
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

  return {
    type,
    threadId,
    title,
    updatedAt
  };
}

export function parsePlaygroundSseChunk(buffer: string) {
  const frames = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const remainder = frames.pop() ?? '';
  const events: unknown[] = [];

  for (const frame of frames) {
    const lines = frame.split('\n');
    let data = '';

    for (const line of lines) {
      if (line.startsWith('data:')) {
        data += line.slice(5).trim();
      }
    }

    if (!data) {
      continue;
    }

    try {
      events.push(JSON.parse(data));
    } catch {
      continue;
    }
  }

  return {
    events,
    remainder
  };
}
