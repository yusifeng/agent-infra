'use client';

import type { MessageDto } from '@agent-infra/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { fetchReplayThreadBasis } from '@/features/durable-chat/repo/replay-api';
import type { PlaygroundThreadDto } from '@/features/durable-chat/repo/chat-api';
import { buildContentNodes } from '@/features/durable-chat/service/build-content-nodes';
import { buildReplaySessionFromContentNodes } from '@/features/durable-chat/service/build-replay-steps';
import { useSearchPanelState } from '@/features/durable-chat/runtime/use-search-panel-state';
import { useReplayRuntime } from '@/features/durable-chat/runtime/use-replay-runtime';
import type { ReplaySession } from '@/features/durable-chat/types/replay';

const MOBILE_SIDEBAR_BREAKPOINT = 1024;

type ReplaySpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  nonce: number;
};

export function useReplayConsoleRuntime({ initialThreadId }: { initialThreadId: string | null }) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [threads, setThreads] = useState<PlaygroundThreadDto[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreadId);
  const [loading, setLoading] = useState(Boolean(initialThreadId));
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<ReplaySession | null>(null);
  const [sourceMessages, setSourceMessages] = useState<MessageDto[]>([]);
  const [replaySpotlightRect, setReplaySpotlightRect] = useState<ReplaySpotlightRect | null>(null);
  const requestIdRef = useRef(0);
  const replaySpotlightNonceRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const searchPanelState = useSearchPanelState(activeThreadId);
  const replayRuntime = useReplayRuntime({ session });

  useEffect(() => {
    if (window.innerWidth < MOBILE_SIDEBAR_BREAKPOINT) {
      setSidebarOpen(false);
    }
  }, []);

  useEffect(() => {
    setActiveThreadId(initialThreadId);
  }, [initialThreadId]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport || replayRuntime.viewState.inspectedReplayBlockId) {
      return;
    }

    window.requestAnimationFrame(() => {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: 'smooth'
      });
    });
  }, [replayRuntime.transcriptBlocks.length, replayRuntime.viewState.inspectedReplayBlockId]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    const inspectedReplayBlockId = replayRuntime.viewState.inspectedReplayBlockId;
    if (!viewport || !inspectedReplayBlockId) {
      setReplaySpotlightRect(null);
      return;
    }

    window.requestAnimationFrame(() => {
      const target = [...viewport.querySelectorAll<HTMLElement>('[data-replay-block-id]')]
        .find((element) => element.dataset.replayBlockId === inspectedReplayBlockId);
      if (!target) {
        setReplaySpotlightRect(null);
        return;
      }

      const viewportRect = viewport.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const top = viewport.scrollTop + targetRect.top - viewportRect.top;
      const left = viewport.scrollLeft + targetRect.left - viewportRect.left;
      replaySpotlightNonceRef.current += 1;
      setReplaySpotlightRect({
        top,
        left,
        width: targetRect.width,
        height: targetRect.height,
        nonce: replaySpotlightNonceRef.current
      });
      viewport.scrollTo({
        top: Math.max(0, top - viewport.clientHeight * 0.3),
        behavior: 'smooth'
      });
    });
  }, [replayRuntime.transcriptBlocks.length, replayRuntime.viewState.inspectedReplayBlockId]);

  useEffect(() => {
    const threadId = activeThreadId;
    if (!threadId) {
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
        if (requestIdRef.current === requestId && !controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
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
    replaySpotlightRect,
    answerContainers: replayRuntime.answerContainers,
    transcriptBlocks: replayRuntime.transcriptBlocks,
    sourceMessages,
    controlState: replayRuntime.controlState,
    viewState: replayRuntime.viewState,
    activeReplayBlockId: replayRuntime.viewState.inspectedReplayBlockId,
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
    onRestart: replayRuntime.restart
  };
}
