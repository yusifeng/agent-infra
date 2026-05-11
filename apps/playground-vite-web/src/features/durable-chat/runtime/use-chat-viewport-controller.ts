import { useEffect, useLayoutEffect, useRef } from 'react';

type Updater<T> = T | ((current: T) => T);
type Setter<T> = (next: Updater<T>) => void;

type PendingPrependAnchor = {
  scrollHeight: number;
  scrollTop: number;
};

export function useChatViewportController({
  activeThreadId,
  draft,
  liveDraftMessageId,
  loadingMessages,
  setShowScrollToBottom
}: {
  activeThreadId: string | null;
  draft: string;
  liveDraftMessageId: string | null;
  loadingMessages: boolean;
  setShowScrollToBottom: Setter<boolean>;
}) {
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const pendingPrependAnchorRef = useRef<PendingPrependAnchor | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
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
    if (!viewport || loadingMessages) {
      return;
    }

    window.requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
      setShowScrollToBottom(false);
    });
  }, [activeThreadId, loadingMessages, setShowScrollToBottom]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport || !liveDraftMessageId) {
      return;
    }

    window.requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
      setShowScrollToBottom(false);
    });
  }, [liveDraftMessageId, setShowScrollToBottom]);

  function capturePrependAnchor() {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return false;
    }

    pendingPrependAnchorRef.current = {
      scrollHeight: viewport.scrollHeight,
      scrollTop: viewport.scrollTop
    };
    shouldAutoScrollRef.current = false;
    return true;
  }

  function clearPrependAnchor() {
    pendingPrependAnchorRef.current = null;
  }

  function restorePrependAnchor() {
    const viewport = messagesViewportRef.current;
    const pendingAnchor = pendingPrependAnchorRef.current;
    if (!viewport || !pendingAnchor) {
      return;
    }

    pendingPrependAnchorRef.current = null;
    window.requestAnimationFrame(() => {
      const heightDelta = viewport.scrollHeight - pendingAnchor.scrollHeight;
      viewport.scrollTop = pendingAnchor.scrollTop + heightDelta;
    });
  }

  function scrollToMessagesBottom() {
    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    shouldAutoScrollRef.current = true;
    setShowScrollToBottom(false);
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: 'smooth'
    });
  }

  return {
    capturePrependAnchor,
    clearPrependAnchor,
    messagesViewportRef,
    restorePrependAnchor,
    scrollToMessagesBottom,
    shouldAutoScrollRef,
    textareaRef
  };
}
