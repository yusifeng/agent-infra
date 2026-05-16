import type { MessagePartDto } from '@agent-infra/contracts';

import type { TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';
import type { AnswerContainer } from '@/features/durable-chat/types/answer-containers';

export type ReplayRouteParams = {
  threadId: string;
};

export type ReplayMode = 'thread';

export type ReplayStatus = 'idle' | 'playing' | 'paused' | 'completed';

export type ReplayStepKind = 'text' | 'search-loading' | 'search-summary' | 'tool-part' | 'done';

export type ReplayTextRole = 'user' | 'assistant';

export type ReplayTextVariant = 'text' | 'reasoning';

type ReplayBaseStep = {
  id: string;
  kind: ReplayStepKind;
  threadId: string;
  runId: string | null;
  messageId: string | null;
  blockId: string | null;
  delayMs: number;
};

export type ReplayTextStep = ReplayBaseStep & {
  kind: 'text';
  role: ReplayTextRole;
  variant: ReplayTextVariant;
  content: string;
  sourceMessageIds: string[];
};

export type ReplaySearchLoadingStep = ReplayBaseStep & {
  kind: 'search-loading';
  toolCallIds: string[];
  query: string | null;
  sourceNames: string[];
};

export type ReplaySearchSummaryStep = ReplayBaseStep & {
  kind: 'search-summary';
  toolCallIds: string[];
  query: string;
  resultCount: number;
  sourceNames: string[];
  sources: Array<{
    sourceName: string;
    hostname: string;
  }>;
};

export type ReplayToolPartStep = ReplayBaseStep & {
  kind: 'tool-part';
  part: MessagePartDto;
};

export type ReplayDoneStep = ReplayBaseStep & {
  kind: 'done';
};

export type ReplayStep =
  | ReplayTextStep
  | ReplaySearchLoadingStep
  | ReplaySearchSummaryStep
  | ReplayToolPartStep
  | ReplayDoneStep;

export type ReplaySession = {
  id: string;
  threadId: string;
  mode: ReplayMode;
  steps: ReplayStep[];
  initialTranscriptBlocks: TranscriptBlock[];
  startedAt: string | null;
};

export type ReplayCursor = {
  stepIndex: number;
  status: ReplayStatus;
  startedAtMs: number | null;
  lastAdvancedAtMs: number | null;
};

export type ReplayControlState = {
  canPlay: boolean;
  canPause: boolean;
  canResume: boolean;
  canRestart: boolean;
  canTogglePlayback: boolean;
  canPrevious: boolean;
  canNext: boolean;
  canSeek: boolean;
};

export type ReplayViewState = {
  status: ReplayStatus;
  currentStepIndex: number;
  totalSteps: number;
  progressLabel: string;
  activeStepIndex: number;
  currentStepLabel: string;
  currentStepKind: ReplayStepKind | null;
  progressSegments: Array<{
    stepIndex: number;
    rawStepIndex: number;
    label: string;
    kind: ReplayStepKind;
    complete: boolean;
    active: boolean;
  }>;
};

export type ReplayPresentation = {
  transcriptBlocks: TranscriptBlock[];
  answerContainers: AnswerContainer[];
  controlState: ReplayControlState;
  viewState: ReplayViewState;
};
