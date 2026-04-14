'use client';

import type { MessageDto, RunDto, RunTimelineResponseDto } from '@agent-infra/contracts';
import type { MutableRefObject } from 'react';

import { fetchRunTimelineResponse, fetchThreadMessagesResponse, fetchThreadRunsResponse } from '../repo/chat-api';
import {
  chooseInitialRunId,
  compareRunsByCreatedAt,
  includeSelectedRun,
  RECENT_RUNS_LIMIT,
  resolvePostReconcileChatPhase
} from '../service/chat-runtime';
import type { ChatPhase } from '../types/runtime';
import type { LiveAssistantDraft } from '../types/live-assistant-draft';

type Updater<T> = T | ((current: T) => T);
type Setter<T> = (next: Updater<T>) => void;

type ReconcileCompletedTurnArgs = {
  threadId: string;
  preferredRunId: string | null;
  requestId: number;
  options?: { recoverTranscript?: boolean };
  state: {
    messages: MessageDto[];
  };
  refs: {
    activeThreadIdRef: MutableRefObject<string | null>;
    logOpenRef: MutableRefObject<boolean>;
    reconcileRequestIdRef: MutableRefObject<number>;
    selectedRunIdRef: MutableRefObject<string | null>;
    sendRequestIdRef: MutableRefObject<number>;
  };
  actions: {
    setChatPhase: Setter<ChatPhase>;
    setLiveAssistantDraft: Setter<LiveAssistantDraft | null>;
    setLoadingThreadId: Setter<string | null>;
    setMessages: Setter<MessageDto[]>;
    setOptimisticUserMessage: Setter<MessageDto | null>;
    setPersistingTurn: Setter<boolean>;
    setRecentRuns: Setter<RunDto[]>;
    setRecentRunsError: Setter<string | null>;
    setRecentRunsLoading: Setter<boolean>;
    setSelectedRunId: Setter<string | null>;
    setTimeline: Setter<RunTimelineResponseDto | null>;
    setTimelineError: Setter<string | null>;
    setTimelineLoading: Setter<boolean>;
  };
};

async function tryResolvePreferredRun(threadId: string, runId: string, signal: AbortSignal) {
  try {
    const result = await fetchRunTimelineResponse(runId, signal);
    if (!result.ok || !result.data.run || result.data.run.threadId !== threadId) {
      return null;
    }

    return result.data.run;
  } catch {
    return null;
  }
}

export async function runReconcileCompletedTurn({
  threadId,
  preferredRunId,
  requestId,
  options,
  state,
  refs,
  actions
}: ReconcileCompletedTurnArgs) {
  refs.reconcileRequestIdRef.current += 1;
  const reconcileRequestId = refs.reconcileRequestIdRef.current;
  const reconcileController = new AbortController();
  const isReconcileThreadStale = () => refs.activeThreadIdRef.current !== threadId;
  const isLatestReconcile = () => reconcileRequestId === refs.reconcileRequestIdRef.current;
  const isCurrentSend = () => requestId === refs.sendRequestIdRef.current;
  const inspectorEnabled = refs.logOpenRef.current;
  if (inspectorEnabled) {
    actions.setRecentRunsLoading(true);
    actions.setRecentRunsError(null);
  }
  const requestedRunId = preferredRunId ?? (inspectorEnabled ? refs.selectedRunIdRef.current : null);
  let nextSelectedRunId: string | null = null;
  let reconciledMessages = state.messages;

  try {
    if (options?.recoverTranscript) {
      const messagesResult = await fetchThreadMessagesResponse(threadId, reconcileController.signal);

      if (isReconcileThreadStale()) {
        return;
      }
      if (!messagesResult.ok) {
        throw new Error(messagesResult.error ?? `Failed to recover thread messages (${messagesResult.status})`);
      }
      if (!isLatestReconcile()) {
        return;
      }

      reconciledMessages = messagesResult.data.messages ?? [];
      actions.setMessages(reconciledMessages);
      if (isCurrentSend()) {
        actions.setOptimisticUserMessage(null);
        actions.setLiveAssistantDraft(null);
      }
    }

    if (inspectorEnabled) {
      const runsResult = await fetchThreadRunsResponse(threadId, RECENT_RUNS_LIMIT, reconcileController.signal);
      if (isReconcileThreadStale()) {
        return;
      }
      if (!runsResult.ok) {
        throw new Error(runsResult.error ?? `Failed to load thread runs (${runsResult.status})`);
      }

      let nextRuns = runsResult.data.runs.slice().sort(compareRunsByCreatedAt);
      if (requestedRunId && !nextRuns.some((run) => run.id === requestedRunId)) {
        const preferredResolvedRun = await tryResolvePreferredRun(threadId, requestedRunId, reconcileController.signal);
        if (isReconcileThreadStale()) {
          return;
        }

        nextRuns = includeSelectedRun(nextRuns, preferredResolvedRun);
      }

      if (!isLatestReconcile()) {
        return;
      }

      nextSelectedRunId = chooseInitialRunId(reconciledMessages, nextRuns, requestedRunId);
      actions.setRecentRuns(nextRuns);
      actions.setRecentRunsError(null);
      if (isCurrentSend()) {
        actions.setSelectedRunId(nextSelectedRunId);
      }
    }

    if (inspectorEnabled && nextSelectedRunId && isCurrentSend()) {
      actions.setTimelineLoading(true);
      actions.setTimelineError(null);
      try {
        const timelineResult = await fetchRunTimelineResponse(nextSelectedRunId);
        if (isReconcileThreadStale() || !isLatestReconcile()) {
          return;
        }
        if (!timelineResult.ok) {
          throw new Error(timelineResult.error ?? `Failed to load run timeline (${timelineResult.status})`);
        }

        if (
          refs.activeThreadIdRef.current === threadId &&
          requestId === refs.sendRequestIdRef.current &&
          refs.selectedRunIdRef.current === nextSelectedRunId
        ) {
          actions.setTimeline(timelineResult.data);
          actions.setTimelineError(null);
        }
      } catch (timelineRefreshError) {
        if (
          refs.activeThreadIdRef.current === threadId &&
          requestId === refs.sendRequestIdRef.current &&
          refs.selectedRunIdRef.current === nextSelectedRunId
        ) {
          actions.setTimelineError(timelineRefreshError instanceof Error ? timelineRefreshError.message : 'Failed to reconcile run timeline');
        }
      }
    } else if (inspectorEnabled && refs.activeThreadIdRef.current === threadId && isCurrentSend()) {
      actions.setTimeline(null);
      actions.setTimelineError(null);
    }
  } catch (reconcileError) {
    if (isReconcileThreadStale() || !isLatestReconcile()) {
      return;
    }

    if (inspectorEnabled) {
      actions.setRecentRunsError(reconcileError instanceof Error ? reconcileError.message : 'Failed to reconcile recent runs');
      if (nextSelectedRunId && isCurrentSend() && refs.selectedRunIdRef.current === nextSelectedRunId) {
        actions.setTimelineError(reconcileError instanceof Error ? reconcileError.message : 'Failed to reconcile run timeline');
      }
    }
  } finally {
    reconcileController.abort();
    if (requestId === refs.sendRequestIdRef.current) {
      actions.setPersistingTurn(false);
      actions.setChatPhase(resolvePostReconcileChatPhase);
      actions.setLoadingThreadId(null);
    }
    if (inspectorEnabled && refs.activeThreadIdRef.current === threadId && reconcileRequestId === refs.reconcileRequestIdRef.current) {
      actions.setRecentRunsLoading(false);
      if (nextSelectedRunId && refs.selectedRunIdRef.current === nextSelectedRunId) {
        actions.setTimelineLoading(false);
      }
    }
  }
}
