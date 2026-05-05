import type { MessageDto, RunDto, RunTimelineResponseDto, ThreadMessagesPageInfoDto } from '@agent-infra/contracts';

import { fetchRunTimelineResponse, fetchThreadMessagesResponse, fetchThreadRunsResponse } from '../repo/chat-api.js';
import {
  chooseInitialRunId,
  compareRunsByCreatedAt,
  getMessageRenderKey,
  includeSelectedRun,
  mergeMessageWindow,
  mergeThreadMessagesPageInfo,
  RECENT_RUNS_LIMIT,
  resolvePostReconcileChatPhase
} from '../service/chat-runtime.js';
import { emitChatRenderDiagnostic } from '../service/render-diagnostics.js';
import type { ChatPhase } from '../types/runtime.js';
import type { LiveAssistantDraft } from '../types/live-assistant-draft.js';

type Updater<T> = T | ((current: T) => T);
type Setter<T> = (next: Updater<T>) => void;
type RefLike<T> = { current: T };

type ReconcileCompletedTurnArgs = {
  threadId: string;
  preferredRunId: string | null;
  requestId: number;
  state: {
    messages: MessageDto[];
    pageInfo: ThreadMessagesPageInfoDto | null;
  };
  refs: {
    activeThreadIdRef: RefLike<string | null>;
    logOpenRef: RefLike<boolean>;
    reconcileRequestIdRef: RefLike<number>;
    selectedRunIdRef: RefLike<string | null>;
    sendRequestIdRef: RefLike<number>;
  };
  actions: {
    setActiveResponseRun: Setter<RunDto | null>;
    setChatPhase: Setter<ChatPhase>;
    setError: Setter<string | null>;
    setLiveAssistantDraft: Setter<LiveAssistantDraft | null>;
    setLoadingThreadId: Setter<string | null>;
    setMessages: Setter<MessageDto[]>;
    setMessagePageInfo: Setter<ThreadMessagesPageInfoDto | null>;
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
  let reconciledPageInfo = state.pageInfo;

  try {
    {
      const messagesResult = await fetchThreadMessagesResponse(
        threadId,
        state.pageInfo?.endCursor
          ? {
              after: state.pageInfo.endCursor,
              signal: reconcileController.signal
            }
          : reconcileController.signal
      );

      if (isReconcileThreadStale()) {
        return;
      }
      if (!messagesResult.ok) {
        throw new Error(messagesResult.error ?? `Failed to recover thread messages (${messagesResult.status})`);
      }
      if (!isLatestReconcile()) {
        return;
      }

      const nextMessages = messagesResult.data.messages ?? [];
      const mergeMode = state.pageInfo?.endCursor ? 'append' : 'replace-merge';
      if (state.pageInfo?.endCursor) {
        reconciledMessages = mergeMessageWindow(state.messages, nextMessages);
        reconciledPageInfo = mergeThreadMessagesPageInfo(state.pageInfo, messagesResult.data.pageInfo ?? null, 'append');
      } else {
        reconciledMessages = mergeMessageWindow(state.messages, nextMessages);
        reconciledPageInfo = messagesResult.data.pageInfo ?? null;
      }

      emitReconcileMessagesDiagnostic({
        currentMessages: state.messages,
        incomingMessages: nextMessages,
        nextMessages: reconciledMessages,
        pageInfoMode: mergeMode,
        threadId
      });
      actions.setMessages(reconciledMessages);
      actions.setMessagePageInfo(reconciledPageInfo);
      actions.setActiveResponseRun(messagesResult.data.activeRun ?? null);
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

    actions.setError(reconcileError instanceof Error ? reconcileError.message : 'Failed to reconcile thread messages');

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

function emitReconcileMessagesDiagnostic(input: {
  currentMessages: MessageDto[];
  incomingMessages: MessageDto[];
  nextMessages: MessageDto[];
  pageInfoMode: 'append' | 'replace-merge';
  threadId: string;
}) {
  const { currentMessages, incomingMessages, nextMessages, pageInfoMode, threadId } = input;
  const currentMessagesById = new Map(currentMessages.map((message) => [message.id, message]));
  const incomingMessagesById = new Map(incomingMessages.map((message) => [message.id, message]));

  let preservedMessageRefs = 0;
  let replacedExistingMessageRefs = 0;
  let adoptedIncomingMessageRefs = 0;
  let untouchedExistingMessages = 0;
  let newMessages = 0;

  for (const message of nextMessages) {
    const currentMessage = currentMessagesById.get(message.id);
    const incomingMessage = incomingMessagesById.get(message.id);

    if (currentMessage && message === currentMessage) {
      preservedMessageRefs += 1;
      if (!incomingMessage) {
        untouchedExistingMessages += 1;
      }
      continue;
    }

    if (incomingMessage && message === incomingMessage) {
      adoptedIncomingMessageRefs += 1;
    }

    if (currentMessage) {
      replacedExistingMessageRefs += 1;
    } else {
      newMessages += 1;
    }
  }

  emitChatRenderDiagnostic({
    component: 'ReconcileMessages',
    key: threadId,
    phase: 'update',
    changedKeys: ['messages'],
    summary: {
      pageInfoMode,
      currentCount: currentMessages.length,
      incomingCount: incomingMessages.length,
      nextCount: nextMessages.length,
      preservedMessageRefs,
      replacedExistingMessageRefs,
      adoptedIncomingMessageRefs,
      untouchedExistingMessages,
      newMessages,
      currentRenderKeys: currentMessages.map(getMessageRenderKey).join(' | '),
      nextRenderKeys: nextMessages.map(getMessageRenderKey).join(' | ')
    }
  });
}
