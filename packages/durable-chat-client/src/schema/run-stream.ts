import type {
  RunStreamAssistantEventDto,
  RunStreamAssistantPayloadDto,
  RunStreamCompletedEventDto,
  RunStreamEventDto,
  RunStreamFailedEventDto,
  RunStreamReadyEventDto,
  RunStreamStateEventDto
} from '@agent-infra/contracts';

import { normalizeMessage, normalizeRun } from './api.js';

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

function isToolEventPhase(value: string): value is 'start' | 'completed' | 'failed' {
  return value === 'start' || value === 'completed' || value === 'failed';
}

function normalizeAssistantPayload(value: unknown): RunStreamAssistantPayloadDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const messageId = asString(record.messageId);
  const kind = asString(record.kind) as RunStreamAssistantPayloadDto['kind'] | null;
  if (!messageId || !kind) {
    return null;
  }

  if (kind === 'assistant_delta') {
    const textDelta = asString(record.textDelta);
    if (textDelta === null) {
      return null;
    }

    return {
      messageId,
      kind,
      textDelta
    };
  }

  if (kind === 'assistant_replace') {
    const textSnapshot = asString(record.textSnapshot);
    if (textSnapshot === null) {
      return null;
    }

    return {
      messageId,
      kind,
      textSnapshot
    };
  }

  if (kind === 'thinking_delta') {
    const thinkingDelta = asString(record.thinkingDelta);
    if (thinkingDelta === null) {
      return null;
    }

    return {
      messageId,
      kind,
      thinkingDelta
    };
  }

  if (kind === 'thinking_replace') {
    const thinkingSnapshot = asString(record.thinkingSnapshot);
    if (thinkingSnapshot === null) {
      return null;
    }

    return {
      messageId,
      kind,
      thinkingSnapshot
    };
  }

  if (kind === 'tool_event') {
    const toolCallId = asString(record.toolCallId);
    const toolName = asString(record.toolName);
    const phase = asString(record.phase);
    const input = record.input === undefined ? undefined : asRecord(record.input);

    if (!toolCallId || !toolName || !phase || !isToolEventPhase(phase)) {
      return null;
    }

    return {
      messageId,
      kind,
      toolCallId,
      toolName,
      phase,
      input
    };
  }

  return null;
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
      const assistant = normalizeAssistantPayload(record.assistant);
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
