import type { TranscriptBlock } from '@/features/durable-chat/types/transcript-blocks';

export type ReplayRouteParams = {
  threadId: string;
};

export type ReplayMode = 'thread';

export type ReplayStatus = 'idle' | 'playing' | 'paused' | 'completed';

export type ReplayStepKind = 'text' | 'search-loading' | 'search-summary' | 'done';

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

export type ReplayDoneStep = ReplayBaseStep & {
  kind: 'done';
};

export type ReplayStep =
  | ReplayTextStep
  | ReplaySearchLoadingStep
  | ReplaySearchSummaryStep
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
};

export type ReplayViewState = {
  status: ReplayStatus;
  currentStepIndex: number;
  totalSteps: number;
  progressLabel: string;
};
