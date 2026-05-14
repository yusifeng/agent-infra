import type {
  MessageDto,
  RunAttachStreamEventDto,
  RunDto,
  RunStreamEventDto,
  ThreadMessagesPageInfoDto,
  RunTimelineResponseDto,
  RuntimePiMetaDto
} from '@agent-infra/contracts';

import { normalizeRunAttachStreamEvent, normalizeRunStreamEvent } from '../schema/run-stream.js';
import type { ChatPhase, MainChatResponseStatus } from '../types/runtime.js';

export const RECENT_RUNS_LIMIT = 8;
export const INITIAL_MESSAGE_PAGE_LIMIT = 40;
const CLIENT_MESSAGE_RENDER_KEY = 'clientRenderKey';

export function deriveDurableResponseStatus(run: RunDto | null): MainChatResponseStatus {
  if (!run) {
    return 'idle';
  }

  switch (run.status) {
    case 'running':
      return 'in_progress';
    case 'queued':
    case 'completed':
    case 'failed':
    case 'cancelled':
      return run.status;
    default:
      return 'idle';
  }
}

export function shouldShowMainChatLoading(status: MainChatResponseStatus) {
  return status === 'queued' || status === 'in_progress';
}

export function deriveMainChatResponseStatus(input: {
  activeResponseRun: RunDto | null;
  activeThreadId: string | null;
  loadingThreadId: string | null;
  chatPhase: ChatPhase;
  persistingTurn: boolean;
  pendingNewThreadLoadingId: string;
}) {
  const { activeResponseRun, activeThreadId, loadingThreadId, chatPhase, persistingTurn, pendingNewThreadLoadingId } = input;
  const durableStatus = deriveDurableResponseStatus(activeResponseRun);

  if (durableStatus === 'queued' || durableStatus === 'in_progress') {
    return durableStatus;
  }

  if (chatPhase === 'failed') {
    return 'failed';
  }

  const isLoadingForActiveThread =
    loadingThreadId !== null &&
    (loadingThreadId === activeThreadId || (loadingThreadId === pendingNewThreadLoadingId && activeThreadId === null));

  if (!isLoadingForActiveThread) {
    return durableStatus;
  }

  if (chatPhase === 'streaming') {
    return 'in_progress';
  }

  if (chatPhase === 'thinking') {
    return 'queued';
  }

  return durableStatus;
}

export function normalizeRuntimeMeta(data: Partial<RuntimePiMetaDto>): RuntimePiMetaDto {
  const modelOptions = Array.isArray(data.modelOptions) ? data.modelOptions : [];

  return {
    dbMode: data.dbMode ?? 'unknown',
    dbConnection: data.dbConnection ?? 'unknown',
    runtimeConfigured: data.runtimeConfigured ?? false,
    runtimeProvider: data.runtimeProvider ?? modelOptions[0]?.provider ?? 'unknown',
    runtimeModel: data.runtimeModel ?? modelOptions[0]?.model ?? 'unknown',
    defaultModelKey: data.defaultModelKey ?? modelOptions[0]?.key ?? null,
    modelOptions,
    runtimeConfigError: data.runtimeConfigError ?? null
  };
}

export function deriveLatestRunId(messages: MessageDto[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const runId = messages[index]?.runId;
    if (runId) {
      return runId;
    }
  }

  return null;
}

export function chooseInitialRunId(messages: MessageDto[], runs: RunDto[], preferredRunId: string | null) {
  if (preferredRunId && runs.some((run) => run.id === preferredRunId)) {
    return preferredRunId;
  }

  return runs[0]?.id ?? deriveLatestRunId(messages);
}

export function compareRunsByCreatedAt(left: RunDto, right: RunDto) {
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

export function upsertMessage(messages: MessageDto[], nextMessage: MessageDto) {
  const existingIndex = messages.findIndex((message) => message.id === nextMessage.id);
  if (existingIndex === -1) {
    return [...messages, nextMessage].sort((left, right) => left.seq - right.seq);
  }

  const existingMessage = messages[existingIndex];
  const mergedMessage = preserveClientMessageRenderKey(existingMessage, nextMessage);
  if (areMessagesEquivalent(existingMessage, mergedMessage)) {
    return messages;
  }

  const nextMessages = [...messages];
  nextMessages[existingIndex] = mergedMessage;
  return nextMessages;
}

function sortMessagesBySeq(messages: MessageDto[]) {
  return [...messages].sort((left, right) => left.seq - right.seq);
}

export function mergeMessageWindow(currentMessages: MessageDto[], incomingMessages: MessageDto[]) {
  const messageMap = new Map<string, MessageDto>();

  for (const message of currentMessages) {
    messageMap.set(message.id, message);
  }

  for (const message of incomingMessages) {
    const existingMessage = messageMap.get(message.id);
    if (!existingMessage) {
      messageMap.set(message.id, message);
      continue;
    }

    const mergedMessage = preserveClientMessageRenderKey(existingMessage, message);
    messageMap.set(message.id, areMessagesEquivalent(existingMessage, mergedMessage) ? existingMessage : mergedMessage);
  }

  return sortMessagesBySeq([...messageMap.values()]);
}

function getClientMessageRenderKey(metadata: Record<string, unknown> | null | undefined) {
  const renderKey = metadata?.[CLIENT_MESSAGE_RENDER_KEY];
  return typeof renderKey === 'string' && renderKey.length > 0 ? renderKey : null;
}

function preserveClientMessageRenderKey(currentMessage: MessageDto, nextMessage: MessageDto) {
  const currentRenderKey = getClientMessageRenderKey(currentMessage.metadata);
  if (!currentRenderKey || getClientMessageRenderKey(nextMessage.metadata) === currentRenderKey) {
    return nextMessage;
  }

  return {
    ...nextMessage,
    metadata: {
      ...(nextMessage.metadata ?? {}),
      [CLIENT_MESSAGE_RENDER_KEY]: currentRenderKey
    }
  } satisfies MessageDto;
}

function areMessagePartsEquivalent(left: MessageDto['parts'], right: MessageDto['parts']) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((part, index) => {
    const other = right[index];
    if (!other) {
      return false;
    }

    return (
      part.id === other.id &&
      part.messageId === other.messageId &&
      part.partIndex === other.partIndex &&
      part.type === other.type &&
      part.textValue === other.textValue &&
      JSON.stringify(part.jsonValue ?? null) === JSON.stringify(other.jsonValue ?? null) &&
      part.createdAt === other.createdAt
    );
  });
}

function areMessagesEquivalent(left: MessageDto, right: MessageDto) {
  return (
    left.id === right.id &&
    left.threadId === right.threadId &&
    left.runId === right.runId &&
    left.role === right.role &&
    left.seq === right.seq &&
    left.status === right.status &&
    JSON.stringify(left.metadata ?? null) === JSON.stringify(right.metadata ?? null) &&
    left.createdAt === right.createdAt &&
    areMessagePartsEquivalent(left.parts, right.parts)
  );
}

export function mergeThreadMessagesPageInfo(
  currentPageInfo: ThreadMessagesPageInfoDto | null,
  nextPageInfo: ThreadMessagesPageInfoDto | null | undefined,
  direction: 'replace' | 'prepend' | 'append'
) {
  const normalizedNextPageInfo = nextPageInfo ?? null;
  if (direction === 'replace' || !currentPageInfo) {
    return normalizedNextPageInfo;
  }

  if (!normalizedNextPageInfo) {
    return currentPageInfo;
  }

  if (direction === 'prepend') {
    return {
      hasOlder: normalizedNextPageInfo.hasOlder,
      hasNewer: currentPageInfo.hasNewer,
      startCursor: normalizedNextPageInfo.startCursor ?? currentPageInfo.startCursor,
      endCursor: currentPageInfo.endCursor
    } satisfies ThreadMessagesPageInfoDto;
  }

  return {
    hasOlder: currentPageInfo.hasOlder,
    hasNewer: normalizedNextPageInfo.hasNewer,
    startCursor: currentPageInfo.startCursor,
    endCursor: normalizedNextPageInfo.endCursor ?? currentPageInfo.endCursor
  } satisfies ThreadMessagesPageInfoDto;
}

export function buildOptimisticUserMessage(threadId: string, requestId: number, text: string, currentMessages: MessageDto[]): MessageDto {
  return {
    id: `optimistic-user-${requestId}`,
    threadId,
    runId: null,
    role: 'user',
    seq: (currentMessages[currentMessages.length - 1]?.seq ?? 0) + 1,
    status: 'created',
    metadata: {
      optimistic: true,
      [CLIENT_MESSAGE_RENDER_KEY]: `optimistic-user-${requestId}`
    },
    createdAt: new Date().toISOString(),
    parts: [
      {
        id: `optimistic-user-part-${requestId}`,
        messageId: `optimistic-user-${requestId}`,
        partIndex: 0,
        type: 'text',
        textValue: text,
        jsonValue: null,
        createdAt: new Date().toISOString()
      }
    ]
  };
}

export function attachMessageRenderKey(message: MessageDto, renderKey: string): MessageDto {
  if (getClientMessageRenderKey(message.metadata) === renderKey) {
    return message;
  }

  return {
    ...message,
    metadata: {
      ...(message.metadata ?? {}),
      [CLIENT_MESSAGE_RENDER_KEY]: renderKey
    }
  };
}

export function getMessageRenderKey(message: MessageDto) {
  return getClientMessageRenderKey(message.metadata) ?? message.id;
}

export function upsertRun(runs: RunDto[], nextRun: RunDto) {
  const existingIndex = runs.findIndex((run) => run.id === nextRun.id);
  if (existingIndex === -1) {
    return [...runs, nextRun].sort(compareRunsByCreatedAt).slice(0, RECENT_RUNS_LIMIT);
  }

  const nextRuns = [...runs];
  nextRuns[existingIndex] = nextRun;
  return nextRuns.sort(compareRunsByCreatedAt).slice(0, RECENT_RUNS_LIMIT);
}

export function includeSelectedRun(runs: RunDto[], selectedRun: RunDto | null) {
  if (!selectedRun) {
    return runs;
  }

  const existing = runs.some((run) => run.id === selectedRun.id);
  if (existing) {
    return runs;
  }

  return [...runs, selectedRun].sort(compareRunsByCreatedAt);
}

export function resolveSettledChatPhase(current: ChatPhase): ChatPhase {
  return current === 'failed' ? 'failed' : current === 'transcript-final' ? 'transcript-final' : 'idle';
}

export function resolvePostReconcileChatPhase(current: ChatPhase): ChatPhase {
  return current === 'failed' ? 'failed' : 'idle';
}

export function applyRunStateToTimeline(
  current: RunTimelineResponseDto | null,
  event: Exclude<RunStreamEventDto, { type: 'run.assistant' }>
): RunTimelineResponseDto {
  switch (event.type) {
    case 'run.ready':
      return {
        run: event.run,
        runEvents: [],
        toolInvocations: [],
        projection: null
      };
    case 'run.state':
      return {
        run: event.run,
        runEvents: current?.runEvents ?? [],
        toolInvocations: current?.toolInvocations ?? [],
        projection: current?.projection ?? null
      };
    case 'run.completed':
      return {
        run: event.run,
        runEvents: current?.runEvents ?? [],
        toolInvocations: current?.toolInvocations ?? [],
        projection: current?.projection ?? null
      };
    case 'run.failed':
      return {
        run: event.run,
        runEvents: current?.runEvents ?? [],
        toolInvocations: current?.toolInvocations ?? [],
        projection: current?.projection ?? null
      };
    default:
      return current ?? {
        run: null,
        runEvents: [],
        toolInvocations: [],
        projection: null
      };
  }
}

export function parseSseChunk(buffer: string) {
  return parseSseChunkWithNormalizer(buffer, normalizeRunStreamEvent);
}

export function parseRunAttachSseChunk(buffer: string) {
  return parseSseChunkWithNormalizer(buffer, normalizeRunAttachStreamEvent);
}

function parseSseChunkWithNormalizer<TEvent extends RunStreamEventDto | RunAttachStreamEventDto>(
  buffer: string,
  normalize: (value: unknown) => TEvent | null
) {
  const frames = buffer.split('\n\n');
  const remainder = frames.pop() ?? '';
  const events: TEvent[] = [];

  for (const frame of frames) {
    const lines = frame.split('\n');
    let eventName = '';
    let data = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
        continue;
      }

      if (line.startsWith('data:')) {
        data += line.slice(5).trim();
      }
    }

    if (!eventName || !data) {
      continue;
    }

    try {
      const parsed = normalize(JSON.parse(data));
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
