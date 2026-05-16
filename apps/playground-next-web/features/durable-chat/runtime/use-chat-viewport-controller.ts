'use client';

import type { MessageDto } from '@agent-infra/contracts';
import type { LiveAssistantDraft } from '@agent-infra/durable-chat-client';
import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';

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
  const pendingPrependAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [draft]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    const handleScroll = () => {
      const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      const nearBottom = distance < 140;
      shouldAutoScrollRef.current = nearBottom;
      setShowScrollToBottom(!nearBottom);
    };

    handleScroll();
    viewport.addEventListener('scroll', handleScroll);
    return () => {
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, [setShowScrollToBottom]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    const pendingAnchor = pendingPrependAnchorRef.current;
    if (pendingAnchor) {
      pendingPrependAnchorRef.current = null;
      window.requestAnimationFrame(() => {
        const heightDelta = viewport.scrollHeight - pendingAnchor.scrollHeight;
        viewport.scrollTop = pendingAnchor.scrollTop + heightDelta;
      });
      return;
    }

    if (!shouldAutoScrollRef.current) {
      return;
    }

    window.requestAnimationFrame(() => {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: messages.length > 0 ? 'smooth' : 'auto'
      });
    });
  }, [messages, liveAssistantDraft?.partialText, liveAssistantDraft?.partialReasoning, activeThreadId, loadingMessages, historyLoading]);

  function scrollToMessagesBottom() {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    shouldAutoScrollRef.current = true;
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: 'smooth'
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
