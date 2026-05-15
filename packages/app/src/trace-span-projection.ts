import type { Run, RunEvent, Thread, ToolInvocation } from '@agent-infra/core';

import type {
  TraceProjectionDiagnosticCodeV1,
  TraceProjectionDiagnosticV1,
  TraceSpanProjectionDiagnosticsV1,
  TraceSpanProjectionV1,
  TraceSpanSourceRefV1,
  TraceSpanStatusV1,
  TraceSpanV1
} from './types.js';

type TraceSpanDraft = Omit<TraceSpanV1, 'order'> & {
  orderKey: number;
};

interface BuildTraceSpanProjectionInput {
  run: Run;
  thread: Thread;
  runEvents: RunEvent[];
  toolInvocations: ToolInvocation[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function runEventRef(event: RunEvent): TraceSpanSourceRefV1 {
  return {
    type: 'run_event',
    id: event.id,
    seq: event.seq,
    eventType: event.type
  };
}

function toolInvocationRef(tool: ToolInvocation): TraceSpanSourceRefV1 {
  return {
    type: 'tool_invocation',
    id: tool.id,
    toolCallId: tool.toolCallId
  };
}

function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function readRunStatus(run: Run): TraceSpanStatusV1 {
  return run.status;
}

function readToolStatus(tool: ToolInvocation): TraceSpanStatusV1 {
  if (tool.status === 'pending') {
    return 'queued';
  }

  return tool.status;
}

function readAssistantEndStatus(event: RunEvent): TraceSpanStatusV1 {
  const payload = asRecord(event.payload);
  const stopReason = readString(payload?.stopReason);
  const hasExplicitError =
    readBoolean(payload?.isError) === true ||
    readString(payload?.error) !== null ||
    readString(payload?.errorMessage) !== null ||
    readString(payload?.errorCode) !== null ||
    asRecord(payload?.error) !== null ||
    asRecord(payload?.errorDetails) !== null;

  return stopReason === 'error' || stopReason === 'aborted' || hasExplicitError ? 'failed' : 'completed';
}

function readUnpairedAssistantStatus(rootStatus: TraceSpanStatusV1): TraceSpanStatusV1 {
  if (rootStatus === 'queued' || rootStatus === 'running') {
    return 'running';
  }

  if (rootStatus === 'failed' || rootStatus === 'cancelled') {
    return rootStatus;
  }

  return 'unknown';
}

function readEventToolStatus(event: RunEvent): TraceSpanStatusV1 {
  if (event.type === 'tool_execution_start') {
    return 'running';
  }

  const isError = readBoolean(asRecord(event.payload)?.isError);
  return isError ? 'failed' : 'completed';
}

function calculateDurationMs(
  startedAt: Date | null | undefined,
  finishedAt: Date | null | undefined,
  onNegativeDuration: () => void
) {
  if (!startedAt || !finishedAt) {
    return null;
  }

  const durationMs = finishedAt.getTime() - startedAt.getTime();
  if (durationMs < 0) {
    onNegativeDuration();
    return 0;
  }

  return durationMs;
}

function createDiagnostics() {
  const warnings: TraceProjectionDiagnosticV1[] = [];

  return {
    add(code: TraceProjectionDiagnosticCodeV1, message: string, sourceRefs: TraceSpanSourceRefV1[]) {
      warnings.push({
        code,
        message,
        sourceRefs
      });
    },
    build(): TraceSpanProjectionDiagnosticsV1 {
      return {
        unknownEventCount: warnings.filter((warning) => warning.code === 'unknown_event').length,
        orphanEventCount: warnings.filter((warning) => warning.code === 'orphan_event').length,
        warnings
      };
    }
  };
}

function findFirstEvent(events: RunEvent[], type: string) {
  return events.find((event) => event.type === type) ?? null;
}

function findLastEvent(events: RunEvent[], type: string) {
  return [...events].reverse().find((event) => event.type === type) ?? null;
}

function isAssistantEvent(event: RunEvent, type: 'message_start' | 'message_end') {
  return event.type === type && asRecord(event.payload)?.role === 'assistant';
}

function isToolEvent(event: RunEvent) {
  return event.type === 'tool_execution_start' || event.type === 'tool_execution_end';
}

function readToolCallId(event: RunEvent) {
  return readString(asRecord(event.payload)?.toolCallId);
}

function readToolName(event: RunEvent) {
  return readString(asRecord(event.payload)?.toolName);
}

function collectToolEventsByCallId(runEvents: RunEvent[]) {
  const eventsByCallId = new Map<string, RunEvent[]>();
  const eventsWithoutCallId: RunEvent[] = [];

  for (const event of runEvents.filter(isToolEvent)) {
    const toolCallId = readToolCallId(event);
    if (!toolCallId) {
      eventsWithoutCallId.push(event);
      continue;
    }

    eventsByCallId.set(toolCallId, [...(eventsByCallId.get(toolCallId) ?? []), event]);
  }

  return {
    eventsByCallId,
    eventsWithoutCallId
  };
}

function buildSourceRefs(events: RunEvent[]) {
  return events.map(runEventRef);
}

function sortEvents(events: RunEvent[]) {
  return [...events].sort((left, right) => left.seq - right.seq);
}

function sortTools(tools: ToolInvocation[], toolEventsByCallId: Map<string, RunEvent[]>) {
  return [...tools].sort((left, right) => {
    const leftEventSeq = toolEventsByCallId.get(left.toolCallId)?.[0]?.seq ?? Number.MAX_SAFE_INTEGER;
    const rightEventSeq = toolEventsByCallId.get(right.toolCallId)?.[0]?.seq ?? Number.MAX_SAFE_INTEGER;

    if (leftEventSeq !== rightEventSeq) {
      return leftEventSeq - rightEventSeq;
    }

    return left.createdAt.getTime() - right.createdAt.getTime();
  });
}

export function buildTraceSpanProjection({
  run,
  thread,
  runEvents,
  toolInvocations
}: BuildTraceSpanProjectionInput): TraceSpanProjectionV1 {
  const sortedEvents = sortEvents(runEvents);
  const rootSpanId = `span:run:${run.id}`;
  const traceId = run.id;
  const diagnostics = createDiagnostics();
  const spans: TraceSpanDraft[] = [];
  const rootStatus = readRunStatus(run);
  const agentStart = findFirstEvent(sortedEvents, 'agent_start');
  const agentEnd = findLastEvent(sortedEvents, 'agent_end');
  const rootSourceRefs: TraceSpanSourceRefV1[] = [
    {
      type: 'run',
      id: run.id
    },
    ...buildSourceRefs([agentStart, agentEnd].filter((event): event is RunEvent => event !== null))
  ];
  const rootStartedAt = run.startedAt ?? agentStart?.createdAt ?? null;
  const rootFinishedAt = run.finishedAt ?? agentEnd?.createdAt ?? null;
  const rootDurationMs = calculateDurationMs(rootStartedAt, rootFinishedAt, () => {
    diagnostics.add('negative_duration_clamped', 'root span had negative duration', rootSourceRefs);
  });

  spans.push({
    schemaVersion: 1,
    id: rootSpanId,
    traceId,
    parentSpanId: null,
    kind: 'agent',
    name: 'agent',
    status: rootStatus,
    appId: thread.appId,
    threadId: run.threadId,
    runId: run.id,
    orderKey: 0,
    startedAt: toIsoString(rootStartedAt),
    finishedAt: toIsoString(rootFinishedAt),
    durationMs: rootDurationMs,
    provider: run.provider ?? null,
    model: run.model ?? null,
    usageRef: run.usage ? { source: 'run.usage', runId: run.id } : null,
    tool: null,
    error: run.error ? { message: run.error } : null,
    sourceRefs: rootSourceRefs,
    metadata: null
  });

  const assistantStarts = sortedEvents.filter((event) => isAssistantEvent(event, 'message_start'));
  const assistantEnds = sortedEvents.filter((event) => isAssistantEvent(event, 'message_end'));
  const usedAssistantEndIds = new Set<string>();

  for (const startEvent of assistantStarts) {
    const endEvent = assistantEnds.find((event) => event.seq > startEvent.seq && !usedAssistantEndIds.has(event.id)) ?? null;
    if (endEvent) {
      usedAssistantEndIds.add(endEvent.id);
    }

    const sourceRefs = buildSourceRefs([startEvent, endEvent].filter((event): event is RunEvent => event !== null));
    const durationMs = calculateDurationMs(startEvent.createdAt, endEvent?.createdAt ?? null, () => {
      diagnostics.add('negative_duration_clamped', 'assistant message span had negative duration', sourceRefs);
    });

    if (!endEvent) {
      diagnostics.add('unpaired_message_start', 'assistant message start event has no matching end event', sourceRefs);
    }

    spans.push({
      schemaVersion: 1,
      id: `span:assistant_message:${startEvent.id}`,
      traceId,
      parentSpanId: rootSpanId,
      kind: 'assistant_message',
      name: 'assistant_message',
      status: endEvent ? readAssistantEndStatus(endEvent) : readUnpairedAssistantStatus(rootStatus),
      appId: thread.appId,
      threadId: run.threadId,
      runId: run.id,
      orderKey: startEvent.seq,
      startedAt: toIsoString(startEvent.createdAt),
      finishedAt: toIsoString(endEvent?.createdAt ?? null),
      durationMs,
      provider: run.provider ?? null,
      model: run.model ?? null,
      usageRef: null,
      tool: null,
      error: null,
      sourceRefs,
      metadata: null
    });
  }

  for (const endEvent of assistantEnds.filter((event) => !usedAssistantEndIds.has(event.id))) {
    const sourceRefs = [runEventRef(endEvent)];
    diagnostics.add('unpaired_message_end', 'assistant message end event has no matching start event', sourceRefs);
    spans.push({
      schemaVersion: 1,
      id: `span:event:${endEvent.id}`,
      traceId,
      parentSpanId: rootSpanId,
      kind: 'assistant_message',
      name: 'assistant_message',
      status: readAssistantEndStatus(endEvent),
      appId: thread.appId,
      threadId: run.threadId,
      runId: run.id,
      orderKey: endEvent.seq,
      startedAt: toIsoString(endEvent.createdAt),
      finishedAt: toIsoString(endEvent.createdAt),
      durationMs: 0,
      provider: run.provider ?? null,
      model: run.model ?? null,
      usageRef: null,
      tool: null,
      error: null,
      sourceRefs,
      metadata: null
    });
  }

  const { eventsByCallId: toolEventsByCallId, eventsWithoutCallId } = collectToolEventsByCallId(sortedEvents);
  const usedToolEventIds = new Set<string>();
  for (const tool of sortTools(toolInvocations, toolEventsByCallId)) {
    const events = toolEventsByCallId.get(tool.toolCallId) ?? [];
    for (const event of events) {
      usedToolEventIds.add(event.id);
    }

    const sourceRefs = [toolInvocationRef(tool), ...buildSourceRefs(events)];
    const startedAt = tool.startedAt ?? events.find((event) => event.type === 'tool_execution_start')?.createdAt ?? null;
    const finishedAt = tool.finishedAt ?? events.find((event) => event.type === 'tool_execution_end')?.createdAt ?? null;
    const durationMs = calculateDurationMs(startedAt, finishedAt, () => {
      diagnostics.add('negative_duration_clamped', 'tool invocation span had negative duration', sourceRefs);
    });

    spans.push({
      schemaVersion: 1,
      id: `span:tool:${tool.id}`,
      traceId,
      parentSpanId: rootSpanId,
      kind: 'tool_invocation',
      name: tool.toolName,
      status: readToolStatus(tool),
      appId: thread.appId,
      threadId: run.threadId,
      runId: run.id,
      orderKey: events[0]?.seq ?? Number.MAX_SAFE_INTEGER - 1,
      startedAt: toIsoString(startedAt),
      finishedAt: toIsoString(finishedAt),
      durationMs,
      provider: null,
      model: null,
      usageRef: null,
      tool: {
        toolInvocationId: tool.id,
        toolCallId: tool.toolCallId,
        toolName: tool.toolName
      },
      error: tool.error ? { message: tool.error } : null,
      sourceRefs,
      metadata: null
    });
  }

  const orphanToolEvents = [
    ...sortedEvents.filter((event) => isToolEvent(event) && !usedToolEventIds.has(event.id)),
    ...eventsWithoutCallId.filter((event) => !usedToolEventIds.has(event.id))
  ];
  const uniqueOrphanToolEvents = [...new Map(orphanToolEvents.map((event) => [event.id, event])).values()];

  for (const event of uniqueOrphanToolEvents) {
    const sourceRefs = [runEventRef(event)];
    const toolCallId = readToolCallId(event) ?? 'unknown';
    const toolName = readToolName(event) ?? 'unknown';
    diagnostics.add('orphan_event', 'tool event has no durable tool invocation span', sourceRefs);
    diagnostics.add('missing_tool_invocation', 'tool event could not be linked to a durable tool invocation', sourceRefs);
    diagnostics.add(event.type === 'tool_execution_start' ? 'unpaired_tool_start' : 'unpaired_tool_end', 'tool event has no matching durable tool invocation', sourceRefs);

    spans.push({
      schemaVersion: 1,
      id: `span:event:${event.id}`,
      traceId,
      parentSpanId: rootSpanId,
      kind: 'tool_invocation',
      name: toolName,
      status: readEventToolStatus(event),
      appId: thread.appId,
      threadId: run.threadId,
      runId: run.id,
      orderKey: event.seq,
      startedAt: toIsoString(event.createdAt),
      finishedAt: toIsoString(event.createdAt),
      durationMs: 0,
      provider: null,
      model: null,
      usageRef: null,
      tool: {
        toolInvocationId: null,
        toolCallId,
        toolName
      },
      error: readEventToolStatus(event) === 'failed' ? { message: 'tool invocation failed' } : null,
      sourceRefs,
      metadata: null
    });
  }

  for (const event of sortedEvents.filter((candidate) => candidate.type === 'runtime_error')) {
    const sourceRefs = [runEventRef(event)];
    spans.push({
      schemaVersion: 1,
      id: `span:event:${event.id}`,
      traceId,
      parentSpanId: rootSpanId,
      kind: 'runtime_error',
      name: 'runtime_error',
      status: 'failed',
      appId: thread.appId,
      threadId: run.threadId,
      runId: run.id,
      orderKey: event.seq,
      startedAt: toIsoString(event.createdAt),
      finishedAt: toIsoString(event.createdAt),
      durationMs: 0,
      provider: null,
      model: null,
      usageRef: null,
      tool: null,
      error: {
        message: readString(asRecord(event.payload)?.message) ?? run.error ?? 'runtime error'
      },
      sourceRefs,
      metadata: null
    });
  }

  const projectedEventIds = new Set(
    spans.flatMap((span) => span.sourceRefs).filter((sourceRef): sourceRef is Extract<TraceSpanSourceRefV1, { type: 'run_event' }> => sourceRef.type === 'run_event').map((sourceRef) => sourceRef.id)
  );

  for (const event of sortedEvents.filter((candidate) => !projectedEventIds.has(candidate.id))) {
    if (event.type === 'agent_start' || event.type === 'agent_end') {
      continue;
    }

    const sourceRefs = [runEventRef(event)];
    diagnostics.add('unknown_event', `unknown run event type: ${event.type}`, sourceRefs);
    spans.push({
      schemaVersion: 1,
      id: `span:event:${event.id}`,
      traceId,
      parentSpanId: rootSpanId,
      kind: 'unknown_event',
      name: event.type,
      status: 'unknown',
      appId: thread.appId,
      threadId: run.threadId,
      runId: run.id,
      orderKey: event.seq,
      startedAt: toIsoString(event.createdAt),
      finishedAt: toIsoString(event.createdAt),
      durationMs: 0,
      provider: null,
      model: null,
      usageRef: null,
      tool: null,
      error: null,
      sourceRefs,
      metadata: null
    });
  }

  const sortedSpans = spans.sort((left, right) => left.orderKey - right.orderKey || left.id.localeCompare(right.id));

  return {
    schemaVersion: 1,
    traceId,
    rootSpanId,
    appId: thread.appId,
    threadId: run.threadId,
    runId: run.id,
    status: rootStatus,
    startedAt: toIsoString(rootStartedAt),
    finishedAt: toIsoString(rootFinishedAt),
    durationMs: rootDurationMs,
    spans: sortedSpans.map(({ orderKey: _orderKey, ...span }, order) => ({
      ...span,
      order
    })),
    diagnostics: diagnostics.build()
  };
}
