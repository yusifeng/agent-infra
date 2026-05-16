import type {
  RunAttachStreamAssistantEventDto,
  RunAttachStreamCompletedEventDto,
  RunAttachStreamEventDto,
  RunAttachStreamFailedEventDto,
  RunAttachStreamStateEventDto,
  RunAttachStreamUnavailableEventDto,
  RunAttachStreamUnavailableReasonDto,
  RunStreamAssistantEventDto,
  RunStreamAssistantPayloadDto,
  RunStreamAssistantSnapshotDto,
  RunStreamAssistantSnapshotSegmentDto,
  RunStreamAssistantSnapshotToolDto,
  RunStreamCompletedEventDto,
  RunStreamEventDto,
  RunStreamFailedEventDto,
  RunStreamReadyEventDto,
  RunStreamSnapshotEventDto,
  RunStreamSnapshotEventTypeDto,
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

function asVersion(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function asOrdinal(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function isAnswerCandidateKind(value: string): value is NonNullable<RunStreamReadyEventDto['kind']> {
  return value === 'primary' || value === 'alternative';
}

function isToolEventPhase(value: string): value is 'start' | 'completed' | 'failed' {
  return value === 'start' || value === 'completed' || value === 'failed';
}

function isSnapshotEventType(value: string): value is RunStreamSnapshotEventTypeDto {
  return value === 'start' || value === 'thinking' || value === 'streaming' || value === 'searching';
}

function isAttachUnavailableReason(value: string): value is RunAttachStreamUnavailableReasonDto {
  return (
    value === 'run_not_found' ||
    value === 'run_not_active' ||
    value === 'stream_session_gone' ||
    value === 'thread_run_mismatch' ||
    value === 'not_authorized'
  );
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

function normalizeSnapshotTools(value: unknown): RunStreamAssistantSnapshotToolDto[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const tools: RunStreamAssistantSnapshotToolDto[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record) {
      return null;
    }

    const toolCallId = asString(record.toolCallId);
    const toolName = asString(record.toolName);
    const phase = asString(record.phase);
    const input = record.input === undefined ? undefined : asRecord(record.input);
    if (!toolCallId || !toolName || !phase || !isToolEventPhase(phase)) {
      return null;
    }

    tools.push({
      toolCallId,
      toolName,
      phase,
      input
    });
  }

  return tools;
}

function normalizeSnapshotSegment(value: unknown): RunStreamAssistantSnapshotSegmentDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asString(record.id);
  const messageId = asString(record.messageId);
  const text = asString(record.text);
  const reasoning = asNullableString(record.reasoning);
  const eventType = asString(record.eventType);
  const tools = normalizeSnapshotTools(record.tools);

  if (!id || !messageId || text === null || reasoning === undefined || !eventType || !isSnapshotEventType(eventType) || !tools) {
    return null;
  }

  return {
    id,
    messageId,
    text,
    reasoning,
    tools,
    eventType
  };
}

function normalizeAssistantSnapshot(value: unknown): RunStreamAssistantSnapshotDto | null {
  if (value === null) {
    return null;
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const liveDraftId = asString(record.liveDraftId);
  const messageId = asNullableString(record.messageId);
  const text = asString(record.text);
  const reasoning = asNullableString(record.reasoning);
  const activeTools = normalizeSnapshotTools(record.activeTools);
  const eventType = asString(record.eventType);
  if (
    !liveDraftId ||
    messageId === undefined ||
    text === null ||
    reasoning === undefined ||
    !activeTools ||
    !eventType ||
    !isSnapshotEventType(eventType) ||
    !Array.isArray(record.segments)
  ) {
    return null;
  }

  const segments: RunStreamAssistantSnapshotSegmentDto[] = [];
  for (const segment of record.segments) {
    const normalized = normalizeSnapshotSegment(segment);
    if (!normalized) {
      return null;
    }

    segments.push(normalized);
  }

  return {
    liveDraftId,
    messageId,
    text,
    reasoning,
    activeTools,
    eventType,
    segments
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
      const triggerMessageId = asString(record.triggerMessageId);
      const candidateId = asString(record.candidateId);
      const ordinal = asOrdinal(record.ordinal);
      const kind = asString(record.kind);

      if (triggerMessageId) {
        event.triggerMessageId = triggerMessageId;
      }
      if (candidateId) {
        event.candidateId = candidateId;
      }
      if (ordinal !== null) {
        event.ordinal = ordinal;
      }
      if (kind && isAnswerCandidateKind(kind)) {
        event.kind = kind;
      }
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

export function normalizeRunAttachStreamEvent(value: unknown): RunAttachStreamEventDto | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const type = asString(record.type);
  const runId = asString(record.runId);
  if (!type || !runId) {
    return null;
  }

  if (type === 'run.attach_unavailable') {
    const reason = asString(record.reason);
    if (!reason || !isAttachUnavailableReason(reason)) {
      return null;
    }

    const run = record.run === undefined ? undefined : record.run === null ? null : normalizeRun(record.run);
    if (record.run !== undefined && record.run !== null && !run) {
      return null;
    }

    const message = record.message === undefined ? undefined : asNullableString(record.message);
    if (record.message !== undefined && record.message !== null && message === null) {
      return null;
    }

    const event: RunAttachStreamUnavailableEventDto = {
      type,
      runId,
      reason,
      run,
      message
    };
    return event;
  }

  const version = asVersion(record.version);
  if (version === null) {
    return null;
  }

  switch (type) {
    case 'run.snapshot': {
      const run = normalizeRun(record.run);
      const assistant = normalizeAssistantSnapshot(record.assistant);
      if (!run || (record.assistant !== null && !assistant)) {
        return null;
      }

      const event: RunStreamSnapshotEventDto = {
        type,
        runId,
        run,
        version,
        assistant
      };
      return event;
    }
    case 'run.state': {
      const run = normalizeRun(record.run);
      if (!run) {
        return null;
      }

      const event: RunAttachStreamStateEventDto = {
        type,
        runId,
        run,
        version
      };
      return event;
    }
    case 'run.assistant': {
      const assistant = normalizeAssistantPayload(record.assistant);
      if (!assistant) {
        return null;
      }

      const event: RunAttachStreamAssistantEventDto = {
        type,
        runId,
        assistant,
        version
      };
      return event;
    }
    case 'run.completed': {
      const run = normalizeRun(record.run);
      if (!run) {
        return null;
      }

      const event: RunAttachStreamCompletedEventDto = {
        type,
        runId,
        run,
        version
      };
      return event;
    }
    case 'run.failed': {
      const error = asString(record.error);
      if (!error) {
        return null;
      }

      const event: RunAttachStreamFailedEventDto = {
        type,
        runId,
        run: normalizeRun(record.run),
        error,
        version
      };
      return event;
    }
    default:
      return null;
  }
}
