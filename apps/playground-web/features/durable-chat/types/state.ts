import type { MessageDto, RunDto, RunTimelineResponseDto, RuntimePiMetaDto, ThreadDto } from '@agent-infra/contracts';

import type { LiveAssistantDraft } from './live-assistant-draft';
import type { ChatPhase } from './runtime';

export type ChatSessionState = {
  threads: ThreadDto[];
  activeThreadId: string | null;
  messages: MessageDto[];
  draft: string;
  optimisticUserMessage: MessageDto | null;
  meta: RuntimePiMetaDto | null;
  selectedModelKey: string;
  chatPhase: ChatPhase;
  persistingTurn: boolean;
  loadingThreadId: string | null;
  loadingMessages: boolean;
  error: string | null;
  liveStreamRunId: string | null;
  liveAssistantDraft: LiveAssistantDraft | null;
  durableRecoveryNotice: string | null;
  sidebarOpen: boolean;
  showScrollToBottom: boolean;
};

export type RunInspectorState = {
  logOpen: boolean;
  selectedRunId: string | null;
  recentRuns: RunDto[];
  recentRunsLoading: boolean;
  recentRunsError: string | null;
  timeline: RunTimelineResponseDto | null;
  timelineLoading: boolean;
  timelineError: string | null;
};
