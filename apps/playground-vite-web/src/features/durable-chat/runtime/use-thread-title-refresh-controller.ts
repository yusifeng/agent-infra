import { useEffect, useMemo, useRef, useState } from 'react';

import type { PlaygroundThreadDto } from '@/features/durable-chat/types/thread';

const AUTO_TITLE_REFRESH_MAX_ATTEMPTS = 8;
const AUTO_TITLE_REFRESH_INTERVAL_MS = 300;
const TITLE_TYPING_INTERVAL_MS = 40;

type Updater<T> = T | ((current: T) => T);
type Setter<T> = (next: Updater<T>) => void;

type TypingTitleState = {
  threadId: string;
  finalText: string;
  visibleText: string;
};

type ThreadTitleUpdate = {
  threadId: string;
  title: string;
  updatedAt: string;
};

export function useThreadTitleRefreshController({
  activeThreadId,
  currentThreadTitle,
  displayedThreads,
  fetchThreadById,
  isDefaultTitle,
  setThreads
}: {
  activeThreadId: string | null;
  currentThreadTitle: string;
  displayedThreads: PlaygroundThreadDto[];
  fetchThreadById: (threadId: string, signal: AbortSignal) => Promise<{ ok: boolean; data: { thread?: PlaygroundThreadDto } } | null>;
  isDefaultTitle: (title: string | null | undefined) => boolean;
  setThreads: Setter<PlaygroundThreadDto[]>;
}) {
  const [typingTitleState, setTypingTitleState] = useState<TypingTitleState | null>(null);
  const activeThreadIdRef = useRef(activeThreadId);
  const threadsRef = useRef(displayedThreads);
  const typingTitleStateRef = useRef<TypingTitleState | null>(null);
  const autoTitleRefreshRequestIdRef = useRef(0);
  const autoTitleRefreshAbortControllerRef = useRef<AbortController | null>(null);
  const titleTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    threadsRef.current = displayedThreads;
  }, [displayedThreads]);

  useEffect(() => {
    typingTitleStateRef.current = typingTitleState;
  }, [typingTitleState]);

  useEffect(() => {
    if (!typingTitleState || activeThreadId === typingTitleState.threadId) {
      return;
    }

    if (titleTypingTimeoutRef.current !== null) {
      clearTimeout(titleTypingTimeoutRef.current);
      titleTypingTimeoutRef.current = null;
    }
    setTypingTitleState(null);
  }, [activeThreadId, typingTitleState]);

  useEffect(() => {
    return () => {
      autoTitleRefreshAbortControllerRef.current?.abort();
      if (titleTypingTimeoutRef.current !== null) {
        clearTimeout(titleTypingTimeoutRef.current);
      }
    };
  }, []);

  function patchThread(nextThread: PlaygroundThreadDto) {
    setThreads((current) => current.map((thread) => (thread.id === nextThread.id ? nextThread : thread)));
  }

  function replaceTypingTitleState(nextState: TypingTitleState | null) {
    typingTitleStateRef.current = nextState;
    setTypingTitleState(nextState);
  }

  function stopTypingTitleAnimation() {
    if (titleTypingTimeoutRef.current !== null) {
      clearTimeout(titleTypingTimeoutRef.current);
      titleTypingTimeoutRef.current = null;
    }
    replaceTypingTitleState(null);
  }

  function applyThreadTitleUpdate(update: ThreadTitleUpdate) {
    autoTitleRefreshRequestIdRef.current += 1;
    autoTitleRefreshAbortControllerRef.current?.abort();

    const previousThread = threadsRef.current.find((thread) => thread.id === update.threadId) ?? null;
    if (!previousThread) {
      return;
    }

    const nextThread = {
      ...previousThread,
      title: update.title,
      updatedAt: update.updatedAt
    };
    patchThread(nextThread);

    if (
      isDefaultTitle(previousThread.title) &&
      !isDefaultTitle(update.title) &&
      activeThreadIdRef.current === update.threadId
    ) {
      startTypingTitleAnimation(update.threadId, update.title);
      return;
    }

    if (typingTitleStateRef.current?.threadId === update.threadId) {
      stopTypingTitleAnimation();
    }
  }

  function startTypingTitleAnimation(threadId: string, finalText: string) {
    const characters = Array.from(finalText);
    if (characters.length === 0) {
      stopTypingTitleAnimation();
      return;
    }

    stopTypingTitleAnimation();

    let visibleLength = 1;
    replaceTypingTitleState({
      threadId,
      finalText,
      visibleText: characters.slice(0, visibleLength).join('')
    });

    const step = () => {
      if (activeThreadIdRef.current !== threadId) {
        stopTypingTitleAnimation();
        return;
      }

      visibleLength += 1;
      if (visibleLength >= characters.length) {
        stopTypingTitleAnimation();
        return;
      }

      replaceTypingTitleState({
        threadId,
        finalText,
        visibleText: characters.slice(0, visibleLength).join('')
      });
      titleTypingTimeoutRef.current = setTimeout(step, TITLE_TYPING_INTERVAL_MS);
    };

    titleTypingTimeoutRef.current = setTimeout(step, TITLE_TYPING_INTERVAL_MS);
  }

  async function refreshThreadAfterCompletedRun(threadId: string) {
    const requestId = ++autoTitleRefreshRequestIdRef.current;
    autoTitleRefreshAbortControllerRef.current?.abort();

    for (let attempt = 0; attempt < AUTO_TITLE_REFRESH_MAX_ATTEMPTS; attempt += 1) {
      if (requestId !== autoTitleRefreshRequestIdRef.current) {
        return;
      }

      const controller = new AbortController();
      autoTitleRefreshAbortControllerRef.current = controller;

      const previousThread = threadsRef.current.find((thread) => thread.id === threadId) ?? null;
      const wasDefaultTitle = isDefaultTitle(previousThread?.title);

      const result = await fetchThreadById(threadId, controller.signal).catch(() => null);
      if (requestId !== autoTitleRefreshRequestIdRef.current) {
        return;
      }

      const nextThread = result?.ok ? result.data.thread ?? null : null;
      if (nextThread) {
        const currentLocalThread = threadsRef.current.find((thread) => thread.id === threadId) ?? null;
        const stillDefaultLocally = isDefaultTitle(currentLocalThread?.title);
        const hasGeneratedTitle = !isDefaultTitle(nextThread.title);
        if (stillDefaultLocally || !hasGeneratedTitle) {
          patchThread(nextThread);
        }

        if (hasGeneratedTitle) {
          if (wasDefaultTitle && stillDefaultLocally && activeThreadIdRef.current === threadId && nextThread.title) {
            startTypingTitleAnimation(threadId, nextThread.title);
          }
          return;
        }
      }

      if (attempt === AUTO_TITLE_REFRESH_MAX_ATTEMPTS - 1) {
        return;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, AUTO_TITLE_REFRESH_INTERVAL_MS);
      });
    }
  }

  const currentVisibleThreadTitle =
    typingTitleState?.threadId === activeThreadId ? typingTitleState.visibleText : currentThreadTitle;
  const visibleThreads = useMemo(() => {
    if (!typingTitleState || activeThreadId !== typingTitleState.threadId) {
      return displayedThreads;
    }

    return displayedThreads.map((thread) =>
      thread.id === typingTitleState.threadId ? { ...thread, title: typingTitleState.visibleText } : thread
    );
  }, [activeThreadId, displayedThreads, typingTitleState]);

  return {
    applyThreadTitleUpdate,
    currentVisibleThreadTitle,
    refreshThreadAfterCompletedRun,
    stopTypingTitleAnimation,
    typingTitleThreadId: typingTitleState?.threadId ?? null,
    visibleThreads
  };
}
