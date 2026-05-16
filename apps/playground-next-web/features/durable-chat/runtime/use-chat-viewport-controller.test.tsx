// @vitest-environment jsdom

import type { MessageDto } from '@agent-infra/contracts';
import type { LiveAssistantDraft } from '@agent-infra/durable-chat-client';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatViewportController } from './use-chat-viewport-controller';

type ViewportController = ReturnType<typeof useChatViewportController>;

type Metrics = {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
};

type HarnessProps = {
  activeThreadId: string | null;
  historyLoading?: boolean;
  liveAssistantDraft?: LiveAssistantDraft | null;
  loadingMessages?: boolean;
  messages?: MessageDto[];
  metrics: Metrics;
  onController: (controller: ViewportController) => void;
  scrollTo: ReturnType<typeof vi.fn>;
};

function createMessage(id: string, threadId = 'thread-1'): MessageDto {
  return {
    id,
    threadId,
    runId: null,
    role: 'assistant',
    seq: 1,
    status: 'completed',
    metadata: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    parts: []
  };
}

function createLiveDraft(partialText: string): LiveAssistantDraft {
  return {
    runId: 'run-1',
    messageId: 'assistant-live',
    source: 'live',
    committedText: '',
    partialText,
    segmentText: partialText,
    segmentTextMessageId: 'assistant-live',
    partialReasoning: null,
    segmentReasoningMessageId: null,
    activeTools: [],
    eventType: 'streaming',
    segments: [
      {
        id: 'assistant-live:0',
        messageId: 'assistant-live',
        text: partialText,
        reasoning: null,
        tools: [],
        eventType: 'streaming'
      }
    ]
  };
}

function defineViewportMetrics(element: HTMLDivElement, metrics: Metrics) {
  let scrollTop = metrics.scrollTop;
  Object.defineProperties(element, {
    clientHeight: {
      configurable: true,
      get: () => metrics.clientHeight
    },
    scrollHeight: {
      configurable: true,
      get: () => metrics.scrollHeight
    },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (next: number) => {
        scrollTop = next;
      }
    }
  });
}

function Harness({
  activeThreadId,
  historyLoading = false,
  liveAssistantDraft = null,
  loadingMessages = false,
  messages = [createMessage('message-1')],
  metrics,
  onController,
  scrollTo
}: HarnessProps) {
  const controller = useChatViewportController({
    activeThreadId,
    draft: '',
    historyLoading,
    liveAssistantDraft,
    loadingMessages,
    messages,
    setShowScrollToBottom: vi.fn()
  });
  onController(controller);

  return (
    <div
      ref={(node) => {
        if (!node) {
          return;
        }

        defineViewportMetrics(node, metrics);
        node.scrollTo = scrollTo;
        controller.messagesViewportRef.current = node;
      }}
    />
  );
}

function createSelection(intersects: boolean) {
  return {
    isCollapsed: false,
    rangeCount: 1,
    getRangeAt: () => ({
      intersectsNode: () => intersects
    })
  } as unknown as Selection;
}

describe('useChatViewportController', () => {
  let container: HTMLDivElement;
  let root: Root;
  let controller: ViewportController | null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callback(performance.now());
        return 1;
      })
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    window.requestAnimationFrame = globalThis.requestAnimationFrame;
    window.cancelAnimationFrame = globalThis.cancelAnimationFrame;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: false }))
    });
    vi.spyOn(document, 'getSelection').mockReturnValue(null);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    controller = null;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it('auto-follows streaming updates with instant scrolling near the bottom', () => {
    const scrollTo = vi.fn();

    act(() => {
      root.render(
        <Harness
          activeThreadId="thread-1"
          liveAssistantDraft={createLiveDraft('hello')}
          metrics={{ scrollHeight: 1000, scrollTop: 450, clientHeight: 500 }}
          onController={(next) => {
            controller = next;
          }}
          scrollTo={scrollTo}
        />
      );
    });

    expect(controller?.shouldAutoScrollRef.current).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({
      top: 1000,
      behavior: 'auto'
    });
  });

  it('does not pull detached readers to the bottom on streaming updates', () => {
    const scrollTo = vi.fn();

    act(() => {
      root.render(
        <Harness
          activeThreadId="thread-1"
          loadingMessages
          liveAssistantDraft={createLiveDraft('hello')}
          metrics={{ scrollHeight: 1000, scrollTop: 100, clientHeight: 500 }}
          onController={(next) => {
            controller = next;
          }}
          scrollTo={scrollTo}
        />
      );
    });
    act(() => {
      scrollTo.mockClear();
      const viewport = controller?.messagesViewportRef.current;
      if (viewport) {
        viewport.scrollTop = 100;
      }
      controller?.messagesViewportRef.current?.dispatchEvent(new Event('scroll'));
    });

    expect(controller?.shouldAutoScrollRef.current).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('blocks auto-follow while a text selection intersects the viewport', () => {
    const scrollTo = vi.fn();
    vi.mocked(document.getSelection).mockReturnValue(createSelection(true));

    act(() => {
      root.render(
        <Harness
          activeThreadId="thread-1"
          liveAssistantDraft={createLiveDraft('selected text')}
          metrics={{ scrollHeight: 1000, scrollTop: 450, clientHeight: 500 }}
          onController={(next) => {
            controller = next;
          }}
          scrollTo={scrollTo}
        />
      );
    });
    act(() => {
      controller?.messagesViewportRef.current?.dispatchEvent(new Event('selectstart'));
    });

    expect(controller?.shouldAutoScrollRef.current).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('restores following mode from current position after selection clears', () => {
    const scrollTo = vi.fn();
    vi.mocked(document.getSelection).mockReturnValue(createSelection(true));

    act(() => {
      root.render(
        <Harness
          activeThreadId="thread-1"
          metrics={{ scrollHeight: 1000, scrollTop: 450, clientHeight: 500 }}
          onController={(next) => {
            controller = next;
          }}
          scrollTo={scrollTo}
        />
      );
    });
    act(() => {
      controller?.messagesViewportRef.current?.dispatchEvent(new Event('selectstart'));
    });
    vi.mocked(document.getSelection).mockReturnValue(null);
    act(() => {
      document.dispatchEvent(new Event('selectionchange'));
    });

    expect(controller?.shouldAutoScrollRef.current).toBe(true);
  });

  it('preserves visual position when prepending older messages', () => {
    const scrollTo = vi.fn();

    act(() => {
      root.render(
        <Harness
          activeThreadId="thread-1"
          metrics={{ scrollHeight: 800, scrollTop: 160, clientHeight: 400 }}
          onController={(next) => {
            controller = next;
          }}
          scrollTo={scrollTo}
        />
      );
    });
    if (!controller) {
      throw new Error('controller was not mounted');
    }
    scrollTo.mockClear();
    controller.pendingPrependAnchorRef.current = {
      scrollHeight: 800,
      scrollTop: 160
    };

    act(() => {
      root.render(
        <Harness
          activeThreadId="thread-1"
          historyLoading
          messages={[createMessage('message-0'), createMessage('message-1')]}
          metrics={{ scrollHeight: 1100, scrollTop: 160, clientHeight: 400 }}
          onController={(next) => {
            controller = next;
          }}
          scrollTo={scrollTo}
        />
      );
    });

    expect(controller.messagesViewportRef.current?.scrollTop).toBe(460);
    expect(controller.shouldAutoScrollRef.current).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
