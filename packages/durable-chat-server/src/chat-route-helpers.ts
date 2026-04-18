import type { StartTextTurnResult } from '@agent-infra/app';
import type { Message, MessagePart, Run, Thread } from '@agent-infra/core';
import type {
  CreateThreadResponseDto,
  RunStreamAssistantEventDto,
  RunStreamCompletedEventDto,
  RunStreamEventDto,
  RunStreamFailedEventDto,
  RunStreamReadyEventDto,
  RunStreamStateEventDto,
  RunTextTurnRequestDto,
  RunTextTurnResponseDto,
  RuntimePiMetaDto,
  ThreadMessagesResponseDto,
  ThreadsResponseDto
} from '@agent-infra/contracts';

import { toMessageDto, toRunDto, toRuntimeMetaDto, toThreadDto, type RuntimeMetaDtoInput } from './api-dto.js';
import { getRouteErrorMessage } from './route-errors.js';

function asObject(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function buildRuntimeMetaResponse(input: RuntimeMetaDtoInput): RuntimePiMetaDto {
  return toRuntimeMetaDto(input);
}

export function buildUnavailableRuntimeMetaResponse(
  input: Omit<RuntimeMetaDtoInput, 'runtimeConfigured' | 'runtimeConfigError'>,
  error: unknown,
  fallbackMessage: string
): RuntimePiMetaDto {
  return toRuntimeMetaDto({
    ...input,
    runtimeConfigured: false,
    runtimeConfigError: getRouteErrorMessage(error, fallbackMessage)
  });
}

export function buildThreadsResponse(threads: Thread[]): ThreadsResponseDto {
  return {
    threads: threads.map(toThreadDto)
  };
}

export function buildThreadsErrorResponse(error: unknown, fallbackMessage: string): ThreadsResponseDto {
  return {
    threads: [],
    error: getRouteErrorMessage(error, fallbackMessage)
  };
}

export function parseCreateThreadTitle(body: unknown, fallbackTitle = 'New Thread') {
  const record = asObject(body);

  return typeof record.title === 'string' && record.title.trim() ? record.title.trim() : fallbackTitle;
}

export function buildCreateThreadResponse(thread: Thread): CreateThreadResponseDto {
  return {
    thread: toThreadDto(thread)
  };
}

export function buildCreateThreadErrorResponse(error: unknown, fallbackMessage: string): CreateThreadResponseDto {
  return {
    error: getRouteErrorMessage(error, fallbackMessage)
  };
}

export function buildThreadMessagesResponse(messages: Array<Message & { parts: MessagePart[] }>): ThreadMessagesResponseDto {
  return {
    messages: messages.map(toMessageDto)
  };
}

export function buildThreadMessagesErrorResponse(error: unknown, fallbackMessage: string): ThreadMessagesResponseDto {
  return {
    error: getRouteErrorMessage(error, fallbackMessage)
  };
}

export function parseRunTextTurnInput(body: unknown): RunTextTurnRequestDto {
  const record = asObject(body);

  return {
    text: typeof record.text === 'string' ? record.text : '',
    provider: typeof record.provider === 'string' ? record.provider.trim() : undefined,
    model: typeof record.model === 'string' ? record.model.trim() : undefined
  };
}

export function buildRunTextTurnErrorResponse(error: unknown, fallbackMessage: string): RunTextTurnResponseDto {
  return {
    error: getRouteErrorMessage(error, fallbackMessage),
    run: null,
    messages: []
  };
}

export function buildRunReadyEvent(started: StartTextTurnResult): RunStreamReadyEventDto {
  return {
    type: 'run.ready',
    runId: started.run.id,
    run: toRunDto(started.run) as NonNullable<RunStreamReadyEventDto['run']>,
    userMessage: toMessageDto(started.userMessage)
  };
}

export function buildRunAssistantEvent(
  runId: string,
  assistant: RunStreamAssistantEventDto['assistant']
): RunStreamAssistantEventDto {
  return {
    type: 'run.assistant',
    runId,
    assistant
  };
}

export function buildRunStateEvent(runId: string, run: Run): RunStreamStateEventDto {
  return {
    type: 'run.state',
    runId,
    run: toRunDto(run) as NonNullable<RunStreamStateEventDto['run']>
  };
}

export function buildRunTerminalEvent(
  runId: string,
  run: Run
): RunStreamCompletedEventDto | RunStreamFailedEventDto | null {
  const runDto = toRunDto(run);

  if (!runDto) {
    return null;
  }

  if (run.status === 'failed') {
    return {
      type: 'run.failed',
      runId,
      run: runDto,
      error: run.error ?? 'runtime execution failed'
    };
  }

  if (run.status === 'completed') {
    return {
      type: 'run.completed',
      runId,
      run: runDto
    };
  }

  return null;
}

export function encodeSseEvent(payload: RunStreamEventDto) {
  return `event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`;
}
