import { buildAnswerContainers } from '@/features/durable-chat/service/build-answer-containers';
import { getActiveReplayableStepIndex, getReplayableStepIndices } from '@/features/durable-chat/service/replay-player';
import { getReplaySegmentTone, getReplaySegmentWeight } from '@/features/durable-chat/service/replay-segments';
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

const replayStepKindLabels: Record<ReplayStep['kind'], string> = {
  text: '消息',
  'search-loading': '搜索中',
  'search-summary': '搜索结果',
  'tool-part': '工具调用',
  done: '完成'
};

function getReplayStepLabel(step: ReplayStep) {
  if (step.kind === 'text') {
    if (step.role === 'user') {
      return step.variant === 'reasoning' ? '用户思考' : '用户提问';
    }

    return step.variant === 'reasoning' ? 'AI 思考' : 'AI 回答';
  }

  if (step.kind === 'search-loading') {
    return '搜索请求';
  }

  if (step.kind === 'search-summary') {
    return '搜索结果';
  }

  if (step.kind === 'tool-part') {
    return step.part.type === 'tool-call' ? '工具调用' : '工具结果';
  }

  return replayStepKindLabels[step.kind];
}

function getReplayStepBlockId(step: ReplayStep) {
  if (step.kind === 'done') {
    return null;
  }

  if (step.kind === 'text' && step.role === 'user') {
    return `replay-user:${step.id}`;
  }

  return `replay-assistant:${step.id}`;
}

function readTimeMs(value: string | null) {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function getReplayStepDurationMs(step: ReplayStep, nextStep: ReplayStep | null) {
  const start = readTimeMs(step.occurredAt);
  const end = readTimeMs(nextStep?.occurredAt ?? null);

  if (start !== null && end !== null && end > start) {
    return end - start;
  }

  return Math.max(step.delayMs, 0);
}

function formatReplayDuration(durationMs: number) {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  }

  const roundedSeconds = Math.round(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function getReplayTotalDurationMs(steps: ReplayStep[]) {
  const firstTime = readTimeMs(steps[0]?.occurredAt ?? null);
  const lastTime = readTimeMs(steps.at(-1)?.occurredAt ?? null);

  if (firstTime !== null && lastTime !== null && lastTime > firstTime) {
    return lastTime - firstTime;
  }

  return null;
}

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
  const replayableStepIndices = getReplayableStepIndices(session);
  const hasReplayableSteps = replayableStepIndices.length > 0;
  const hasStarted = cursor.stepIndex >= 0 || cursor.status === 'completed';
  const activeStepIndex =
    cursor.status === 'completed' && replayableStepIndices.length > 0
      ? replayableStepIndices.length - 1
      : getActiveReplayableStepIndex(session, cursor);

  return {
    canPlay: hasReplayableSteps && cursor.status === 'idle',
    canPause: hasReplayableSteps && cursor.status === 'playing',
    canResume: hasReplayableSteps && cursor.status === 'paused',
    canRestart: hasReplayableSteps && hasStarted,
    canTogglePlayback: hasReplayableSteps,
    canPrevious: hasReplayableSteps && activeStepIndex > 0,
    canNext: hasReplayableSteps && activeStepIndex >= 0 && activeStepIndex < replayableStepIndices.length - 1,
    canInspect: hasReplayableSteps
  };
}

export function buildReplayViewState(
  session: ReplaySession | null,
  cursor: ReplayCursor,
  inspectedStepIndex: number | null = null
): ReplayViewState {
  const replayableStepIndices = getReplayableStepIndices(session);
  const totalSteps = replayableStepIndices.length;
  const consumedSteps =
    cursor.stepIndex >= 0 ? replayableStepIndices.filter((stepIndex) => stepIndex <= cursor.stepIndex).length : 0;
  const playbackStepIndex =
    cursor.status === 'completed' && totalSteps > 0 ? totalSteps - 1 : getActiveReplayableStepIndex(session, cursor);
  const playbackStepRawIndex = replayableStepIndices[playbackStepIndex] ?? null;
  const playbackStep = playbackStepRawIndex === null ? null : session?.steps[playbackStepRawIndex] ?? null;
  const validInspectedStepIndex =
    inspectedStepIndex !== null && inspectedStepIndex >= 0 && inspectedStepIndex < totalSteps ? inspectedStepIndex : null;
  const inspectedStepRawIndex = validInspectedStepIndex === null ? null : replayableStepIndices[validInspectedStepIndex] ?? null;
  const inspectedStep = inspectedStepRawIndex === null ? null : session?.steps[inspectedStepRawIndex] ?? null;
  const segments = replayableStepIndices.map((rawStepIndex, stepIndex) => {
    const step = session?.steps[rawStepIndex];
    const nextRawStepIndex = replayableStepIndices[stepIndex + 1] ?? null;
    const nextStep = nextRawStepIndex === null ? null : session?.steps[nextRawStepIndex] ?? null;
    const kind = step?.kind ?? 'done';
    const durationMs = step ? getReplayStepDurationMs(step, nextStep) : 0;

    return {
      stepIndex,
      rawStepIndex,
      label: step ? getReplayStepLabel(step) : replayStepKindLabels[kind],
      kind,
      tone: step ? getReplaySegmentTone(step) : 'thinking',
      weight: step ? getReplaySegmentWeight(step) : 0,
      durationMs,
      durationLabel: formatReplayDuration(durationMs),
      complete: stepIndex < consumedSteps,
      playbackActive: stepIndex === playbackStepIndex,
      inspected: stepIndex === validInspectedStepIndex
    };
  });
  const replayableSteps = replayableStepIndices
    .map((rawStepIndex) => session?.steps[rawStepIndex])
    .filter((step): step is ReplayStep => Boolean(step));
  const totalDurationMs =
    getReplayTotalDurationMs(replayableSteps) ?? segments.reduce((total, segment) => total + segment.durationMs, 0);

  return {
    status: cursor.status,
    currentStepIndex: consumedSteps,
    totalSteps,
    progressLabel: totalSteps > 0 ? `${consumedSteps} / ${totalSteps}` : '0 / 0',
    playbackStepIndex,
    playbackReplayBlockId: playbackStep ? getReplayStepBlockId(playbackStep) : null,
    inspectedStepIndex: validInspectedStepIndex,
    inspectedReplayBlockId: inspectedStep ? getReplayStepBlockId(inspectedStep) : null,
    currentStepLabel: playbackStep ? getReplayStepLabel(playbackStep) : '等待开始',
    currentStepKind: playbackStep?.kind ?? null,
    totalDurationLabel: formatReplayDuration(totalDurationMs),
    progressSegments: segments
  };
}

export function buildReplayPresentation(
  session: ReplaySession | null,
  cursor: ReplayCursor,
  inspectedStepIndex: number | null = null
): ReplayPresentation {
  const transcriptBlocks = session ? buildReplayTranscriptBlocks(session, cursor) : [];

  return {
    transcriptBlocks,
    answerContainers: buildAnswerContainers(transcriptBlocks),
    controlState: buildReplayControlState(session, cursor),
    viewState: buildReplayViewState(session, cursor, inspectedStepIndex)
  };
}
