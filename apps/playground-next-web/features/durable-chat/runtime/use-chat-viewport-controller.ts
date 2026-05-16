'use client';

import type { MessageDto } from '@agent-infra/contracts';
import type { LiveAssistantDraft } from '@agent-infra/durable-chat-client';
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import {
  getUserInitiatedScrollBehavior,
  isChatViewportNearBottom,
  resolveChatViewportModeFromPosition,
  shouldAutoFollowViewport,
  type ChatViewportMetrics,
  type ChatViewportMode
} from '@/features/durable-chat/service/chat-viewport-state';

type ChatViewportControllerOptions = {
  activeThreadId: string | null;
  draft: string;
  historyLoading: boolean;
  liveAssistantDraft: LiveAssistantDraft | null;
  loadingMessages: boolean;
  messages: MessageDto[];
  setShowScrollToBottom: Dispatch<SetStateAction<boolean>>;
};

export function useChatViewportController({
  activeThreadId,
  draft,
  historyLoading,
  liveAssistantDraft,
  loadingMessages,
  messages,
  setShowScrollToBottom
}: ChatViewportControllerOptions) {
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const lastActiveThreadIdRef = useRef<string | null>(null);
  const pendingPrependAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const pendingScrollFrameRef = useRef<number | null>(null);
  const pendingScrollTimeoutRefs = useRef<number[]>([]);
  const pendingThreadBottomScrollRef = useRef(false);
  const forceFollowingUntilRef = useRef(0);
  const viewportModeRef = useRef<ChatViewportMode>('following');
  const shouldAutoScrollRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function getViewportMetrics(viewport: HTMLDivElement): ChatViewportMetrics {
    return {
      scrollHeight: viewport.scrollHeight,
      scrollTop: viewport.scrollTop,
      clientHeight: viewport.clientHeight
    };
  }

  function syncViewportModeFromPosition(viewport: HTMLDivElement) {
    const mode = resolveChatViewportModeFromPosition(getViewportMetrics(viewport));
    viewportModeRef.current = mode;
    shouldAutoScrollRef.current = shouldAutoFollowViewport(mode);
    setShowScrollToBottom(!isChatViewportNearBottom(getViewportMetrics(viewport)));
  }

  function selectionIntersectsViewport(viewport: HTMLDivElement) {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return false;
    }

    for (let index = 0; index < selection.rangeCount; index += 1) {
      const range = selection.getRangeAt(index);
      try {
        if (range.intersectsNode(viewport)) {
          return true;
        }
      } catch {
        // Detached selection ranges can throw in some browsers while DOM updates.
      }
    }

    return false;
  }

  function lockAutoFollowForSelection() {
    if (pendingScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingScrollFrameRef.current);
      pendingScrollFrameRef.current = null;
    }
    for (const timeoutId of pendingScrollTimeoutRefs.current) {
      window.clearTimeout(timeoutId);
    }
    pendingScrollTimeoutRefs.current = [];
    viewportModeRef.current = 'selecting';
    shouldAutoScrollRef.current = false;
  }

  function scrollToBottomIfFollowing(viewport: HTMLDivElement, behavior: ScrollBehavior) {
    if (!shouldAutoFollowViewport(viewportModeRef.current) || selectionIntersectsViewport(viewport)) {
      return;
    }

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior
    });
  }

  function scheduleScrollToBottom(viewport: HTMLDivElement, behavior: ScrollBehavior, includeFollowUpCorrections = false) {
    if (pendingScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingScrollFrameRef.current);
    }
    for (const timeoutId of pendingScrollTimeoutRefs.current) {
      window.clearTimeout(timeoutId);
    }
    pendingScrollTimeoutRefs.current = [];

    pendingScrollFrameRef.current = window.requestAnimationFrame(() => {
      pendingScrollFrameRef.current = null;
      scrollToBottomIfFollowing(viewport, behavior);
    });

    if (includeFollowUpCorrections) {
      pendingScrollTimeoutRefs.current = [80, 240, 720].map((delay) =>
        window.setTimeout(() => {
          scrollToBottomIfFollowing(viewport, 'auto');
        }, delay)
      );
    }
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [draft]);

  useEffect(() => {
    return () => {
      if (pendingScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingScrollFrameRef.current);
      }
      for (const timeoutId of pendingScrollTimeoutRefs.current) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport || typeof ResizeObserver === 'undefined') {
      return;
    }

    const handleContentResize = () => {
      if (shouldAutoFollowViewport(viewportModeRef.current) && !selectionIntersectsViewport(viewport)) {
        scheduleScrollToBottom(viewport, 'auto');
      }
    };
    const resizeObserver = new ResizeObserver(handleContentResize);
    const observeViewportChildren = () => {
      resizeObserver.disconnect();
      resizeObserver.observe(viewport);
      for (const child of viewport.children) {
        resizeObserver.observe(child);
      }
    };
    const mutationObserver = new MutationObserver(observeViewportChildren);

    observeViewportChildren();
    mutationObserver.observe(viewport, { childList: true });
    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    const handleScroll = () => {
      if (selectionIntersectsViewport(viewport)) {
        lockAutoFollowForSelection();
        return;
      }

      if (Date.now() < forceFollowingUntilRef.current) {
        viewportModeRef.current = 'following';
        shouldAutoScrollRef.current = true;
        setShowScrollToBottom(false);
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
      if (selectionIntersectsViewport(viewport)) {
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

  useLayoutEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    if (lastActiveThreadIdRef.current !== activeThreadId) {
      lastActiveThreadIdRef.current = activeThreadId;
      if (activeThreadId) {
        pendingThreadBottomScrollRef.current = true;
        viewportModeRef.current = 'following';
        shouldAutoScrollRef.current = true;
      }
    }

    const pendingAnchor = pendingPrependAnchorRef.current;
    if (pendingAnchor) {
      viewportModeRef.current = 'prepending';
      pendingPrependAnchorRef.current = null;
      const heightDelta = viewport.scrollHeight - pendingAnchor.scrollHeight;
      viewport.scrollTop = pendingAnchor.scrollTop + heightDelta;
      viewportModeRef.current = 'detached';
      shouldAutoScrollRef.current = false;
      setShowScrollToBottom(true);
      return;
    }

    const hasActiveThreadMessages = Boolean(activeThreadId && messages.some((message) => message.threadId === activeThreadId));
    const consumedThreadBottomScroll = pendingThreadBottomScrollRef.current && !loadingMessages && hasActiveThreadMessages;
    if (consumedThreadBottomScroll) {
      pendingThreadBottomScrollRef.current = false;
      forceFollowingUntilRef.current = Date.now() + 1000;
      viewportModeRef.current = 'following';
      shouldAutoScrollRef.current = true;
    }

    if (!consumedThreadBottomScroll && (viewportModeRef.current === 'selecting' || selectionIntersectsViewport(viewport))) {
      lockAutoFollowForSelection();
      return;
    }

    if (shouldAutoScrollRef.current && viewportModeRef.current !== 'prepending') {
      viewportModeRef.current = 'following';
    }

    if (!shouldAutoFollowViewport(viewportModeRef.current)) {
      return;
    }

    scheduleScrollToBottom(viewport, 'auto', consumedThreadBottomScroll);
  }, [messages, liveAssistantDraft?.partialText, liveAssistantDraft?.partialReasoning, activeThreadId, loadingMessages, historyLoading]);

  function scrollToMessagesBottom() {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    shouldAutoScrollRef.current = true;
    forceFollowingUntilRef.current = 0;
    pendingThreadBottomScrollRef.current = false;
    viewportModeRef.current = 'following';
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: getUserInitiatedScrollBehavior(prefersReducedMotion())
    });
  }

  return {
    messagesViewportRef,
    pendingPrependAnchorRef,
    scrollToMessagesBottom,
    shouldAutoScrollRef,
    textareaRef
  };
}
