import type { MessageDto, RunDto, RuntimePiMetaDto, ThreadMessagesPageInfoDto } from '@agent-infra/contracts';

import type { LiveAssistantDraft } from './live-assistant-draft';
import type { ChatPhase, DurableRecoveryState } from './runtime';
import type { PlaygroundThreadDto } from './thread';

export type { RunInspectorState } from '@agent-infra/durable-chat-client';

export type ChatSessionState = {
  threads: PlaygroundThreadDto[];
  activeThreadId: string | null;
  messages: MessageDto[];
  draft: string;
  optimisticUserMessage: MessageDto | null;
  meta: RuntimePiMetaDto | null;
  selectedModelKey: string;
  selectedWebSearchEnabled: boolean;
  selectedThinkingEnabled: boolean;
  selectedReasoningEffort: 'high' | 'max';
  chatPhase: ChatPhase;
  persistingTurn: boolean;
  loadingThreadId: string | null;
  loadingMessages: boolean;
  historyLoading: boolean;
  error: string | null;
  liveStreamRunId: string | null;
  liveAssistantDraft: LiveAssistantDraft | null;
  messagePageInfo: ThreadMessagesPageInfoDto | null;
  activeResponseRun: RunDto | null;
  durableRecoveryState: DurableRecoveryState;
  sidebarOpen: boolean;
  showScrollToBottom: boolean;
};
