import { buildAnswerContainers } from '@/features/durable-chat/service/build-answer-containers';
import type { MessageDto, MessagePartDto } from '@agent-infra/contracts';

import type {
  ReplayControlState,
  ReplayCursor,
  ReplayPresentation,
  ReplaySession,
  ReplayStep,
  ReplayTextStep,
  ReplayViewState
} from '@/features/durable-chat/types/replay';
import type { AssistantTurnItem, SearchStatusBlock, SearchSummaryBlock, TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';

function createReplayPart(step: ReplayTextStep): MessagePartDto {
  return {
    id: `replay-part:${step.id}`,
    messageId: `replay-message:${step.id}`,
    partIndex: 0,
    type: step.variant === 'reasoning' ? 'reasoning' : 'text',
    textValue: step.content,
    jsonValue: null,
    createdAt: '1970-01-01T00:00:00.000Z'
  };
}

function createReplayMessage(step: ReplayTextStep, part: MessagePartDto): MessageDto {
  return {
    id: `replay-message:${step.id}`,
    threadId: step.threadId,
    runId: step.runId,
    role: step.role,
    seq: 0,
    status: 'completed',
    metadata: {
      replay: true,
      replayStepId: step.id
    },
    parts: [part],
    createdAt: '1970-01-01T00:00:00.000Z'
  };
}

function buildReplayTextBlock(step: ReplayTextStep): TranscriptBlock {
  const part = createReplayPart(step);
  const message = createReplayMessage(step, part);

  if (step.role === 'user') {
    return {
      type: 'user-message',
      id: `replay-user:${step.id}`,
      message
    };
  }

  const item: AssistantTurnItem =
    step.variant === 'reasoning'
      ? {
          type: 'reasoning',
          id: `replay-reasoning:${step.id}`,
          part
        }
      : {
          type: 'text',
          id: `replay-text:${step.id}`,
          part,
          cacheKey: `replay:${step.id}`
        };

  return {
    type: 'assistant-turn',
    id: `replay-assistant:${step.id}`,
    runId: step.runId,
    sourceMessages: [message],
    items: [item]
  };
}

function buildReplaySearchLoadingBlock(step: Extract<ReplayStep, { kind: 'search-loading' }>): TranscriptBlock {
  const status: SearchStatusBlock = {
    runId: step.runId,
    entries: step.toolCallIds.map((toolCallId) => ({
      toolCallId,
      query: step.query ?? ''
    }))
  };

  return {
    type: 'assistant-turn',
    id: `replay-assistant:${step.id}`,
    runId: step.runId,
    sourceMessages: [],
    items: [
      {
        type: 'search-status',
        id: `replay-search-status:${step.id}`,
        status
      }
    ]
  };
}

function buildReplaySearchSummaryBlock(step: Extract<ReplayStep, { kind: 'search-summary' }>): TranscriptBlock {
  const summary: SearchSummaryBlock = {
    runId: step.runId,
    entries: [
      {
        toolCallId: step.toolCallIds[0] ?? step.id,
        query: step.query,
        resultCount: step.resultCount,
        sourceNames: step.sourceNames,
        sources: step.sources
      }
    ]
  };

  return {
    type: 'assistant-turn',
    id: `replay-assistant:${step.id}`,
    runId: step.runId,
    sourceMessages: [],
    items: [
      {
        type: 'search-summary',
        id: `replay-search-summary:${step.id}`,
        summary
      }
    ]
  };
}

function buildReplayToolPartBlock(step: Extract<ReplayStep, { kind: 'tool-part' }>): TranscriptBlock {
  return {
    type: 'assistant-turn',
    id: `replay-assistant:${step.id}`,
    runId: step.runId,
    sourceMessages: [],
    items: [
      {
        type: 'tool-part',
        id: `replay-tool-part:${step.id}`,
        part: step.part
      }
    ]
  };
}

function buildReplayStepBlock(step: ReplayStep): TranscriptBlock | null {
  if (step.kind === 'done') {
    return null;
  }

  if (step.kind === 'text') {
    return buildReplayTextBlock(step);
  }

  if (step.kind === 'search-loading') {
    return buildReplaySearchLoadingBlock(step);
  }

  if (step.kind === 'tool-part') {
    return buildReplayToolPartBlock(step);
  }

  return buildReplaySearchSummaryBlock(step);
}

function getOpenUrlToolCallId(step: ReplayStep, partType: 'tool-call' | 'tool-result') {
  if (step.kind !== 'tool-part' || step.part.type !== partType) {
    return null;
  }

  const value = step.part.jsonValue;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value.toolName === 'openUrl' && typeof value.toolCallId === 'string' ? value.toolCallId : null;
}

function getVisibleSteps(session: ReplaySession, cursor: ReplayCursor) {
  if (cursor.stepIndex < 0) {
    return [];
  }

  const rawVisibleSteps = session.steps.slice(0, cursor.stepIndex + 1).filter((step) => step.kind !== 'done');
  const completedSearchToolCallIds = new Set(
    rawVisibleSteps.flatMap((step) => (step.kind === 'search-summary' ? step.toolCallIds : []))
  );
  const completedOpenUrlToolCallIds = new Set(
    rawVisibleSteps
      .map((step) => getOpenUrlToolCallId(step, 'tool-result'))
      .filter((toolCallId): toolCallId is string => Boolean(toolCallId))
  );

  return rawVisibleSteps.filter((step) => {
    if (step.kind !== 'search-loading') {
      const openUrlCallToolCallId = getOpenUrlToolCallId(step, 'tool-call');
      return !openUrlCallToolCallId || !completedOpenUrlToolCallIds.has(openUrlCallToolCallId);
    }

    return !step.toolCallIds.every((toolCallId) => completedSearchToolCallIds.has(toolCallId));
  });
}

export function buildReplayTranscriptBlocks(session: ReplaySession, cursor: ReplayCursor): TranscriptBlock[] {
  const stepBlocks = getVisibleSteps(session, cursor)
    .map((step) => buildReplayStepBlock(step))
    .filter((block): block is TranscriptBlock => block !== null);

  return [...session.initialTranscriptBlocks, ...stepBlocks];
}

export function buildReplayControlState(session: ReplaySession | null, cursor: ReplayCursor): ReplayControlState {
  const hasReplayableSteps = Boolean(session?.steps.some((step) => step.kind !== 'done'));
  const hasStarted = cursor.stepIndex >= 0 || cursor.status === 'completed';

  return {
    canPlay: hasReplayableSteps && cursor.status === 'idle',
    canPause: hasReplayableSteps && cursor.status === 'playing',
    canResume: hasReplayableSteps && cursor.status === 'paused',
    canRestart: hasReplayableSteps && hasStarted
  };
}

export function buildReplayViewState(session: ReplaySession | null, cursor: ReplayCursor): ReplayViewState {
  const totalSteps = session ? session.steps.filter((step) => step.kind !== 'done').length : 0;
  const consumedSteps = cursor.stepIndex >= 0 ? Math.min(cursor.stepIndex + 1, totalSteps) : 0;

  return {
    status: cursor.status,
    currentStepIndex: consumedSteps,
    totalSteps,
    progressLabel: totalSteps > 0 ? `${consumedSteps} / ${totalSteps}` : '0 / 0'
  };
}

export function buildReplayPresentation(session: ReplaySession | null, cursor: ReplayCursor): ReplayPresentation {
  const transcriptBlocks = session ? buildReplayTranscriptBlocks(session, cursor) : [];

  return {
    transcriptBlocks,
    answerContainers: buildAnswerContainers(transcriptBlocks),
    controlState: buildReplayControlState(session, cursor),
    viewState: buildReplayViewState(session, cursor)
  };
}
