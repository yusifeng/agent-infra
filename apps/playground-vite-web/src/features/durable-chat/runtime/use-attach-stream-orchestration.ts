import type { RunAttachStreamEventDto, RunDto } from '@agent-infra/contracts';
import {
  applyRunAssistantEventToLiveDraft,
  liveDraftFromRunSnapshot,
  resolveAssistantStreamChatPhase,
  resolveSettledChatPhase,
  upsertRun
} from '@agent-infra/durable-chat-client';
import { useEffect, useRef } from 'react';

import { openRunAttachStream } from '@/features/durable-chat/repo/chat-api';
import { startRestoredLiveDraftRefreshLoop } from '@/features/durable-chat/runtime/live-draft-persistence';
import { parsePlaygroundSseChunk } from '@/features/durable-chat/schema/playground-stream';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';
import type { ChatPhase } from '@/features/durable-chat/types/runtime';

type Updater<T> = T | ((current: T) => T);
type Setter<T> = (next: Updater<T>) => void;

type UseAttachStreamOrchestrationArgs = {
  activeThreadId: string | null;
  activeResponseRun: RunDto | null;
  hasHydratedActiveThread: boolean;
  liveStreamRunId: string | null;
  setActiveResponseRun: Setter<RunDto | null>;
  setChatPhase: Setter<ChatPhase>;
  setError: Setter<string | null>;
  setLiveAssistantDraft: Setter<LiveAssistantDraft | null>;
  setPersistingTurn: Setter<boolean>;
  setRecentRuns: Setter<RunDto[]>;
  loadThreadMessages: (
    threadId: string,
    options?: {
      preferredRunId?: string | null;
      background?: boolean;
      skipTimelineReload?: boolean;
      preserveExistingTimeline?: boolean;
    }
  ) => Promise<unknown>;
};

function isActiveStreamingRun(run: RunDto | null): run is RunDto {
  return run?.status === 'queued' || run?.status === 'running';
}

function shouldAttachToRun(args: {
  activeThreadId: string | null;
  activeResponseRun: RunDto | null;
  hasHydratedActiveThread: boolean;
  liveStreamRunId: string | null;
}) {
  const { activeThreadId, activeResponseRun, hasHydratedActiveThread, liveStreamRunId } = args;
  const run = activeResponseRun;
  if (!activeThreadId || !hasHydratedActiveThread || !isActiveStreamingRun(run)) {
    return false;
  }

  if (run.threadId !== activeThreadId) {
    return false;
  }

  return liveStreamRunId !== run.id;
}

export function resolveAttachSnapshotChatPhase(
  event: Extract<RunAttachStreamEventDto, { type: 'run.snapshot' }>
): Extract<ChatPhase, 'thinking' | 'streaming'> {
  return !event.assistant || event.assistant.eventType === 'thinking' ? 'thinking' : 'streaming';
}

export function useAttachStreamOrchestration(args: UseAttachStreamOrchestrationArgs) {
  const {
    activeThreadId,
    activeResponseRun,
    hasHydratedActiveThread,
    liveStreamRunId,
    setActiveResponseRun,
    setChatPhase,
    setError,
    setLiveAssistantDraft,
    setPersistingTurn,
    setRecentRuns,
    loadThreadMessages
  } = args;
  const activeThreadIdRef = useRef(activeThreadId);
  const attachRequestIdRef = useRef(0);
  const loadThreadMessagesRef = useRef(loadThreadMessages);
  const activeRunId = activeResponseRun?.id ?? null;
  const activeRunThreadId = activeResponseRun?.threadId ?? null;
  const activeRunStatus = activeResponseRun?.status ?? null;

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    loadThreadMessagesRef.current = loadThreadMessages;
  }, [loadThreadMessages]);

  useEffect(() => {
    if (
      !shouldAttachToRun({
        activeThreadId,
        activeResponseRun,
        hasHydratedActiveThread,
        liveStreamRunId
      })
    ) {
      return;
    }

    const threadId = activeThreadId!;
    const runId = activeResponseRun!.id;
    const controller = new AbortController();
    const requestId = attachRequestIdRef.current + 1;
    attachRequestIdRef.current = requestId;
    let currentVersion = -1;
    let stopFallbackRefresh: (() => void) | null = null;
    let terminalReceived = false;

    const isCurrentAttach = () =>
      !controller.signal.aborted &&
      requestId === attachRequestIdRef.current &&
      activeThreadIdRef.current === threadId;

    const refreshDurableMessages = async () => {
      if (!isCurrentAttach()) {
        return;
      }

      await loadThreadMessagesRef.current(threadId, {
        preferredRunId: runId,
        background: true,
        skipTimelineReload: true,
        preserveExistingTimeline: true
      });
    };

    const startFallbackRefresh = () => {
      if (stopFallbackRefresh !== null || !isCurrentAttach()) {
        return;
      }

      stopFallbackRefresh = startRestoredLiveDraftRefreshLoop({
        refresh: refreshDurableMessages
      });
    };

    const applyTerminalEvent = (event: Extract<RunAttachStreamEventDto, { type: 'run.completed' | 'run.failed' }>) => {
      if (event.version <= currentVersion || !isCurrentAttach()) {
        return;
      }

      currentVersion = event.version;
      terminalReceived = true;
      setRecentRuns((current) => (event.run ? upsertRun(current, event.run) : current));
      setActiveResponseRun(null);
      setLiveAssistantDraft((current) => (current?.runId === event.runId ? null : current));
      setPersistingTurn(false);
      if (event.type === 'run.failed') {
        setError(event.error);
        setChatPhase('failed');
      } else {
        setError(null);
        setChatPhase(resolveSettledChatPhase);
      }
      void refreshDurableMessages();
    };

    const processEvent = (event: RunAttachStreamEventDto) => {
      if (event.runId !== runId || !isCurrentAttach()) {
        return;
      }

      if (event.type === 'run.attach_unavailable') {
        startFallbackRefresh();
        return;
      }

      if (event.version <= currentVersion) {
        return;
      }

      if (event.type === 'run.snapshot') {
        currentVersion = event.version;
        setActiveResponseRun(isActiveStreamingRun(event.run) ? event.run : null);
        setRecentRuns((current) => upsertRun(current, event.run));
        setLiveAssistantDraft(liveDraftFromRunSnapshot(event));
        setChatPhase(resolveAttachSnapshotChatPhase(event));
        return;
      }

      if (event.type === 'run.assistant') {
        currentVersion = event.version;
        setChatPhase(resolveAssistantStreamChatPhase(event));
        setLiveAssistantDraft((current) => applyRunAssistantEventToLiveDraft(current, event));
        return;
      }

      if (event.type === 'run.state') {
        currentVersion = event.version;
        setRecentRuns((current) => upsertRun(current, event.run));
        setActiveResponseRun(isActiveStreamingRun(event.run) ? event.run : null);
        return;
      }

      applyTerminalEvent(event);
    };

    const attach = async () => {
      try {
        const streamResult = await openRunAttachStream(threadId, runId, controller.signal);
        if (!isCurrentAttach()) {
          return;
        }

        if (!streamResult.ok || !streamResult.body) {
          startFallbackRefresh();
          return;
        }

        const reader = streamResult.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (!isCurrentAttach()) {
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const parsed = parsePlaygroundSseChunk(buffer);
          buffer = parsed.remainder;
          for (const event of parsed.events) {
            processEvent(event as RunAttachStreamEventDto);
          }
        }

        const finalBuffer = `${buffer}${decoder.decode()}`;
        if (finalBuffer && isCurrentAttach()) {
          const parsed = parsePlaygroundSseChunk(`${finalBuffer}\n\n`);
          for (const event of parsed.events) {
            processEvent(event as RunAttachStreamEventDto);
          }
        }

        if (!terminalReceived) {
          startFallbackRefresh();
        }
      } catch {
        if (!controller.signal.aborted && isCurrentAttach()) {
          startFallbackRefresh();
        }
      }
    };

    void attach();

    return () => {
      controller.abort();
      stopFallbackRefresh?.();
    };
  }, [
    activeRunId,
    activeRunStatus,
    activeRunThreadId,
    activeThreadId,
    hasHydratedActiveThread,
    liveStreamRunId
  ]);
}
