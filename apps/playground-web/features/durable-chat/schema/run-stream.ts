import type {
  RunStreamAssistantEventDto,
  RunStreamAssistantSnapshotDto,
  RunStreamCompletedEventDto,
  RunStreamEventDto,
  RunStreamFailedEventDto,
  RunStreamReadyEventDto,
  RunStreamStateEventDto
} from '@agent-infra/contracts';

import { normalizeMessage, normalizeRun } from './api';

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

function asNullableString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === 'string' ? value : null;
}

function normalizeAssistantSnapshot(value: unknown): RunStreamAssistantSnapshotDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const messageId = asString(record.messageId);
  const eventType = asString(record.eventType) as RunStreamAssistantSnapshotDto['eventType'] | null;
  const partialText = asString(record.partialText);
  const partialReasoning = asNullableString(record.partialReasoning);

  if (!messageId || !eventType || partialText === null) {
    return null;
  }

  return {
    messageId,
    eventType,
    partialText,
    partialReasoning
  };
}

export function normalizeRunStreamEvent(value: unknown): RunStreamEventDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const type = asString(record.type);
  const runId = asString(record.runId);
  if (!type || !runId) {
    return null;
  }

  switch (type) {
    case 'run.ready': {
      const run = normalizeRun(record.run);
      const userMessage = normalizeMessage(record.userMessage);
      if (!run || !userMessage) {
        return null;
      }

      const event: RunStreamReadyEventDto = {
        type,
        runId,
        run,
        userMessage
      };
      return event;
    }
    case 'run.state': {
      const run = normalizeRun(record.run);
      if (!run) {
        return null;
      }

      const event: RunStreamStateEventDto = {
        type,
        runId,
        run
      };
      return event;
    }
    case 'run.assistant': {
      const assistant = normalizeAssistantSnapshot(record.assistant);
      if (!assistant) {
        return null;
      }

      const event: RunStreamAssistantEventDto = {
        type,
        runId,
        assistant
      };
      return event;
    }
    case 'run.completed': {
      const run = normalizeRun(record.run);
      if (!run) {
        return null;
      }

      const event: RunStreamCompletedEventDto = {
        type,
        runId,
        run
      };
      return event;
    }
    case 'run.failed': {
      const error = asString(record.error);
      if (!error) {
        return null;
      }

      const event: RunStreamFailedEventDto = {
        type,
        runId,
        run: normalizeRun(record.run),
        error
      };
      return event;
    }
    default:
      return null;
  }
}
