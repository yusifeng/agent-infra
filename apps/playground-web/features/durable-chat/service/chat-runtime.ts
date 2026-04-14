import type {
  MessageDto,
  RunDto,
  RunStreamAssistantSnapshotDto,
  RunStreamEventDto,
  RunTimelineResponseDto,
  RuntimePiMetaDto
} from '@agent-infra/contracts';

import { normalizeRunStreamEvent } from '../schema/run-stream';
import type { ChatPhase } from '../types/runtime';

export const RECENT_RUNS_LIMIT = 8;

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

  const nextMessages = [...messages];
  nextMessages[existingIndex] = nextMessage;
  return nextMessages;
}

export function buildAssistantMessageFromSnapshot(
  currentMessages: MessageDto[],
  threadId: string,
  runId: string,
  assistant: RunStreamAssistantSnapshotDto
): MessageDto {
  const textParts = [
    assistant.partialReasoning
      ? {
          id: `${assistant.messageId}:reasoning`,
          messageId: assistant.messageId,
          partIndex: 0,
          type: 'reasoning' as const,
          textValue: assistant.partialReasoning,
          jsonValue: null,
          createdAt: new Date().toISOString()
        }
      : null,
    assistant.partialText
      ? {
          id: `${assistant.messageId}:text`,
          messageId: assistant.messageId,
          partIndex: assistant.partialReasoning ? 1 : 0,
          type: 'text' as const,
          textValue: assistant.partialText,
          jsonValue: null,
          createdAt: new Date().toISOString()
        }
      : null
  ].filter((part): part is NonNullable<typeof part> => part !== null);

  return {
    id: assistant.messageId,
    threadId,
    runId,
    role: 'assistant',
    seq: (currentMessages[currentMessages.length - 1]?.seq ?? 0) + 1,
    status: 'completed',
    metadata: null,
    createdAt: new Date().toISOString(),
    parts: textParts
  };
}

export function buildOptimisticUserMessage(threadId: string, requestId: number, text: string, currentMessages: MessageDto[]): MessageDto {
  return {
    id: `optimistic-user-${requestId}`,
    threadId,
    runId: null,
    role: 'user',
    seq: (currentMessages[currentMessages.length - 1]?.seq ?? 0) + 1,
    status: 'created',
    metadata: { optimistic: true },
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

export function isPrimaryChatAssistantEventType(eventType: RunStreamAssistantSnapshotDto['eventType']) {
  return eventType === 'start' || eventType === 'text_delta' || eventType === 'text_end';
}

export function getChatPhaseForAssistantSnapshot(assistant: RunStreamAssistantSnapshotDto): ChatPhase {
  if (assistant.eventType === 'text_end') {
    return 'transcript-final';
  }

  if (assistant.partialText) {
    return 'streaming';
  }

  return 'thinking';
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
        toolInvocations: []
      };
    case 'run.state':
      return {
        run: event.run,
        runEvents: current?.runEvents ?? [],
        toolInvocations: current?.toolInvocations ?? []
      };
    case 'run.completed':
      return {
        run: event.run,
        runEvents: current?.runEvents ?? [],
        toolInvocations: current?.toolInvocations ?? []
      };
    case 'run.failed':
      return {
        run: event.run,
        runEvents: current?.runEvents ?? [],
        toolInvocations: current?.toolInvocations ?? []
      };
    default:
      return current ?? {
        run: null,
        runEvents: [],
        toolInvocations: []
      };
  }
}

export function parseSseChunk(buffer: string) {
  const frames = buffer.split('\n\n');
  const remainder = frames.pop() ?? '';
  const events: RunStreamEventDto[] = [];

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
      const parsed = normalizeRunStreamEvent(JSON.parse(data));
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
