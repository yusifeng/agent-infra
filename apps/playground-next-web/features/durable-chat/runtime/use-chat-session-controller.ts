'use client';

import type { DurableRecoveryState, LiveAssistantDraftsByRunId } from '@agent-infra/durable-chat-client';
import type { MessageDto, RunDto, RuntimePiMetaDto, ThreadDto, ThreadMessagesPageInfoDto } from '@agent-infra/contracts';
import { useReducer } from 'react';

import type { LiveAssistantDraft } from '../types/live-assistant-draft';
import type { ChatPhase } from '../types/runtime';
import type { ChatSessionState } from '../types/state';

type Updater<T> = T | ((current: T) => T);
type ChatSessionAction = Partial<ChatSessionState> | ((current: ChatSessionState) => ChatSessionState);

function resolveNext<T>(current: T, next: Updater<T>) {
  return typeof next === 'function' ? (next as (value: T) => T)(current) : next;
}

export function selectPrimaryLiveAssistantDraft(
  state: ChatSessionState,
  liveAssistantDraftsByRunId: LiveAssistantDraftsByRunId
) {
  const preferredRunIds = [
    state.liveStreamRunId,
    ...state.liveStreamRunIds,
    state.activeResponseRun?.id ?? null,
    ...state.activeResponseRuns.map((run) => run.id)
  ].filter((runId): runId is string => typeof runId === 'string' && runId.length > 0);

  for (const runId of preferredRunIds) {
    const draft = liveAssistantDraftsByRunId[runId];
    if (draft) {
      return draft;
    }
  }

  return null;
}

export function selectPrimaryActiveResponseRun(state: ChatSessionState, activeResponseRuns: RunDto[]) {
  if (state.activeResponseRun && activeResponseRuns.some((run) => run.id === state.activeResponseRun?.id)) {
    return state.activeResponseRun;
  }

  return activeResponseRuns[0] ?? null;
}

function chatSessionReducer(state: ChatSessionState, action: ChatSessionAction) {
  if (typeof action === 'function') {
    return action(state);
  }

  return {
    ...state,
    ...action
  };
}

function createInitialChatSessionState(): ChatSessionState {
  return {
    threads: [],
    activeThreadId: null,
    messages: [],
    draft: '',
    optimisticUserMessage: null,
    meta: null,
    selectedModelKey: '',
    selectedWebSearchEnabled: false,
    selectedThinkingEnabled: false,
    selectedReasoningEffort: 'high',
    chatPhase: 'idle',
    persistingTurn: false,
    loadingThreadId: null,
    loadingMessages: false,
    historyLoading: false,
    error: null,
    liveStreamRunId: null,
    liveStreamRunIds: [],
    liveAssistantDraft: null,
    liveAssistantDraftsByRunId: {},
    messagePageInfo: null,
    activeResponseRun: null,
    activeResponseRuns: [],
    durableRecoveryState: {
      phase: 'idle',
      message: null
    },
    sidebarOpen: true,
    showScrollToBottom: false
  };
}

export function useChatSessionController() {
  const [state, dispatch] = useReducer(chatSessionReducer, undefined, createInitialChatSessionState);

  return {
    state,
    updateSession: (action: ChatSessionAction) => dispatch(action),
    setThreads: (next: Updater<ThreadDto[]>) => {
      dispatch((current) => ({ ...current, threads: resolveNext(current.threads, next) }));
    },
    setActiveThreadId: (next: Updater<string | null>) => {
      dispatch((current) => ({ ...current, activeThreadId: resolveNext(current.activeThreadId, next) }));
    },
    setMessages: (next: Updater<MessageDto[]>) => {
      dispatch((current) => ({ ...current, messages: resolveNext(current.messages, next) }));
    },
    setDraft: (next: Updater<string>) => {
      dispatch((current) => ({ ...current, draft: resolveNext(current.draft, next) }));
    },
    setOptimisticUserMessage: (next: Updater<MessageDto | null>) => {
      dispatch((current) => ({ ...current, optimisticUserMessage: resolveNext(current.optimisticUserMessage, next) }));
    },
    setMeta: (next: Updater<RuntimePiMetaDto | null>) => {
      dispatch((current) => ({ ...current, meta: resolveNext(current.meta, next) }));
    },
    setSelectedModelKey: (next: Updater<string>) => {
      dispatch((current) => ({ ...current, selectedModelKey: resolveNext(current.selectedModelKey, next) }));
    },
    setSelectedWebSearchEnabled: (next: Updater<boolean>) => {
      dispatch((current) => ({ ...current, selectedWebSearchEnabled: resolveNext(current.selectedWebSearchEnabled, next) }));
    },
    setSelectedThinkingEnabled: (next: Updater<boolean>) => {
      dispatch((current) => ({ ...current, selectedThinkingEnabled: resolveNext(current.selectedThinkingEnabled, next) }));
    },
    setSelectedReasoningEffort: (next: Updater<'high' | 'max'>) => {
      dispatch((current) => ({ ...current, selectedReasoningEffort: resolveNext(current.selectedReasoningEffort, next) }));
    },
    setChatPhase: (next: Updater<ChatPhase>) => {
      dispatch((current) => ({ ...current, chatPhase: resolveNext(current.chatPhase, next) }));
    },
    setPersistingTurn: (next: Updater<boolean>) => {
      dispatch((current) => ({ ...current, persistingTurn: resolveNext(current.persistingTurn, next) }));
    },
    setLoadingThreadId: (next: Updater<string | null>) => {
      dispatch((current) => ({ ...current, loadingThreadId: resolveNext(current.loadingThreadId, next) }));
    },
    setLoadingMessages: (next: Updater<boolean>) => {
      dispatch((current) => ({ ...current, loadingMessages: resolveNext(current.loadingMessages, next) }));
    },
    setHistoryLoading: (next: Updater<boolean>) => {
      dispatch((current) => ({ ...current, historyLoading: resolveNext(current.historyLoading, next) }));
    },
    setError: (next: Updater<string | null>) => {
      dispatch((current) => ({ ...current, error: resolveNext(current.error, next) }));
    },
    setLiveStreamRunId: (next: Updater<string | null>) => {
      dispatch((current) => ({ ...current, liveStreamRunId: resolveNext(current.liveStreamRunId, next) }));
    },
    setLiveStreamRunIds: (next: Updater<string[]>) => {
      dispatch((current) => {
        const liveStreamRunIds = resolveNext(current.liveStreamRunIds, next);
        return {
          ...current,
          liveStreamRunIds,
          liveStreamRunId: liveStreamRunIds[0] ?? null
        };
      });
    },
    setLiveAssistantDraft: (next: Updater<LiveAssistantDraft | null>) => {
      dispatch((current) => ({ ...current, liveAssistantDraft: resolveNext(current.liveAssistantDraft, next) }));
    },
    setLiveAssistantDraftsByRunId: (next: Updater<LiveAssistantDraftsByRunId>) => {
      dispatch((current) => {
        const liveAssistantDraftsByRunId = resolveNext(current.liveAssistantDraftsByRunId, next);
        return {
          ...current,
          liveAssistantDraftsByRunId,
          liveAssistantDraft: selectPrimaryLiveAssistantDraft(current, liveAssistantDraftsByRunId)
        };
      });
    },
    setMessagePageInfo: (next: Updater<ThreadMessagesPageInfoDto | null>) => {
      dispatch((current) => ({ ...current, messagePageInfo: resolveNext(current.messagePageInfo, next) }));
    },
    setActiveResponseRun: (next: Updater<RunDto | null>) => {
      dispatch((current) => ({ ...current, activeResponseRun: resolveNext(current.activeResponseRun, next) }));
    },
    setActiveResponseRuns: (next: Updater<RunDto[]>) => {
      dispatch((current) => {
        const activeResponseRuns = resolveNext(current.activeResponseRuns, next);
        return {
          ...current,
          activeResponseRuns,
          activeResponseRun: selectPrimaryActiveResponseRun(current, activeResponseRuns)
        };
      });
    },
    setDurableRecoveryState: (next: Updater<DurableRecoveryState>) => {
      dispatch((current) => ({ ...current, durableRecoveryState: resolveNext(current.durableRecoveryState, next) }));
    },
    setSidebarOpen: (next: Updater<boolean>) => {
      dispatch((current) => ({ ...current, sidebarOpen: resolveNext(current.sidebarOpen, next) }));
    },
    setShowScrollToBottom: (next: Updater<boolean>) => {
      dispatch((current) => ({ ...current, showScrollToBottom: resolveNext(current.showScrollToBottom, next) }));
    }
  };
}
