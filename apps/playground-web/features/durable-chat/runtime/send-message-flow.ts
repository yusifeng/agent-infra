'use client';

import type { MessageDto, RunDto, RunStreamEventDto, RunTimelineResponseDto, RuntimePiMetaDto, ThreadDto } from '@agent-infra/contracts';
import type { MutableRefObject } from 'react';

import { openThreadRunStream } from '../repo/chat-api';
import {
  applyRunStateToTimeline,
  buildAssistantMessageFromSnapshot,
  buildOptimisticUserMessage,
  getChatPhaseForAssistantSnapshot,
  isPrimaryChatAssistantEventType,
  parseSseChunk,
  resolveSettledChatPhase,
  upsertMessage,
  upsertRun
} from '../service/chat-runtime';
import type { LiveAssistantDraft } from '../types/live-assistant-draft';
import type { ChatPhase } from '../types/runtime';

type Updater<T> = T | ((current: T) => T);
type Setter<T> = (next: Updater<T>) => void;

type SendMessageFlowArgs = {
  state: {
    activeThreadId: string | null;
    draft: string;
    isChatResponding: boolean;
    messages: MessageDto[];
    selectedModelOption: RuntimePiMetaDto['modelOptions'][number] | null;
  };
  refs: {
    activeThreadIdRef: MutableRefObject<string | null>;
    logOpenRef: MutableRefObject<boolean>;
    selectedRunIdRef: MutableRefObject<string | null>;
    sendAbortControllerRef: MutableRefObject<AbortController | null>;
    sendRequestIdRef: MutableRefObject<number>;
    shouldAutoScrollRef: MutableRefObject<boolean>;
    timelineAbortControllerRef: MutableRefObject<AbortController | null>;
    timelineRequestIdRef: MutableRefObject<number>;
  };
  actions: {
    setActiveThreadId: Setter<string | null>;
    setChatPhase: Setter<ChatPhase>;
    setDraft: Setter<string>;
    setError: Setter<string | null>;
    setLiveAssistantDraft: Setter<LiveAssistantDraft | null>;
    setLiveStreamRunId: Setter<string | null>;
    setLoadingThreadId: Setter<string | null>;
    setMessages: Setter<MessageDto[]>;
    setOptimisticUserMessage: Setter<MessageDto | null>;
    setPersistingTurn: Setter<boolean>;
    setRecentRuns: Setter<RunDto[]>;
    setSelectedRunId: Setter<string | null>;
    setTimeline: Setter<RunTimelineResponseDto | null>;
    setTimelineError: Setter<string | null>;
    setTimelineLoading: Setter<boolean>;
  };
  operations: {
    createThreadRecord: () => Promise<ThreadDto>;
    pendingNewThreadLoadingId: string;
    reconcileCompletedTurn: (
      threadId: string,
      preferredRunId: string | null,
      requestId: number,
      options?: { recoverTranscript?: boolean }
    ) => Promise<void>;
    refreshThreads: () => Promise<ThreadDto[]>;
    replaceCurrentPath: (pathname: string) => void;
  };
};

export async function runSendMessageFlow({ state, refs, actions, operations }: SendMessageFlowArgs) {
  if (!state.draft.trim() || state.isChatResponding || !state.selectedModelOption) {
    return;
  }

  let threadId = state.activeThreadId;
  const text = state.draft.trim();
  const requestId = refs.sendRequestIdRef.current + 1;
  refs.sendRequestIdRef.current = requestId;
  refs.sendAbortControllerRef.current?.abort();
  const controller = new AbortController();
  refs.sendAbortControllerRef.current = controller;

  let streamedRunId: string | null = null;
  let streamSessionStarted = false;
  let terminalStreamError: string | null = null;
  let readyEventReceived = false;
  let requiresTranscriptRecovery = false;

  const applyAssistantSnapshot = (event: Extract<RunStreamEventDto, { type: 'run.assistant' }>) => {
    if (event.assistant.eventType.startsWith('toolcall')) {
      requiresTranscriptRecovery = true;
    }

    if (!isPrimaryChatAssistantEventType(event.assistant.eventType)) {
      actions.setLiveAssistantDraft({
        runId: event.runId,
        messageId: event.assistant.messageId,
        partialText: event.assistant.partialText,
        partialReasoning: event.assistant.partialReasoning,
        eventType: event.assistant.eventType
      });
      return;
    }

    if (event.assistant.eventType === 'text_end') {
      actions.setLiveStreamRunId(null);
      actions.setChatPhase(getChatPhaseForAssistantSnapshot(event.assistant));
      if (threadId && !requiresTranscriptRecovery) {
        actions.setMessages((current) =>
          upsertMessage(current, buildAssistantMessageFromSnapshot(current, threadId as string, event.runId, event.assistant))
        );
      }
      if (!requiresTranscriptRecovery) {
        actions.setLiveAssistantDraft(null);
      }
      return;
    }

    actions.setChatPhase(getChatPhaseForAssistantSnapshot(event.assistant));
    actions.setLiveAssistantDraft({
      runId: event.runId,
      messageId: event.assistant.messageId,
      partialText: event.assistant.partialText,
      partialReasoning: event.assistant.partialReasoning,
      eventType: event.assistant.eventType
    });
  };

  const processStreamEvent = (event: RunStreamEventDto) => {
    streamedRunId = event.runId;
    actions.setLiveStreamRunId(event.runId);

    if (event.type === 'run.ready' && refs.logOpenRef.current && refs.selectedRunIdRef.current === null) {
      refs.selectedRunIdRef.current = event.runId;
      actions.setSelectedRunId(event.runId);
      actions.setTimeline(applyRunStateToTimeline(null, event));
    }

    if (event.type !== 'run.assistant' && refs.logOpenRef.current && refs.selectedRunIdRef.current === event.runId) {
      actions.setTimeline((current) => applyRunStateToTimeline(current, event));
    }

    if (event.type === 'run.ready') {
      readyEventReceived = true;
      actions.setOptimisticUserMessage(null);
      actions.setMessages((current) => upsertMessage(current, event.userMessage));
      actions.setRecentRuns((current) => upsertRun(current, event.run));
      actions.setLiveAssistantDraft((current) =>
        current
          ? {
              ...current,
              runId: event.runId
            }
          : current
      );
      return;
    }

    if (event.type === 'run.assistant') {
      applyAssistantSnapshot(event);
      return;
    }

    if (event.type === 'run.state' || event.type === 'run.completed') {
      actions.setRecentRuns((current) => upsertRun(current, event.run));
    }

    if (event.type === 'run.failed' && event.run) {
      const failedRun = event.run;
      actions.setRecentRuns((current) => upsertRun(current, failedRun));
    }

    if (event.type === 'run.failed') {
      requiresTranscriptRecovery = true;
      terminalStreamError = event.error;
      actions.setError(event.error);
      actions.setLiveStreamRunId(null);
      actions.setPersistingTurn(false);
      actions.setChatPhase('failed');
      actions.setLiveAssistantDraft((current) => (current?.runId === event.runId ? null : current));
      return;
    }

    if (event.type === 'run.completed') {
      actions.setError(null);
      actions.setLiveStreamRunId(null);
      actions.setChatPhase(resolveSettledChatPhase);
    }
  };

  actions.setChatPhase('thinking');
  actions.setPersistingTurn(false);
  actions.setLoadingThreadId(threadId ?? operations.pendingNewThreadLoadingId);
  actions.setError(null);
  actions.setLiveStreamRunId(null);
  actions.setDraft('');
  refs.timelineRequestIdRef.current += 1;
  refs.timelineAbortControllerRef.current?.abort();
  actions.setTimelineLoading(false);
  actions.setTimelineError(null);
  refs.shouldAutoScrollRef.current = true;

  try {
    if (!threadId) {
      const nextThread = await operations.createThreadRecord();
      threadId = nextThread.id;
      actions.setActiveThreadId(threadId);
      refs.activeThreadIdRef.current = threadId;
      actions.setLoadingThreadId(threadId);
      operations.replaceCurrentPath(`/chat/${threadId}`);
    }

    actions.setOptimisticUserMessage(buildOptimisticUserMessage(threadId, requestId, text, state.messages));
    actions.setLiveAssistantDraft({
      runId: `pending-${requestId}`,
      messageId: `pending-assistant-${requestId}`,
      partialText: '',
      partialReasoning: null,
      eventType: 'start'
    });

    const streamResult = await openThreadRunStream(
      threadId,
      {
        text,
        provider: state.selectedModelOption.provider,
        model: state.selectedModelOption.model
      },
      controller.signal
    );

    if (!streamResult.ok) {
      throw new Error(streamResult.error ?? `request failed (${streamResult.status})`);
    }

    if (!streamResult.body) {
      throw new Error('stream response body is unavailable');
    }

    streamSessionStarted = true;
    const reader = streamResult.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (controller.signal.aborted || requestId !== refs.sendRequestIdRef.current) {
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseChunk(buffer);
      buffer = parsed.remainder;

      for (const event of parsed.events) {
        if (controller.signal.aborted || requestId !== refs.sendRequestIdRef.current) {
          return;
        }

        processStreamEvent(event);
      }
    }

    const finalChunk = decoder.decode();
    if (finalChunk) {
      const parsed = parseSseChunk(`${buffer}${finalChunk}\n\n`);
      for (const event of parsed.events) {
        processStreamEvent(event);
      }
    }
  } catch (sendError) {
    if (controller.signal.aborted || requestId !== refs.sendRequestIdRef.current) {
      return;
    }

    if (!readyEventReceived) {
      actions.setDraft(text);
      actions.setOptimisticUserMessage(null);
      actions.setLiveAssistantDraft(null);
    } else {
      requiresTranscriptRecovery = true;
    }
    actions.setChatPhase('failed');
    actions.setPersistingTurn(false);
    actions.setLoadingThreadId(null);
    actions.setError(sendError instanceof Error ? sendError.message : 'Failed to send message');
  } finally {
    if (requestId === refs.sendRequestIdRef.current) {
      refs.sendAbortControllerRef.current = null;
      actions.setLiveStreamRunId(null);
      actions.setChatPhase(resolveSettledChatPhase);
    }

    if (!controller.signal.aborted && requestId === refs.sendRequestIdRef.current && (streamSessionStarted || streamedRunId)) {
      if (threadId && refs.activeThreadIdRef.current === threadId) {
        const preferredRunId = streamedRunId ?? refs.selectedRunIdRef.current;
        actions.setPersistingTurn(true);
        void operations.reconcileCompletedTurn(threadId, preferredRunId, requestId, {
          recoverTranscript: requiresTranscriptRecovery
        });
      }

      void operations.refreshThreads().catch((refreshError) => {
        actions.setError(refreshError instanceof Error ? refreshError.message : 'Failed to refresh threads');
      });

      if (terminalStreamError) {
        actions.setError(terminalStreamError);
      }
    }
  }
}
