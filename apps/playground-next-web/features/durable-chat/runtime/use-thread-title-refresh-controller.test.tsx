// @vitest-environment jsdom

import type { ThreadDto } from '@agent-infra/contracts';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useThreadTitleRefreshController } from './use-thread-title-refresh-controller';

type TitleController = ReturnType<typeof useThreadTitleRefreshController>;

type HarnessProps = {
  activeThreadId: string | null;
  displayedThreads: ThreadDto[];
  fetchThreadById?: (threadId: string, signal: AbortSignal) => Promise<{ ok: boolean; data: { thread?: ThreadDto } } | null>;
  onController: (controller: TitleController) => void;
  setThreads: (next: ThreadDto[] | ((current: ThreadDto[]) => ThreadDto[])) => void;
};

function createThread(id: string, title: string): ThreadDto {
  return {
    id,
    appId: 'playground',
    title,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
}

function Harness({ activeThreadId, displayedThreads, fetchThreadById = vi.fn(), onController, setThreads }: HarnessProps) {
  const currentThreadTitle = displayedThreads.find((thread) => thread.id === activeThreadId)?.title ?? '';
  const controller = useThreadTitleRefreshController({
    activeThreadId,
    currentThreadTitle,
    displayedThreads,
    fetchThreadById,
    isDefaultTitle: (title) => !title || title === 'New thread',
    setThreads
  });
  onController(controller);

  return <div data-title={controller.currentVisibleThreadTitle} />;
}

describe('useThreadTitleRefreshController', () => {
  let container: HTMLDivElement;
  let root: Root;
  let controller: TitleController | null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

  it('does not animate a pending title for a non-active thread', () => {
    const setThreads = vi.fn();
    const threads = [createThread('thread-a', 'New thread'), createThread('thread-b', 'New thread')];

    act(() => {
      root.render(
        <Harness
          activeThreadId="thread-b"
          displayedThreads={threads}
          onController={(next) => {
            controller = next;
          }}
          setThreads={setThreads}
        />
      );
    });
    act(() => {
      controller?.applyThreadTitleUpdate({
        threadId: 'thread-a',
        title: 'Generated title for A',
        updatedAt: '2026-01-01T00:00:01.000Z'
      });
    });

    expect(setThreads).toHaveBeenCalledTimes(1);
    expect(controller?.typingTitleThreadId).toBeNull();
    expect(controller?.currentVisibleThreadTitle).toBe('New thread');
  });

  it('cancels generated-title typing when the active thread changes', () => {
    let activeThreadId = 'thread-a';
    let threads = [createThread('thread-a', 'New thread'), createThread('thread-b', 'Existing B')];
    const setThreads = vi.fn((next: ThreadDto[] | ((current: ThreadDto[]) => ThreadDto[])) => {
      threads = typeof next === 'function' ? next(threads) : next;
    });
    const render = () => {
      root.render(
        <Harness
          activeThreadId={activeThreadId}
          displayedThreads={threads}
          onController={(next) => {
            controller = next;
          }}
          setThreads={setThreads}
        />
      );
    };

    act(render);
    act(() => {
      controller?.applyThreadTitleUpdate({
        threadId: 'thread-a',
        title: 'Generated title for A',
        updatedAt: '2026-01-01T00:00:01.000Z'
      });
    });
    expect(controller?.typingTitleThreadId).toBe('thread-a');
    expect(controller?.currentVisibleThreadTitle).toBe('G');

    activeThreadId = 'thread-b';
    act(render);

    expect(controller?.typingTitleThreadId).toBeNull();
    expect(controller?.currentVisibleThreadTitle).toBe('Existing B');
  });
});
