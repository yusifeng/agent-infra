import type {
  RunStreamAssistantEventDto,
  RunStreamSnapshotEventDto
} from '@agent-infra/contracts';

import type { LiveAssistantDraft, LiveAssistantSegment, LiveAssistantToolState } from '../types/live-assistant-draft.js';
import type { ChatPhase } from '../types/runtime.js';

function createSegment(messageId: string, index = 0): LiveAssistantSegment {
  return {
    id: `${messageId}:${index}`,
    messageId,
    text: '',
    reasoning: null,
    tools: [],
    eventType: 'start'
  };
}

export function createEmptyLiveDraft(runId: string, messageId: string): LiveAssistantDraft {
  return {
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
  };
}

function deriveSegmentEventType(segment: LiveAssistantSegment): LiveAssistantSegment['eventType'] {
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
}

function syncDraftFromSegments(draft: LiveAssistantDraft, segments: LiveAssistantSegment[]): LiveAssistantDraft {
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
}

function ensureCurrentSegment(
  draft: LiveAssistantDraft,
  messageId: string,
  options: { startNewOnToolBoundary?: boolean } = {}
) {
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
}

function replaceCurrentSegment(segments: LiveAssistantSegment[], segment: LiveAssistantSegment) {
  const nextSegments = [...segments];
  nextSegments[nextSegments.length - 1] = segment;
  return nextSegments;
}

function applyTextDelta(current: LiveAssistantDraft | null, runId: string, messageId: string, delta: string): LiveAssistantDraft {
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
}

function applyTextReplace(
  current: LiveAssistantDraft | null,
  runId: string,
  messageId: string,
  snapshot: string
): LiveAssistantDraft {
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
}

function applyThinkingDelta(
  current: LiveAssistantDraft | null,
  runId: string,
  messageId: string,
  delta: string
): LiveAssistantDraft {
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
}

function applyThinkingReplace(
  current: LiveAssistantDraft | null,
  runId: string,
  messageId: string,
  snapshot: string
): LiveAssistantDraft {
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
}

function applyToolEvent(
  current: LiveAssistantDraft | null,
  runId: string,
  messageId: string,
  tool: LiveAssistantToolState
): LiveAssistantDraft {
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
}

export function resolveAssistantStreamChatPhase(event: RunStreamAssistantEventDto): Extract<ChatPhase, 'thinking' | 'streaming'> {
  return event.assistant.kind === 'thinking_delta' || event.assistant.kind === 'thinking_replace' ? 'thinking' : 'streaming';
}

export function applyRunAssistantEventToLiveDraft(
  current: LiveAssistantDraft | null,
  event: RunStreamAssistantEventDto
): LiveAssistantDraft {
  const assistant = event.assistant;

  if (assistant.kind === 'assistant_delta') {
    return applyTextDelta(current, event.runId, assistant.messageId, assistant.textDelta);
  }

  if (assistant.kind === 'assistant_replace') {
    return applyTextReplace(current, event.runId, assistant.messageId, assistant.textSnapshot);
  }

  if (assistant.kind === 'thinking_delta') {
    return applyThinkingDelta(current, event.runId, assistant.messageId, assistant.thinkingDelta);
  }

  if (assistant.kind === 'thinking_replace') {
    return applyThinkingReplace(current, event.runId, assistant.messageId, assistant.thinkingSnapshot);
  }

  return applyToolEvent(current, event.runId, assistant.messageId, {
    toolCallId: assistant.toolCallId,
    toolName: assistant.toolName,
    phase: assistant.phase,
    input: assistant.input ?? null
  });
}

export function liveDraftFromRunSnapshot(event: RunStreamSnapshotEventDto): LiveAssistantDraft | null {
  const assistant = event.assistant;
  if (!assistant) {
    return null;
  }

  const fallbackMessageId = assistant.messageId ?? assistant.liveDraftId;
  const segments =
    assistant.segments.length > 0
      ? assistant.segments.map((segment) => ({
          id: segment.id,
          messageId: segment.messageId,
          text: segment.text,
          reasoning: segment.reasoning,
          tools: segment.tools.map((tool) => ({ ...tool })),
          eventType: segment.eventType
        }))
      : [
          {
            id: `${assistant.liveDraftId}:0`,
            messageId: fallbackMessageId,
            text: assistant.text,
            reasoning: assistant.reasoning,
            tools: assistant.activeTools.map((tool) => ({ ...tool })),
            eventType: assistant.eventType
          }
        ];

  return syncDraftFromSegments(
    {
      runId: event.runId,
      messageId: fallbackMessageId,
      source: 'live',
      committedText: '',
      partialText: '',
      segmentText: '',
      segmentTextMessageId: null,
      partialReasoning: null,
      segmentReasoningMessageId: null,
      activeTools: [],
      eventType: assistant.eventType,
      segments
    },
    segments
  );
}
