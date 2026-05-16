import type {
  CreateThreadSnapshotShareResult,
  PublicChatShareResult,
  RunTextTurnResult,
  RunTimelineResult,
  RunTraceResult,
  StartTextTurnResult
} from '@agent-infra/app';
import type { AnswerCandidate, AnswerSelection, Message, MessagePageResult, MessagePart, Run, RunFeedback, Thread } from '@agent-infra/core';
import type {
  AnswerSelectionResponseDto,
  CreateThreadShareResponseDto,
  PublicChatShareResponseDto,
  RevokeChatShareResponseDto,
  CreateThreadResponseDto,
  RenameThreadRequestDto,
  RunFeedbackResponseDto,
  RunStreamAssistantEventDto,
  RunStreamCompletedEventDto,
  RunStreamEventDto,
  RunStreamFailedEventDto,
  RunStreamReadyEventDto,
  RunStreamStateEventDto,
  RunTraceResponseDto,
  RunTimelineResponseDto,
  RunTextTurnRequestDto,
  RunTextTurnResponseDto,
  SelectAnswerCandidateRequestDto,
  SetRunFeedbackRequestDto,
  RuntimePiMetaDto,
  ThreadShareStateResponseDto,
  ThreadMessagesResponseDto,
  ThreadMessagesPageInfoDto,
  ThreadRunsResponseDto,
  UpdateThreadResponseDto,
  ThreadsResponseDto
} from '@agent-infra/contracts';

import {
  toAnswerCandidateDto,
  toAnswerSelectionDto,
  toChatShareDto,
  toMessageDto,
  toPublicChatShareDto,
  toRunFeedbackDto,
  toRunDto,
  toRunEventDto,
  toRuntimeMetaDto,
  toThreadDto,
  toToolInvocationDto,
  type RuntimeMetaDtoInput
} from './api-dto.js';
import { getRouteErrorMessage, InvalidRouteBodyError, InvalidRouteCursorError } from './route-errors.js';

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

export function parseRenameThreadTitle(body: unknown) {
  const record = asObject(body) as Partial<RenameThreadRequestDto>;
  return typeof record.title === 'string' ? record.title.trim() : '';
}

export function buildUpdateThreadResponse(thread: Thread): UpdateThreadResponseDto {
  return {
    thread: toThreadDto(thread)
  };
}

export function buildUpdateThreadErrorResponse(error: unknown, fallbackMessage: string): UpdateThreadResponseDto {
  return {
    error: getRouteErrorMessage(error, fallbackMessage)
  };
}

export function buildCreateThreadShareResponse(result: CreateThreadSnapshotShareResult): CreateThreadShareResponseDto {
  return {
    share: toChatShareDto(result.share)
  };
}

export function buildCreateThreadShareErrorResponse(error: unknown, fallbackMessage: string): CreateThreadShareResponseDto {
  return {
    error: getRouteErrorMessage(error, fallbackMessage)
  };
}

export function buildThreadShareStateResponse(share: Parameters<typeof toChatShareDto>[0] | null): ThreadShareStateResponseDto {
  return {
    share: share ? toChatShareDto(share) : null
  };
}

export function buildThreadShareStateErrorResponse(error: unknown, fallbackMessage: string): ThreadShareStateResponseDto {
  return {
    error: getRouteErrorMessage(error, fallbackMessage)
  };
}

export function buildPublicChatShareResponse(result: PublicChatShareResult): PublicChatShareResponseDto {
  return {
    share: toPublicChatShareDto(result)
  };
}

export function buildPublicChatShareErrorResponse(error: unknown, fallbackMessage: string): PublicChatShareResponseDto {
  return {
    error: getRouteErrorMessage(error, fallbackMessage)
  };
}

export function buildRevokeChatShareResponse(share: Parameters<typeof toChatShareDto>[0]): RevokeChatShareResponseDto {
  return {
    share: toChatShareDto(share)
  };
}

export function buildRevokeChatShareErrorResponse(error: unknown, fallbackMessage: string): RevokeChatShareResponseDto {
  return {
    error: getRouteErrorMessage(error, fallbackMessage)
  };
}

function encodeThreadMessageCursor(threadId: string, seq: number) {
  return Buffer.from(JSON.stringify({ threadId, seq }), 'utf8').toString('base64url');
}

export function decodeThreadMessageCursor(cursor: string, threadId: string) {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      threadId?: unknown;
      seq?: unknown;
    };

    if (decoded.threadId !== threadId || typeof decoded.seq !== 'number' || !Number.isInteger(decoded.seq) || decoded.seq <= 0) {
      throw new InvalidRouteCursorError('invalid thread message cursor');
    }

    return decoded.seq;
  } catch (error) {
    if (error instanceof InvalidRouteCursorError) {
      throw error;
    }

    throw new InvalidRouteCursorError('invalid thread message cursor');
  }
}

export function parseThreadMessagesQuery(
  searchParams: URLSearchParams,
  options: { defaultLimit?: number; maxLimit?: number } = {}
) {
  const defaultLimit = options.defaultLimit ?? 40;
  const maxLimit = options.maxLimit ?? 100;
  const rawLimit = searchParams.get('limit');
  const rawBefore = searchParams.get('before');
  const rawAfter = searchParams.get('after');

  let limit: number | undefined;
  if (rawLimit !== null) {
    const parsed = Number.parseInt(rawLimit, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      limit = defaultLimit;
    } else {
      limit = Math.min(parsed, maxLimit);
    }
  }

  if (limit === undefined && (rawBefore?.trim() || rawAfter?.trim())) {
    limit = defaultLimit;
  }

  return {
    limit,
    before: rawBefore?.trim() || undefined,
    after: rawAfter?.trim() || undefined
  };
}

function toThreadMessagesPageInfoDto(messages: Array<Message & { parts: MessagePart[] }>, pageInfo?: MessagePageResult['pageInfo']): ThreadMessagesPageInfoDto | undefined {
  if (!pageInfo || messages.length === 0 || pageInfo.startSeq === null || pageInfo.endSeq === null) {
    return pageInfo
      ? {
          hasOlder: pageInfo.hasOlder,
          hasNewer: pageInfo.hasNewer,
          startCursor: null,
          endCursor: null
        }
      : undefined;
  }

  return {
    hasOlder: pageInfo.hasOlder,
    hasNewer: pageInfo.hasNewer,
    startCursor: encodeThreadMessageCursor(messages[0].threadId, pageInfo.startSeq),
    endCursor: encodeThreadMessageCursor(messages[0].threadId, pageInfo.endSeq)
  };
}

export function buildThreadMessagesResponse(
  input:
    | Array<Message & { parts: MessagePart[] }>
    | MessagePageResult
    | {
        messages: Array<Message & { parts: MessagePart[] }>;
        pageInfo?: MessagePageResult['pageInfo'];
        activeRun?: Run | null;
        activeRuns?: Run[];
        answerCandidates?: AnswerCandidate[];
        answerSelections?: AnswerSelection[];
        runFeedback?: RunFeedback[];
      }
): ThreadMessagesResponseDto {
  const messages = Array.isArray(input) ? input : input.messages;
  const pageInfo = Array.isArray(input) ? undefined : input.pageInfo;
  const activeRun = Array.isArray(input) ? undefined : 'activeRun' in input ? input.activeRun : undefined;
  const activeRuns = Array.isArray(input) ? undefined : 'activeRuns' in input ? input.activeRuns : undefined;
  const compatibilityActiveRun = activeRuns?.[0] ?? activeRun ?? null;
  const response: ThreadMessagesResponseDto = {
    messages: messages.map(toMessageDto),
    pageInfo: toThreadMessagesPageInfoDto(messages, pageInfo),
    activeRun: compatibilityActiveRun ? toRunDto(compatibilityActiveRun) : null
  };

  if (activeRuns) {
    response.activeRuns = activeRuns.map((run) => toRunDto(run)).filter((run): run is NonNullable<typeof run> => run !== null);
  }
  if (!Array.isArray(input) && 'answerCandidates' in input && input.answerCandidates) {
    response.answerCandidates = input.answerCandidates.map(toAnswerCandidateDto);
  }
  if (!Array.isArray(input) && 'answerSelections' in input && input.answerSelections) {
    response.answerSelections = input.answerSelections.map(toAnswerSelectionDto);
  }
  if (!Array.isArray(input) && 'runFeedback' in input && input.runFeedback) {
    response.runFeedback = input.runFeedback.map(toRunFeedbackDto);
  }

  return response;
}

export function buildThreadMessagesErrorResponse(error: unknown, fallbackMessage: string): ThreadMessagesResponseDto {
  return {
    error: getRouteErrorMessage(error, fallbackMessage)
  };
}

export function parseSelectAnswerCandidateInput(body: unknown): SelectAnswerCandidateRequestDto {
  const record = asObject(body);
  return {
    triggerMessageId: typeof record.triggerMessageId === 'string' ? record.triggerMessageId.trim() : ''
  };
}

export function buildAnswerSelectionResponse(selection: AnswerSelection): AnswerSelectionResponseDto {
  return {
    answerSelection: toAnswerSelectionDto(selection)
  };
}

export function buildAnswerSelectionErrorResponse(error: unknown, fallbackMessage: string): AnswerSelectionResponseDto {
  return {
    error: getRouteErrorMessage(error, fallbackMessage)
  };
}

export function parseSetRunFeedbackInput(body: unknown): SetRunFeedbackRequestDto {
  const record = asObject(body);
  if (record.value !== 'thumbs_up' && record.value !== 'thumbs_down') {
    throw new InvalidRouteBodyError('invalid run feedback value');
  }

  return {
    triggerMessageId: typeof record.triggerMessageId === 'string' ? record.triggerMessageId.trim() : '',
    value: record.value
  };
}

export function buildRunFeedbackResponse(feedback: RunFeedback | null): RunFeedbackResponseDto {
  return {
    runFeedback: feedback ? toRunFeedbackDto(feedback) : null
  };
}

export function buildRunFeedbackErrorResponse(error: unknown, fallbackMessage: string): RunFeedbackResponseDto {
  return {
    error: getRouteErrorMessage(error, fallbackMessage)
  };
}

export function parseRunTextTurnInput(body: unknown): RunTextTurnRequestDto {
  const record = asObject(body);
  const reasoningEffort =
    record.reasoningEffort === 'high' || record.reasoningEffort === 'max' ? record.reasoningEffort : undefined;
  const thinkingEnabled = typeof record.thinkingEnabled === 'boolean' ? record.thinkingEnabled : undefined;
  const webSearchEnabled = typeof record.webSearchEnabled === 'boolean' ? record.webSearchEnabled : undefined;

  return {
    text: typeof record.text === 'string' ? record.text : '',
    provider: typeof record.provider === 'string' ? record.provider.trim() : undefined,
    model: typeof record.model === 'string' ? record.model.trim() : undefined,
    thinkingEnabled,
    reasoningEffort,
    webSearchEnabled,
    answerMode: record.answerMode === 'dual' ? 'dual' : record.answerMode === 'single' ? 'single' : undefined,
    candidateCount: record.candidateCount === 2 ? 2 : record.candidateCount === 1 ? 1 : undefined
  };
}

export function buildRunTextTurnErrorResponse(error: unknown, fallbackMessage: string): RunTextTurnResponseDto {
  return {
    error: getRouteErrorMessage(error, fallbackMessage),
    run: null,
    messages: []
  };
}

export function buildRunTextTurnResponse(result: RunTextTurnResult): RunTextTurnResponseDto {
  return {
    run: toRunDto(result.run),
    messages: result.messages.map(toMessageDto),
    debug: result.debug,
    error: result.executionError
  };
}

export function parseThreadRunsLimit(value: string | null, defaultLimit = 8, maxLimit = 20) {
  if (!value) {
    return defaultLimit;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultLimit;
  }

  return Math.min(parsed, maxLimit);
}

export function buildThreadRunsResponse(runs: Run[]): ThreadRunsResponseDto {
  return {
    runs: runs.map((run) => toRunDto(run)).filter((run): run is NonNullable<typeof run> => run !== null)
  };
}

export function buildThreadRunsErrorResponse(error: unknown, fallbackMessage: string): ThreadRunsResponseDto {
  return {
    runs: [],
    error: getRouteErrorMessage(error, fallbackMessage)
  };
}

export function buildRunTimelineResponse(timeline: Pick<RunTimelineResult, 'run' | 'runEvents' | 'toolInvocations' | 'projection'>): RunTimelineResponseDto {
  return {
    run: toRunDto(timeline.run),
    runEvents: timeline.runEvents.map(toRunEventDto),
    toolInvocations: timeline.toolInvocations.map(toToolInvocationDto),
    projection: timeline.projection
  };
}

export function buildRunTimelineErrorResponse(error: unknown, fallbackMessage: string): RunTimelineResponseDto {
  return {
    run: null,
    runEvents: [],
    toolInvocations: [],
    projection: null,
    error: getRouteErrorMessage(error, fallbackMessage)
  };
}

export function buildRunTraceResponse(trace: Pick<RunTraceResult, 'run' | 'projection'>): RunTraceResponseDto {
  return {
    run: toRunDto(trace.run),
    projection: trace.projection
  };
}

export function buildRunTraceErrorResponse(error: unknown, fallbackMessage: string): RunTraceResponseDto {
  return {
    run: null,
    projection: null,
    error: getRouteErrorMessage(error, fallbackMessage)
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
