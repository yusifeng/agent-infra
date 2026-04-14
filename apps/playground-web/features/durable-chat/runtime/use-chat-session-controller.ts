'use client';

import type { MessageDto, RuntimePiMetaDto, ThreadDto } from '@agent-infra/contracts';
import { useReducer } from 'react';

import type { LiveAssistantDraft } from '../types/live-assistant-draft';
import type { ChatPhase } from '../types/runtime';
import type { ChatSessionState } from '../types/state';

type Updater<T> = T | ((current: T) => T);
type ChatSessionAction = Partial<ChatSessionState> | ((current: ChatSessionState) => ChatSessionState);

function resolveNext<T>(current: T, next: Updater<T>) {
  return typeof next === 'function' ? (next as (value: T) => T)(current) : next;
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
    chatPhase: 'idle',
    persistingTurn: false,
    loadingThreadId: null,
    loadingMessages: false,
    error: null,
    liveStreamRunId: null,
    liveAssistantDraft: null,
    durableRecoveryNotice: null,
    sidebarOpen: typeof window === 'undefined' ? true : window.innerWidth >= 1024,
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
    setError: (next: Updater<string | null>) => {
      dispatch((current) => ({ ...current, error: resolveNext(current.error, next) }));
    },
    setLiveStreamRunId: (next: Updater<string | null>) => {
      dispatch((current) => ({ ...current, liveStreamRunId: resolveNext(current.liveStreamRunId, next) }));
    },
    setLiveAssistantDraft: (next: Updater<LiveAssistantDraft | null>) => {
      dispatch((current) => ({ ...current, liveAssistantDraft: resolveNext(current.liveAssistantDraft, next) }));
    },
    setDurableRecoveryNotice: (next: Updater<string | null>) => {
      dispatch((current) => ({ ...current, durableRecoveryNotice: resolveNext(current.durableRecoveryNotice, next) }));
    },
    setSidebarOpen: (next: Updater<boolean>) => {
      dispatch((current) => ({ ...current, sidebarOpen: resolveNext(current.sidebarOpen, next) }));
    },
    setShowScrollToBottom: (next: Updater<boolean>) => {
      dispatch((current) => ({ ...current, showScrollToBottom: resolveNext(current.showScrollToBottom, next) }));
    }
  };
}
