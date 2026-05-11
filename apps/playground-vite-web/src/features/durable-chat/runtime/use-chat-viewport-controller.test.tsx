import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useChatViewportController } from '@/features/durable-chat/runtime/use-chat-viewport-controller';

function ViewportHarness() {
  const [activeThreadId, setActiveThreadId] = useState<string | null>('thread-1');
  const [draft, setDraft] = useState('');
  const [liveDraftMessageId, setLiveDraftMessageId] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const {
    capturePrependAnchor,
    clearPrependAnchor,
    messagesViewportRef,
    restorePrependAnchor,
    scrollToMessagesBottom,
    textareaRef
  } = useChatViewportController({
    activeThreadId,
    draft,
    liveDraftMessageId,
    loadingMessages,
    setShowScrollToBottom
  });

  return (
    <div>
      <div ref={messagesViewportRef} data-testid="viewport" />
      <textarea ref={textareaRef} data-testid="textarea" />
      <button type="button" onClick={() => setActiveThreadId('thread-2')}>
        switch
      </button>
      <button type="button" onClick={() => setDraft('viewport draft')}>
        draft
      </button>
      <button type="button" onClick={() => setLiveDraftMessageId('assistant-1')}>
        live
      </button>
      <button type="button" onClick={() => setLoadingMessages(true)}>
        loading-on
      </button>
      <button type="button" onClick={() => setLoadingMessages(false)}>
        loading-off
      </button>
      <button type="button" onClick={capturePrependAnchor}>
        capture
      </button>
      <button type="button" onClick={restorePrependAnchor}>
        restore
      </button>
      <button type="button" onClick={clearPrependAnchor}>
        clear
      </button>
      <button type="button" onClick={scrollToMessagesBottom}>
        follow
      </button>
      <div data-testid="active-thread">{activeThreadId ?? ''}</div>
      <div data-testid="follow-state">{showScrollToBottom ? 'detached' : 'following'}</div>
    </div>
  );
}

describe('useChatViewportController', () => {
  afterEach(() => {
    cleanup();
  });

  it('scrolls to the bottom after switching to a different active thread', async () => {
    render(<ViewportHarness />);

    const viewport = screen.getByTestId('viewport');
    let scrollTop = 0;
    let scrollHeight = 1000;
    Object.defineProperty(viewport, 'clientHeight', {
      configurable: true,
      value: 200
    });
    Object.defineProperty(viewport, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight
    });
    Object.defineProperty(viewport, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      }
    });

    await waitFor(() => {
      expect(screen.getByTestId('active-thread').textContent).toBe('thread-1');
    });

    act(() => {
      scrollTop = 120;
      scrollHeight = 1400;
      fireEvent.click(screen.getByText('switch'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('active-thread').textContent).toBe('thread-2');
      expect(scrollTop).toBe(1400);
      expect(screen.getByTestId('follow-state').textContent).toBe('following');
    });
  });

  it('restores the older-message prepend anchor after the viewport grows', async () => {
    render(<ViewportHarness />);

    const viewport = screen.getByTestId('viewport');
    let scrollTop = 0;
    let scrollHeight = 1000;
    Object.defineProperty(viewport, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight
    });
    Object.defineProperty(viewport, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      }
    });

    act(() => {
      scrollTop = 320;
      fireEvent.click(screen.getByText('capture'));
    });

    act(() => {
      scrollHeight = 1400;
      fireEvent.click(screen.getByText('restore'));
    });

    await waitFor(() => {
      expect(scrollTop).toBe(720);
    });
  });

  it('clears a failed prepend anchor before the next thread switch', async () => {
    render(<ViewportHarness />);

    const viewport = screen.getByTestId('viewport');
    let scrollTop = 0;
    let scrollHeight = 1000;
    Object.defineProperty(viewport, 'clientHeight', {
      configurable: true,
      value: 200
    });
    Object.defineProperty(viewport, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight
    });
    Object.defineProperty(viewport, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      }
    });

    act(() => {
      scrollTop = 320;
      fireEvent.click(screen.getByText('capture'));
    });

    act(() => {
      scrollHeight = 1400;
      fireEvent.click(screen.getByText('clear'));
      fireEvent.click(screen.getByText('switch'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('active-thread').textContent).toBe('thread-2');
      expect(scrollTop).toBe(1400);
    });
  });
});
