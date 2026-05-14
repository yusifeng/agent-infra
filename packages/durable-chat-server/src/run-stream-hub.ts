import type {
  RunDto,
  RunAttachStreamAssistantEventDto,
  RunAttachStreamCompletedEventDto,
  RunAttachStreamEventDto,
  RunAttachStreamFailedEventDto,
  RunAttachStreamStateEventDto,
  RunStreamAssistantSnapshotDto,
  RunStreamAssistantSnapshotSegmentDto,
  RunStreamAssistantSnapshotToolDto,
  RunStreamSnapshotEventDto
} from '@agent-infra/contracts';

export type RunStreamHubLiveEvent =
  | RunAttachStreamStateEventDto
  | RunAttachStreamAssistantEventDto
  | RunAttachStreamCompletedEventDto
  | RunAttachStreamFailedEventDto;

export interface RunStreamHubSubscriber {
  send(event: RunAttachStreamEventDto): void;
  close?(): void;
}

export interface RunStreamHubSubscription {
  unsubscribe(): void;
}

export interface RunStreamHub {
  openSession(snapshot: RunStreamSnapshotEventDto): void;
  getSnapshot(runId: string): RunStreamSnapshotEventDto | null;
  publish(runId: string, event: RunStreamHubLiveEvent): boolean;
  subscribe(runId: string, subscriber: RunStreamHubSubscriber): RunStreamHubSubscription | null;
  closeSession(runId: string, terminalEvent?: RunStreamHubLiveEvent): boolean;
  cleanup(nowMs?: number): number;
}

export interface InMemoryRunStreamHubOptions {
  now?: () => number;
  runningSessionMaxAgeMs?: number;
  closedSessionRetentionMs?: number;
}

type RunStreamSession = {
  snapshot: RunStreamSnapshotEventDto;
  subscribers: Set<RunStreamHubSubscriber>;
  openedAtMs: number;
  closedAtMs: number | null;
};

const DEFAULT_RUNNING_SESSION_MAX_AGE_MS = 30 * 60 * 1000;
const DEFAULT_CLOSED_SESSION_RETENTION_MS = 5 * 60 * 1000;

function copyJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(copyJsonValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyJsonValue(item)]));
  }

  return value;
}

function copyRecord<T>(record: T | null | undefined): T | null | undefined {
  return record ? (copyJsonValue(record) as T) : record;
}

function copyRun(run: RunDto): RunDto {
  return {
    ...run,
    usage: copyRecord(run.usage)
  };
}

function copyTool(tool: RunStreamAssistantSnapshotToolDto): RunStreamAssistantSnapshotToolDto {
  return {
    toolCallId: tool.toolCallId,
    toolName: tool.toolName,
    phase: tool.phase,
    input: copyRecord(tool.input)
  };
}

function copySegment(segment: RunStreamAssistantSnapshotSegmentDto): RunStreamAssistantSnapshotSegmentDto {
  return {
    id: segment.id,
    messageId: segment.messageId,
    text: segment.text,
    reasoning: segment.reasoning,
    tools: segment.tools.map(copyTool),
    eventType: segment.eventType
  };
}

function copyAssistantSnapshot(snapshot: RunStreamAssistantSnapshotDto): RunStreamAssistantSnapshotDto {
  return {
    liveDraftId: snapshot.liveDraftId,
    messageId: snapshot.messageId,
    text: snapshot.text,
    reasoning: snapshot.reasoning,
    activeTools: snapshot.activeTools.map(copyTool),
    eventType: snapshot.eventType,
    segments: snapshot.segments.map(copySegment)
  };
}

function copySnapshotEvent(snapshot: RunStreamSnapshotEventDto): RunStreamSnapshotEventDto {
  return {
    type: 'run.snapshot',
    runId: snapshot.runId,
    run: copyRun(snapshot.run),
    version: snapshot.version,
    assistant: snapshot.assistant ? copyAssistantSnapshot(snapshot.assistant) : null
  };
}

function createEmptyAssistantSnapshot(runId: string, messageId: string): RunStreamAssistantSnapshotDto {
  return {
    liveDraftId: messageId || `run:${runId}`,
    messageId: messageId || null,
    text: '',
    reasoning: null,
    activeTools: [],
    eventType: 'start',
    segments: []
  };
}

function findOrCreateSegment(
  assistant: RunStreamAssistantSnapshotDto,
  runId: string,
  messageId: string
): RunStreamAssistantSnapshotSegmentDto {
  const existing = assistant.segments.find((segment) => segment.messageId === messageId);
  if (existing) {
    return existing;
  }

  const segment: RunStreamAssistantSnapshotSegmentDto = {
    id: `${runId}:${messageId}:live`,
    messageId,
    text: '',
    reasoning: null,
    tools: [],
    eventType: 'start'
  };
  assistant.segments.push(segment);
  return segment;
}

function upsertTool(
  tools: RunStreamAssistantSnapshotToolDto[],
  tool: RunStreamAssistantSnapshotToolDto
): RunStreamAssistantSnapshotToolDto[] {
  const next = tools.filter((item) => item.toolCallId !== tool.toolCallId);
  next.push(copyTool(tool));
  return next;
}

function applyAssistantEvent(
  snapshot: RunStreamSnapshotEventDto,
  event: RunAttachStreamAssistantEventDto
): RunStreamSnapshotEventDto {
  const assistant = copyAssistantSnapshot(
    snapshot.assistant ?? createEmptyAssistantSnapshot(event.runId, event.assistant.messageId)
  );
  const segment = findOrCreateSegment(assistant, event.runId, event.assistant.messageId);

  if (event.assistant.kind === 'assistant_delta') {
    segment.text += event.assistant.textDelta;
    segment.eventType = 'streaming';
    assistant.text += event.assistant.textDelta;
    assistant.eventType = 'streaming';
  } else if (event.assistant.kind === 'assistant_replace') {
    segment.text = event.assistant.textSnapshot;
    segment.eventType = 'streaming';
    assistant.text = event.assistant.textSnapshot;
    assistant.eventType = 'streaming';
  } else if (event.assistant.kind === 'thinking_delta') {
    segment.reasoning = `${segment.reasoning ?? ''}${event.assistant.thinkingDelta}`;
    segment.eventType = 'thinking';
    assistant.reasoning = `${assistant.reasoning ?? ''}${event.assistant.thinkingDelta}`;
    assistant.eventType = 'thinking';
  } else if (event.assistant.kind === 'thinking_replace') {
    segment.reasoning = event.assistant.thinkingSnapshot;
    segment.eventType = 'thinking';
    assistant.reasoning = event.assistant.thinkingSnapshot;
    assistant.eventType = 'thinking';
  } else if (event.assistant.kind === 'tool_event') {
    const tool = {
      toolCallId: event.assistant.toolCallId,
      toolName: event.assistant.toolName,
      phase: event.assistant.phase,
      input: event.assistant.input
    };
    segment.tools = upsertTool(segment.tools, tool);
    segment.eventType = 'searching';
    assistant.activeTools = upsertTool(assistant.activeTools, tool);
    assistant.eventType = 'searching';
  }

  return {
    ...snapshot,
    version: event.version,
    assistant
  };
}

function applyLiveEvent(snapshot: RunStreamSnapshotEventDto, event: RunStreamHubLiveEvent): RunStreamSnapshotEventDto {
  if (event.type === 'run.assistant') {
    return applyAssistantEvent(snapshot, event);
  }

  return {
    ...snapshot,
    run: event.run ? copyRun(event.run) : copyRun(snapshot.run),
    version: event.version
  };
}

export class InMemoryRunStreamHub implements RunStreamHub {
  private readonly sessions = new Map<string, RunStreamSession>();
  private readonly now: () => number;
  private readonly runningSessionMaxAgeMs: number;
  private readonly closedSessionRetentionMs: number;

  constructor(options: InMemoryRunStreamHubOptions = {}) {
    this.now = options.now ?? Date.now;
    this.runningSessionMaxAgeMs = options.runningSessionMaxAgeMs ?? DEFAULT_RUNNING_SESSION_MAX_AGE_MS;
    this.closedSessionRetentionMs = options.closedSessionRetentionMs ?? DEFAULT_CLOSED_SESSION_RETENTION_MS;
  }

  openSession(snapshot: RunStreamSnapshotEventDto): void {
    this.sessions.set(snapshot.runId, {
      snapshot: copySnapshotEvent(snapshot),
      subscribers: new Set(),
      openedAtMs: this.now(),
      closedAtMs: null
    });
  }

  getSnapshot(runId: string): RunStreamSnapshotEventDto | null {
    const session = this.sessions.get(runId);
    return session ? copySnapshotEvent(session.snapshot) : null;
  }

  publish(runId: string, event: RunStreamHubLiveEvent): boolean {
    const session = this.sessions.get(runId);
    if (!session || session.closedAtMs !== null || event.version <= session.snapshot.version) {
      return false;
    }

    session.snapshot = applyLiveEvent(session.snapshot, event);
    for (const subscriber of session.subscribers) {
      subscriber.send(event);
    }
    return true;
  }

  subscribe(runId: string, subscriber: RunStreamHubSubscriber): RunStreamHubSubscription | null {
    const session = this.sessions.get(runId);
    if (!session) {
      return null;
    }

    session.subscribers.add(subscriber);
    subscriber.send(copySnapshotEvent(session.snapshot));

    if (session.closedAtMs !== null) {
      subscriber.close?.();
      session.subscribers.delete(subscriber);
      return {
        unsubscribe() {}
      };
    }

    return {
      unsubscribe: () => {
        session.subscribers.delete(subscriber);
      }
    };
  }

  closeSession(runId: string, terminalEvent?: RunStreamHubLiveEvent): boolean {
    const session = this.sessions.get(runId);
    if (!session) {
      return false;
    }

    if (terminalEvent) {
      this.publish(runId, terminalEvent);
    }

    session.closedAtMs = this.now();
    for (const subscriber of session.subscribers) {
      subscriber.close?.();
    }
    session.subscribers.clear();
    return true;
  }

  cleanup(nowMs = this.now()): number {
    let removed = 0;
    for (const [runId, session] of this.sessions) {
      const expiredRunning = session.closedAtMs === null && nowMs - session.openedAtMs >= this.runningSessionMaxAgeMs;
      const expiredClosed =
        session.closedAtMs !== null && nowMs - session.closedAtMs >= this.closedSessionRetentionMs;

      if (expiredRunning || expiredClosed) {
        for (const subscriber of session.subscribers) {
          subscriber.close?.();
        }
        this.sessions.delete(runId);
        removed += 1;
      }
    }

    return removed;
  }
}
