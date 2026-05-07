import type { MessageDto, RunDto, RunStreamEventDto, RunTimelineResponseDto, RuntimePiMetaDto, ThreadDto } from '@agent-infra/contracts';

import { openThreadRunStream } from '../repo/chat-api.js';
import {
  applyRunStateToTimeline,
  attachMessageRenderKey,
  buildOptimisticUserMessage,
  parseSseChunk,
  resolveSettledChatPhase,
  upsertMessage,
  upsertRun
} from '../service/chat-runtime.js';
import { emitApiDiagnostic } from '../service/api-diagnostics.js';
import type { LiveAssistantDraft, LiveAssistantSegment, LiveAssistantToolState } from '../types/live-assistant-draft.js';
import type { ChatPhase } from '../types/runtime.js';

type Updater<T> = T | ((current: T) => T);
type Setter<T> = (next: Updater<T>) => void;
type RefLike<T> = { current: T };

type SendMessageFlowArgs = {
  state: {
    activeThreadId: string | null;
    draft: string;
    isChatResponding: boolean;
    messages: MessageDto[];
    selectedWebSearchEnabled: boolean;
    selectedThinkingEnabled: boolean;
    selectedReasoningEffort: 'high' | 'max';
    selectedModelOption: RuntimePiMetaDto['modelOptions'][number] | null;
  };
  refs: {
    activeThreadIdRef: RefLike<string | null>;
    logOpenRef: RefLike<boolean>;
    selectedRunIdRef: RefLike<string | null>;
    sendAbortControllerRef: RefLike<AbortController | null>;
    sendRequestIdRef: RefLike<number>;
    shouldAutoScrollRef: RefLike<boolean>;
    timelineAbortControllerRef: RefLike<AbortController | null>;
    timelineRequestIdRef: RefLike<number>;
  };
  actions: {
    setActiveThreadId: Setter<string | null>;
    setActiveResponseRun: Setter<RunDto | null>;
    setChatPhase: Setter<ChatPhase>;
    setDraft: Setter<string>;
    setError: Setter<string | null>;
    setLiveAssistantDraft: Setter<LiveAssistantDraft | null>;
    setLiveStreamRunId: Setter<string | null>;
    setLoadingThreadId: Setter<string | null>;
    setMessages: Setter<MessageDto[]>;
    setOptimisticUserMessage: Setter<MessageDto | null>;
    setPersistingTurn: Setter<boolean>;
    setRecentRuns: Setter<RunDto[]>;
    setSelectedRunId: Setter<string | null>;
    setTimeline: Setter<RunTimelineResponseDto | null>;
    setTimelineError: Setter<string | null>;
    setTimelineLoading: Setter<boolean>;
  };
  operations: {
    createThreadRecord: () => Promise<ThreadDto>;
    pendingNewThreadLoadingId: string;
    reconcileCompletedTurn: (threadId: string, preferredRunId: string | null, requestId: number) => Promise<void>;
    replaceCurrentPath: (pathname: string) => void;
  };
};

export async function runSendMessageFlow({ state, refs, actions, operations }: SendMessageFlowArgs) {
  if (!state.draft.trim() || state.isChatResponding || !state.selectedModelOption) {
    return;
  }

  let threadId = state.activeThreadId;
  const text = state.draft.trim();
  const requestId = refs.sendRequestIdRef.current + 1;
  const optimisticThreadId = threadId ?? `pending-thread-${requestId}`;
  refs.sendRequestIdRef.current = requestId;
  refs.sendAbortControllerRef.current?.abort();
  const controller = new AbortController();
  refs.sendAbortControllerRef.current = controller;

  let streamedRunId: string | null = null;
  let streamSessionStarted = false;
  let terminalStreamError: string | null = null;
  let readyEventReceived = false;
  let requiresTranscriptRecovery = false;
  const streamDiagnostics = {
    firstAssistantEmitted: false,
    firstEventEmitted: false,
    requestId: null as string | null,
    streamOpenedAtMs: 0
  };

  const createSegment = (messageId: string, index = 0): LiveAssistantSegment => ({
    id: `${messageId}:${index}`,
    messageId,
    text: '',
    reasoning: null,
    tools: [],
    eventType: 'start'
  });

  const createEmptyLiveDraft = (runId: string, messageId: string): LiveAssistantDraft => ({
    runId,
    messageId,
    source: 'live',
    committedText: '',
    partialText: '',
    segmentText: '',
    segmentTextMessageId: null,
    partialReasoning: null,
    segmentReasoningMessageId: null,
    activeTools: [],
    eventType: 'start',
    segments: [createSegment(messageId)]
  });

  const deriveSegmentEventType = (segment: LiveAssistantSegment): LiveAssistantSegment['eventType'] => {
    if (segment.tools.some((tool) => tool.toolName === 'searchWeb' && tool.phase === 'start')) {
      return 'searching';
    }

    if (segment.reasoning) {
      return 'thinking';
    }

    if (segment.text) {
      return 'streaming';
    }

    return 'start';
  };

  const syncDraftFromSegments = (draft: LiveAssistantDraft, segments: LiveAssistantSegment[]): LiveAssistantDraft => {
    const currentSegment = segments.at(-1) ?? createSegment(draft.messageId);
    const activeTools = currentSegment.tools.filter((tool) => tool.phase === 'start');

    return {
      ...draft,
      source: 'live',
      messageId: currentSegment.messageId,
      partialText: currentSegment.text,
      segmentText: currentSegment.text,
      segmentTextMessageId: currentSegment.text ? currentSegment.messageId : null,
      partialReasoning: currentSegment.reasoning,
      segmentReasoningMessageId: currentSegment.reasoning ? currentSegment.messageId : null,
      activeTools,
      eventType: currentSegment.eventType,
      segments
    };
  };

  const ensureCurrentSegment = (
    draft: LiveAssistantDraft,
    messageId: string,
    options: { startNewOnToolBoundary?: boolean } = {}
  ) => {
    const segments = [...draft.segments];
    const currentSegment = segments.at(-1);
    const shouldCreateNewSegment =
      !currentSegment ||
      currentSegment.messageId !== messageId ||
      (options.startNewOnToolBoundary === true && currentSegment.tools.length > 0);

    if (
      currentSegment &&
      currentSegment.messageId !== messageId &&
      !currentSegment.text &&
      !currentSegment.reasoning &&
      currentSegment.tools.length === 0
    ) {
      const replacementSegment = createSegment(messageId, Math.max(segments.length - 1, 0));
      segments[segments.length - 1] = replacementSegment;
      return {
        segments,
        segment: replacementSegment
      };
    }

    if (shouldCreateNewSegment) {
      const nextSegment = createSegment(messageId, segments.length);
      segments.push(nextSegment);
      return {
        segments,
        segment: nextSegment
      };
    }

    return {
      segments,
      segment: { ...currentSegment }
    };
  };

  const replaceCurrentSegment = (segments: LiveAssistantSegment[], segment: LiveAssistantSegment) => {
    const nextSegments = [...segments];
    nextSegments[nextSegments.length - 1] = segment;
    return nextSegments;
  };

  const applyTextDelta = (current: LiveAssistantDraft | null, runId: string, messageId: string, delta: string): LiveAssistantDraft => {
    const base = current?.runId === runId ? current : createEmptyLiveDraft(runId, messageId);
    const { segments, segment } = ensureCurrentSegment(base, messageId, { startNewOnToolBoundary: true });
    const nextSegment: LiveAssistantSegment = {
      ...segment,
      text: `${segment.text}${delta}`
    };
    nextSegment.eventType = deriveSegmentEventType(nextSegment);

    return syncDraftFromSegments(
      {
        ...base,
        runId,
        committedText: ''
      },
      replaceCurrentSegment(segments, nextSegment)
    );
  };

  const applyTextReplace = (current: LiveAssistantDraft | null, runId: string, messageId: string, snapshot: string): LiveAssistantDraft => {
    const base = current?.runId === runId ? current : createEmptyLiveDraft(runId, messageId);
    const { segments, segment } = ensureCurrentSegment(base, messageId, { startNewOnToolBoundary: true });
    const nextSegment: LiveAssistantSegment = {
      ...segment,
      text: snapshot
    };
    nextSegment.eventType = deriveSegmentEventType(nextSegment);

    return syncDraftFromSegments(
      {
        ...base,
        runId,
        committedText: ''
      },
      replaceCurrentSegment(segments, nextSegment)
    );
  };

  const applyThinkingDelta = (current: LiveAssistantDraft | null, runId: string, messageId: string, delta: string): LiveAssistantDraft => {
    const base = current?.runId === runId ? current : createEmptyLiveDraft(runId, messageId);
    const { segments, segment } = ensureCurrentSegment(base, messageId);
    const nextSegment: LiveAssistantSegment = {
      ...segment,
      reasoning: `${segment.reasoning ?? ''}${delta}`
    };
    nextSegment.eventType = deriveSegmentEventType(nextSegment);

    return syncDraftFromSegments(
      {
        ...base,
        runId
      },
      replaceCurrentSegment(segments, nextSegment)
    );
  };

  const applyThinkingReplace = (current: LiveAssistantDraft | null, runId: string, messageId: string, snapshot: string): LiveAssistantDraft => {
    const base = current?.runId === runId ? current : createEmptyLiveDraft(runId, messageId);
    const { segments, segment } = ensureCurrentSegment(base, messageId, { startNewOnToolBoundary: true });
    const nextSegment: LiveAssistantSegment = {
      ...segment,
      reasoning: snapshot
    };
    nextSegment.eventType = deriveSegmentEventType(nextSegment);

    return syncDraftFromSegments(
      {
        ...base,
        runId
      },
      replaceCurrentSegment(segments, nextSegment)
    );
  };

  const applyToolEvent = (
    current: LiveAssistantDraft | null,
    runId: string,
    messageId: string,
    tool: LiveAssistantToolState
  ): LiveAssistantDraft => {
    const base = current?.runId === runId ? current : createEmptyLiveDraft(runId, messageId);
    const { segments, segment } = ensureCurrentSegment(base, messageId);
    const existingToolIndex = segment.tools.findIndex((entry) => entry.toolCallId === tool.toolCallId);
    const nextTools =
      existingToolIndex >= 0
        ? segment.tools.map((entry, index) => (index === existingToolIndex ? tool : entry))
        : [...segment.tools, tool];
    const nextSegment: LiveAssistantSegment = {
      ...segment,
      tools: nextTools
    };
    nextSegment.eventType = deriveSegmentEventType(nextSegment);

    return syncDraftFromSegments(
      {
        ...base,
        runId
      },
      replaceCurrentSegment(segments, nextSegment)
    );
  };

  const applyAssistantStreamEvent = (event: Extract<RunStreamEventDto, { type: 'run.assistant' }>) => {
    const assistant = event.assistant;

    if (assistant.kind === 'assistant_delta') {
      actions.setChatPhase('streaming');
      actions.setLiveAssistantDraft((current) => applyTextDelta(current, event.runId, assistant.messageId, assistant.textDelta));
      return;
    }

    if (assistant.kind === 'assistant_replace') {
      actions.setChatPhase('streaming');
      actions.setLiveAssistantDraft((current) => applyTextReplace(current, event.runId, assistant.messageId, assistant.textSnapshot));
      return;
    }

    if (assistant.kind === 'thinking_delta') {
      actions.setChatPhase('thinking');
      actions.setLiveAssistantDraft((current) => applyThinkingDelta(current, event.runId, assistant.messageId, assistant.thinkingDelta));
      return;
    }

    if (assistant.kind === 'thinking_replace') {
      actions.setChatPhase('thinking');
      actions.setLiveAssistantDraft((current) => applyThinkingReplace(current, event.runId, assistant.messageId, assistant.thinkingSnapshot));
      return;
    }

    if (assistant.kind === 'tool_event') {
      requiresTranscriptRecovery = true;
      actions.setChatPhase('streaming');
      actions.setLiveAssistantDraft((current) =>
        applyToolEvent(current, event.runId, assistant.messageId, {
          toolCallId: assistant.toolCallId,
          toolName: assistant.toolName,
          phase: assistant.phase,
          input: assistant.input ?? null
        })
      );
    }
  };

  const processStreamEvent = (event: RunStreamEventDto) => {
    const elapsedMs = Number((performance.now() - streamDiagnostics.streamOpenedAtMs).toFixed(1));

    if (!streamDiagnostics.firstEventEmitted) {
      streamDiagnostics.firstEventEmitted = true;
      emitApiDiagnostic({
        durationMs: elapsedMs,
        kind: 'stream-first-event',
        method: 'POST',
        note: event.type,
        requestId: streamDiagnostics.requestId,
        url: `/api/threads/${threadId}/runs/stream`
      });
    }

    streamedRunId = event.runId;
    actions.setLiveStreamRunId(event.runId);

    if (event.type === 'run.ready' && refs.logOpenRef.current && refs.selectedRunIdRef.current === null) {
      refs.selectedRunIdRef.current = event.runId;
      actions.setSelectedRunId(event.runId);
      actions.setTimeline(applyRunStateToTimeline(null, event));
    }

    if (event.type !== 'run.assistant' && refs.logOpenRef.current && refs.selectedRunIdRef.current === event.runId) {
      actions.setTimeline((current) => applyRunStateToTimeline(current, event));
    }

    if (event.type === 'run.ready') {
      readyEventReceived = true;
      actions.setActiveResponseRun(event.run);
      actions.setOptimisticUserMessage(null);
      actions.setMessages((current) => upsertMessage(current, attachMessageRenderKey(event.userMessage, `optimistic-user-${requestId}`)));
      actions.setRecentRuns((current) => upsertRun(current, event.run));
      actions.setLiveAssistantDraft((current) =>
        current
          ? {
              ...current,
              runId: event.runId
            }
          : current
      );
      return;
    }

    if (event.type === 'run.assistant') {
      if (!streamDiagnostics.firstAssistantEmitted) {
        streamDiagnostics.firstAssistantEmitted = true;
        emitApiDiagnostic({
          durationMs: elapsedMs,
          kind: 'stream-first-assistant',
          method: 'POST',
          note: event.assistant.kind,
          requestId: streamDiagnostics.requestId,
          url: `/api/threads/${threadId}/runs/stream`
        });
      }
      applyAssistantStreamEvent(event);
      return;
    }

    if (event.type === 'run.state' || event.type === 'run.completed') {
      actions.setRecentRuns((current) => upsertRun(current, event.run));
    }

    if (event.type === 'run.failed' && event.run) {
      const failedRun = event.run;
      actions.setRecentRuns((current) => upsertRun(current, failedRun));
    }

    if (event.type === 'run.state') {
      actions.setActiveResponseRun(event.run.status === 'queued' || event.run.status === 'running' ? event.run : null);
    }

    if (event.type === 'run.failed') {
      requiresTranscriptRecovery = true;
      terminalStreamError = event.error;
      actions.setActiveResponseRun(null);
      actions.setError(event.error);
      actions.setLiveStreamRunId(null);
      actions.setPersistingTurn(false);
      actions.setChatPhase('failed');
      actions.setLiveAssistantDraft((current) => (current?.runId === event.runId ? null : current));
      emitApiDiagnostic({
        durationMs: elapsedMs,
        kind: 'stream-terminal',
        method: 'POST',
        note: 'run.failed',
        ok: false,
        requestId: streamDiagnostics.requestId,
        status: 500,
        url: `/api/threads/${threadId}/runs/stream`
      });
      return;
    }

    if (event.type === 'run.completed') {
      actions.setActiveResponseRun(null);
      actions.setError(null);
      actions.setLiveStreamRunId(null);
      actions.setChatPhase(resolveSettledChatPhase);
      emitApiDiagnostic({
        durationMs: elapsedMs,
        kind: 'stream-terminal',
        method: 'POST',
        note: 'run.completed',
        ok: true,
        requestId: streamDiagnostics.requestId,
        status: 200,
        url: `/api/threads/${threadId}/runs/stream`
      });
    }
  };

  actions.setChatPhase('thinking');
  actions.setActiveResponseRun(null);
  actions.setPersistingTurn(false);
  actions.setLoadingThreadId(threadId ?? operations.pendingNewThreadLoadingId);
  actions.setError(null);
  actions.setLiveStreamRunId(null);
  actions.setDraft('');
  refs.timelineRequestIdRef.current += 1;
  refs.timelineAbortControllerRef.current?.abort();
  actions.setTimelineLoading(false);
  actions.setTimelineError(null);
  refs.shouldAutoScrollRef.current = true;
  actions.setOptimisticUserMessage(buildOptimisticUserMessage(optimisticThreadId, requestId, text, state.messages));
  actions.setLiveAssistantDraft(createEmptyLiveDraft(`pending-${requestId}`, `pending-assistant-${requestId}`));

  try {
    if (!threadId) {
      const nextThread = await operations.createThreadRecord();
      threadId = nextThread.id;
      actions.setActiveThreadId(threadId);
      refs.activeThreadIdRef.current = threadId;
      actions.setLoadingThreadId(threadId);
      operations.replaceCurrentPath(`/chat/${threadId}`);
    }

      const streamResult = await openThreadRunStream(
        threadId,
        {
          text,
          provider: state.selectedModelOption.provider,
          model: state.selectedModelOption.model,
          thinkingEnabled: state.selectedModelOption.provider === 'deepseek' ? state.selectedThinkingEnabled : undefined,
          reasoningEffort:
            state.selectedModelOption.provider === 'deepseek' && state.selectedThinkingEnabled ? state.selectedReasoningEffort : undefined,
          webSearchEnabled: state.selectedWebSearchEnabled
        },
        controller.signal
      );

    if (!streamResult.ok) {
      throw new Error(streamResult.error ?? `request failed (${streamResult.status})`);
    }

    if (!streamResult.body) {
      throw new Error('stream response body is unavailable');
    }

    streamSessionStarted = true;
    streamDiagnostics.requestId = streamResult.requestId;
    streamDiagnostics.streamOpenedAtMs = performance.now();
    const reader = streamResult.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (controller.signal.aborted || requestId !== refs.sendRequestIdRef.current) {
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseChunk(buffer);
      buffer = parsed.remainder;

      for (const event of parsed.events) {
        if (controller.signal.aborted || requestId !== refs.sendRequestIdRef.current) {
          return;
        }

        processStreamEvent(event);
      }
    }

    const finalChunk = decoder.decode();
    if (finalChunk) {
      const parsed = parseSseChunk(`${buffer}${finalChunk}\n\n`);
      for (const event of parsed.events) {
        processStreamEvent(event);
      }
    }
  } catch (sendError) {
    if (controller.signal.aborted || requestId !== refs.sendRequestIdRef.current) {
      return;
    }

    if (!readyEventReceived) {
      actions.setDraft(text);
      actions.setActiveResponseRun(null);
      actions.setOptimisticUserMessage(null);
      actions.setLiveAssistantDraft(null);
    } else {
      requiresTranscriptRecovery = true;
    }
    actions.setActiveResponseRun(null);
    actions.setChatPhase('failed');
    actions.setPersistingTurn(false);
    actions.setLoadingThreadId(null);
    actions.setError(sendError instanceof Error ? sendError.message : 'Failed to send message');
  } finally {
    if (requestId === refs.sendRequestIdRef.current) {
      refs.sendAbortControllerRef.current = null;
      actions.setLiveStreamRunId(null);
      actions.setChatPhase(resolveSettledChatPhase);
    }

    if (!controller.signal.aborted && requestId === refs.sendRequestIdRef.current && (streamSessionStarted || streamedRunId)) {
      if (threadId && refs.activeThreadIdRef.current === threadId) {
        const preferredRunId = streamedRunId ?? refs.selectedRunIdRef.current;
        actions.setPersistingTurn(true);
        void operations.reconcileCompletedTurn(threadId, preferredRunId, requestId);
      }

      if (terminalStreamError) {
        actions.setError(terminalStreamError);
      }
    }
  }
}
