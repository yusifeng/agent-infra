import type { LoadThreadMessagesResult } from '@agent-infra/durable-chat-client';
import type { RunAttachStreamEventDto, RunDto } from '@agent-infra/contracts';

import { applyAttachRunEvent } from '@/features/durable-chat/runtime/attach-run-flow';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';
import type { ChatPhase } from '@/features/durable-chat/types/runtime';

type Updater<T> = T | ((current: T) => T);
type Setter<T> = (next: Updater<T>) => void;
type RefLike<T> = { current: T };

export function isCurrentAttachLifecycleRequest(args: {
  activeThreadIdRef: RefLike<string | null>;
  attachRequestIdRef: RefLike<number>;
  attachRunIdRef: RefLike<string | null>;
  requestId: number;
  runId: string;
  threadId: string;
}) {
  return (
    args.requestId === args.attachRequestIdRef.current &&
    args.activeThreadIdRef.current === args.threadId &&
    args.attachRunIdRef.current === args.runId
  );
}

type AttachRunLifecycleArgs = {
  threadId: string;
  runId: string;
  refs: {
    activeThreadIdRef: RefLike<string | null>;
    attachAbortControllerRef: RefLike<AbortController | null>;
    attachRequestIdRef: RefLike<number>;
    attachRunIdRef: RefLike<string | null>;
    attachVersionRef: RefLike<number>;
    logOpenRef: RefLike<boolean>;
    sendRequestIdRef: RefLike<number>;
  };
  actions: {
    setActiveResponseRun: Setter<RunDto | null>;
    setChatPhase: Setter<ChatPhase>;
    setError: Setter<string | null>;
    setLiveAssistantDraft: Setter<LiveAssistantDraft | null>;
    setLiveStreamRunId: Setter<string | null>;
    setLoadingThreadId: Setter<string | null>;
    setPersistingTurn: Setter<boolean>;
    setRecentRuns: Setter<RunDto[]>;
  };
  operations: {
    loadThreadMessages: (
      threadId: string,
      options?: {
        background?: boolean;
        preferredRunId?: string | null;
        preserveExistingTimeline?: boolean;
        skipTimelineReload?: boolean;
      }
    ) => Promise<LoadThreadMessagesResult>;
    openAttachStream: (
      threadId: string,
      runId: string,
      signal: AbortSignal
    ) => Promise<{
      body: ReadableStream<Uint8Array> | null;
      error?: string | null;
      ok: boolean;
      status: number;
    }>;
    parseAttachChunk: (chunk: string) => {
      events: RunAttachStreamEventDto[];
      remainder: string;
    };
    reconcileCompletedTurn: (threadId: string, runId: string, requestId: number) => Promise<void>;
  };
};

export async function runAttachRunLifecycle({
  actions,
  operations,
  refs,
  runId,
  threadId
}: AttachRunLifecycleArgs) {
  const requestId = refs.sendRequestIdRef.current + 1;
  refs.sendRequestIdRef.current = requestId;
  refs.attachRequestIdRef.current = requestId;
  refs.attachAbortControllerRef.current?.abort();
  const controller = new AbortController();
  refs.attachAbortControllerRef.current = controller;
  refs.attachRunIdRef.current = runId;
  refs.attachVersionRef.current = 0;
  actions.setError(null);
  actions.setLiveStreamRunId(runId);
  actions.setLoadingThreadId(threadId);
  actions.setChatPhase('thinking');

  const isCurrentRequest = () =>
    isCurrentAttachLifecycleRequest({
      activeThreadIdRef: refs.activeThreadIdRef,
      attachRequestIdRef: refs.attachRequestIdRef,
      attachRunIdRef: refs.attachRunIdRef,
      requestId,
      runId,
      threadId
    });

  const applyEvent = (event: RunAttachStreamEventDto) =>
    applyAttachRunEvent({
      event,
      requestId,
      threadId,
      refs: {
        activeThreadIdRef: refs.activeThreadIdRef,
        attachRequestIdRef: refs.attachRequestIdRef,
        attachRunIdRef: refs.attachRunIdRef,
        attachVersionRef: refs.attachVersionRef,
        logOpenRef: refs.logOpenRef
      },
      actions,
      operations: {
        loadThreadMessages: operations.loadThreadMessages,
        reconcileCompletedTurn: operations.reconcileCompletedTurn
      }
    });

  try {
    const streamResult = await operations.openAttachStream(threadId, runId, controller.signal);
    if (!isCurrentRequest()) {
      return;
    }

    if (!streamResult.ok) {
      throw new Error(streamResult.error ?? `request failed (${streamResult.status})`);
    }

    if (!streamResult.body) {
      throw new Error('attach stream response body is unavailable');
    }

    const reader = streamResult.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (controller.signal.aborted || !isCurrentRequest()) {
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const parsed = operations.parseAttachChunk(buffer);
      buffer = parsed.remainder;

      for (const event of parsed.events) {
        const terminal = applyEvent(event);
        if (terminal) {
          return;
        }
      }
    }

    const finalBuffer = `${buffer}${decoder.decode()}`;
    if (finalBuffer.trim()) {
      const parsed = operations.parseAttachChunk(finalBuffer.endsWith('\n\n') ? finalBuffer : `${finalBuffer}\n\n`);
      for (const event of parsed.events) {
        const terminal = applyEvent(event);
        if (terminal) {
          return;
        }
      }
    }
  } catch (attachError) {
    if (controller.signal.aborted || !isCurrentRequest()) {
      return;
    }

    actions.setError(attachError instanceof Error ? attachError.message : 'Failed to attach to run stream');
    void operations.loadThreadMessages(threadId, {
      background: true,
      preferredRunId: runId,
      preserveExistingTimeline: refs.logOpenRef.current,
      skipTimelineReload: refs.logOpenRef.current
    });
  } finally {
    if (isCurrentRequest()) {
      refs.attachAbortControllerRef.current = null;
      refs.attachRunIdRef.current = null;
      actions.setLiveStreamRunId(null);
    }
  }
}
