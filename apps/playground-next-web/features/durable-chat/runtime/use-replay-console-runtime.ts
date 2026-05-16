'use client';

import type { MessageDto } from '@agent-infra/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { fetchReplayThreadBasis } from '@/features/durable-chat/repo/replay-api';
import type { PlaygroundThreadDto } from '@/features/durable-chat/repo/chat-api';
import { buildContentNodes } from '@/features/durable-chat/service/build-content-nodes';
import { buildReplaySessionFromContentNodes } from '@/features/durable-chat/service/build-replay-steps';
import {
  resolveChatViewportModeFromPosition,
  shouldAutoFollowViewport,
  type ChatViewportMode
} from '@/features/durable-chat/service/chat-viewport-state';
import {
  getChatViewportMetrics,
  selectionIntersectsChatViewport
} from '@/features/durable-chat/runtime/chat-viewport-dom';
import { useSearchPanelState } from '@/features/durable-chat/runtime/use-search-panel-state';
import { useReplayRuntime } from '@/features/durable-chat/runtime/use-replay-runtime';
import type { ReplaySession } from '@/features/durable-chat/types/replay';

const MOBILE_SIDEBAR_BREAKPOINT = 1024;
const REPLAY_INSPECT_SCROLL_IDLE_FRAMES = 3;
const REPLAY_INSPECT_SCROLL_MAX_WAIT_MS = 700;

function waitForScrollIdle(
  element: HTMLElement,
  onIdle: () => void
) {
  let frameId: number | null = null;
  let cancelled = false;
  let stableFrameCount = 0;
  let previousScrollTop = element.scrollTop;
  const startedAt = performance.now();

  function tick(now: number) {
    if (cancelled) {
      return;
    }

    const currentScrollTop = element.scrollTop;
    if (Math.abs(currentScrollTop - previousScrollTop) < 0.5) {
      stableFrameCount += 1;
    } else {
      stableFrameCount = 0;
      previousScrollTop = currentScrollTop;
    }

    if (stableFrameCount >= REPLAY_INSPECT_SCROLL_IDLE_FRAMES || now - startedAt >= REPLAY_INSPECT_SCROLL_MAX_WAIT_MS) {
      onIdle();
      return;
    }

    frameId = window.requestAnimationFrame(tick);
  }

  frameId = window.requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
    }
  };
}

export function useReplayConsoleRuntime({ initialThreadId }: { initialThreadId: string | null }) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [threads, setThreads] = useState<PlaygroundThreadDto[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadId);
  const [loading, setLoading] = useState(Boolean(initialThreadId));
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<ReplaySession | null>(null);
  const [sourceMessages, setSourceMessages] = useState<MessageDto[]>([]);
  const [flashingReplayBlockId, setFlashingReplayBlockId] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const pendingBottomScrollFrameRef = useRef<number | null>(null);
  const viewportModeRef = useRef<ChatViewportMode>('following');
  const searchPanelState = useSearchPanelState(activeThreadId);
  const replayRuntime = useReplayRuntime({ session });

  function syncViewportModeFromPosition(viewport: HTMLDivElement) {
    viewportModeRef.current = resolveChatViewportModeFromPosition(getChatViewportMetrics(viewport));
  }

  function lockAutoFollowForSelection() {
    if (pendingBottomScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingBottomScrollFrameRef.current);
      pendingBottomScrollFrameRef.current = null;
    }
    viewportModeRef.current = 'selecting';
  }

  useEffect(() => {
    if (window.innerWidth < MOBILE_SIDEBAR_BREAKPOINT) {
      setSidebarOpen(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pendingBottomScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingBottomScrollFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setActiveThreadId(initialThreadId);
  }, [initialThreadId]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    const handleScroll = () => {
      if (selectionIntersectsChatViewport(viewport)) {
        lockAutoFollowForSelection();
        return;
      }

      syncViewportModeFromPosition(viewport);
    };

    handleScroll();
    viewport.addEventListener('scroll', handleScroll);
    return () => {
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    const handleSelectStart = () => {
      lockAutoFollowForSelection();
    };

    const handleSelectionChange = () => {
      if (selectionIntersectsChatViewport(viewport)) {
        lockAutoFollowForSelection();
        return;
      }

      if (viewportModeRef.current === 'selecting') {
        syncViewportModeFromPosition(viewport);
      }
    };

    viewport.addEventListener('selectstart', handleSelectStart);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('pointerup', handleSelectionChange);
    document.addEventListener('mouseup', handleSelectionChange);
    return () => {
      viewport.removeEventListener('selectstart', handleSelectStart);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('pointerup', handleSelectionChange);
      document.removeEventListener('mouseup', handleSelectionChange);
    };
  }, []);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport || replayRuntime.viewState.inspectedReplayBlockId) {
      return;
    }

    if (selectionIntersectsChatViewport(viewport)) {
      lockAutoFollowForSelection();
      return;
    }

    if (!shouldAutoFollowViewport(viewportModeRef.current)) {
      return;
    }

    if (pendingBottomScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingBottomScrollFrameRef.current);
    }

    pendingBottomScrollFrameRef.current = window.requestAnimationFrame(() => {
      pendingBottomScrollFrameRef.current = null;
      if (!shouldAutoFollowViewport(viewportModeRef.current) || selectionIntersectsChatViewport(viewport)) {
        return;
      }

      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: 'auto'
      });
    });

    return () => {
      if (pendingBottomScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingBottomScrollFrameRef.current);
        pendingBottomScrollFrameRef.current = null;
      }
    };
  }, [replayRuntime.transcriptBlocks.length, replayRuntime.viewState.inspectedReplayBlockId]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    const inspectedReplayBlockId = replayRuntime.viewState.inspectedReplayBlockId;
    if (!viewport || !inspectedReplayBlockId) {
      setFlashingReplayBlockId(null);
      return;
    }

    setFlashingReplayBlockId(null);

    let cancelWaitForScrollIdle: (() => void) | null = null;
    const frameId = window.requestAnimationFrame(() => {
      const target = [...viewport.querySelectorAll<HTMLElement>('[data-replay-block-id]')]
        .find((element) => element.dataset.replayBlockId === inspectedReplayBlockId);
      if (!target) {
        setFlashingReplayBlockId(null);
        return;
      }

      const viewportRect = viewport.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const top = viewport.scrollTop + targetRect.top - viewportRect.top;
      viewport.scrollTo({
        top: Math.max(0, top - viewport.clientHeight * 0.3),
        behavior: 'smooth'
      });

      cancelWaitForScrollIdle = waitForScrollIdle(viewport, () => {
        setFlashingReplayBlockId(inspectedReplayBlockId);
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (cancelWaitForScrollIdle !== null) {
        cancelWaitForScrollIdle();
      }
    };
  }, [
    replayRuntime.inspectRequestId,
    replayRuntime.transcriptBlocks.length,
    replayRuntime.viewState.inspectedReplayBlockId
  ]);

  useEffect(() => {
    const threadId = activeThreadId;
    if (!threadId) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      viewportModeRef.current = 'following';
      setLoading(false);
      setSession(null);
      setSourceMessages([]);
      setError(null);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    viewportModeRef.current = 'following';
    setLoading(true);
    setError(null);

    void fetchReplayThreadBasis(threadId, controller.signal)
      .then((result) => {
        if (requestIdRef.current !== requestId || controller.signal.aborted) {
          return;
        }

        if (!result.ok || !result.data) {
          setSession(null);
          setSourceMessages([]);
          setError(result.error ?? `Failed to load replay thread (${result.status})`);
          return;
        }

        const messages = result.data.messages ?? [];
        const contentNodes = buildContentNodes(messages);
        const replayThreadId = messages[0]?.threadId ?? threadId;
        setThreads(result.data.threads);
        setSourceMessages(messages);
        setSession(buildReplaySessionFromContentNodes(contentNodes, replayThreadId));
      })
      .catch((nextError) => {
        if (requestIdRef.current !== requestId || controller.signal.aborted) {
          return;
        }

        setSession(null);
        setSourceMessages([]);
        setError(nextError instanceof Error ? nextError.message : 'Failed to load replay thread.');
      })
      .finally(() => {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }

        if (requestIdRef.current === requestId && !controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    };
  }, [activeThreadId]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const currentThreadTitle = useMemo(() => {
    const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;
    return activeThread?.title?.trim() || activeThreadId || 'Replay';
  }, [activeThreadId, threads]);

  return {
    sidebarOpen,
    threads,
    activeThreadId,
    currentThreadTitle,
    loading,
    error,
    messagesViewportRef,
    answerContainers: replayRuntime.answerContainers,
    transcriptBlocks: replayRuntime.transcriptBlocks,
    sourceMessages,
    controlState: replayRuntime.controlState,
    viewState: replayRuntime.viewState,
    activeReplayBlockId: flashingReplayBlockId,
    activeSearchResult: searchPanelState.activeSearchResult,
    searchPanelError: searchPanelState.searchPanelError,
    searchPanelLoading: searchPanelState.searchPanelLoading,
    searchPanelOpen: searchPanelState.searchPanelOpen,
    onOpenSidebar: () => setSidebarOpen(true),
    onCloseSidebar: () => setSidebarOpen(false),
    onOpenThread: (threadId: string) => {
      router.push(`/replay/${encodeURIComponent(threadId)}`);
    },
    onNewChat: () => {
      router.push('/new');
    },
    onOpenSearchResult: searchPanelState.onOpenSearchResult,
    onCloseSearchPanel: searchPanelState.onCloseSearchPanel,
    onTogglePlayback: replayRuntime.togglePlayback,
    onPreviousStep: replayRuntime.previousStep,
    onNextStep: replayRuntime.nextStep,
    onInspectStep: replayRuntime.inspectStep,
    onFinishReplay: replayRuntime.finishReplay,
    onRestart: replayRuntime.restart
  };
}
