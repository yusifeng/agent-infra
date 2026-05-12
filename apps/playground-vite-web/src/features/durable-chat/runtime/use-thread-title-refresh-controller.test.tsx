import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isDefaultThreadTitle } from '@/features/durable-chat/service/default-thread-title';
import { useThreadTitleRefreshController } from '@/features/durable-chat/runtime/use-thread-title-refresh-controller';
import type { PlaygroundThreadDto } from '@/features/durable-chat/types/thread';

function createThread(overrides: Partial<PlaygroundThreadDto> = {}): PlaygroundThreadDto {
  return {
    id: 'thread-1',
    appId: 'playground-vite-web',
    title: 'New Thread',
    status: 'active',
    metadata: null,
    pinned: false,
    pinnedAt: null,
    runtimeProvider: null,
    runtimeModel: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
    ...overrides
  };
}

function TitleHarness({
  fetchThreadById,
  initialThreads
}: {
  fetchThreadById: (threadId: string, signal: AbortSignal) => Promise<{ ok: boolean; data: { thread?: PlaygroundThreadDto } } | null>;
  initialThreads: PlaygroundThreadDto[];
}) {
  const [threads, setThreads] = useState(initialThreads);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThreads[0]?.id ?? null);
  const displayedThreads = threads;
  const currentThreadTitle = displayedThreads.find((thread) => thread.id === activeThreadId)?.title ?? '';
  const {
    applyThreadTitleUpdate,
    currentVisibleThreadTitle,
    refreshThreadAfterCompletedRun,
    stopTypingTitleAnimation,
    visibleThreads
  } = useThreadTitleRefreshController({
    activeThreadId,
    currentThreadTitle,
    displayedThreads,
    fetchThreadById,
    isDefaultTitle: isDefaultThreadTitle,
    setThreads
  });

  return (
    <div>
      <button type="button" onClick={() => void refreshThreadAfterCompletedRun('thread-1')}>
        refresh
      </button>
      <button
        type="button"
        onClick={() =>
          applyThreadTitleUpdate({
            threadId: 'thread-1',
            title: '验证码问题排查',
            updatedAt: '2026-01-01T00:00:10.000Z'
          })
        }
      >
        event
      </button>
      <button
        type="button"
        onClick={() =>
          applyThreadTitleUpdate({
            threadId: 'thread-1',
            title: '人工复核验证码失败原因',
            updatedAt: '2026-01-01T00:00:11.000Z'
          })
        }
      >
        event-2
      </button>
      <button type="button" onClick={() => setActiveThreadId('thread-2')}>
        switch
      </button>
      <button type="button" onClick={stopTypingTitleAnimation}>
        stop
      </button>
      <div data-testid="current-title">{currentVisibleThreadTitle}</div>
      <div data-testid="thread-1-title">{visibleThreads.find((thread) => thread.id === 'thread-1')?.title ?? ''}</div>
    </div>
  );
}

describe('useThreadTitleRefreshController', () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('aborts an in-flight title refresh when the controller unmounts', async () => {
    let capturedSignal: AbortSignal | null = null;
    const fetchThreadById = vi.fn(
      async (_threadId: string, signal: AbortSignal) =>
        new Promise<{ ok: boolean; data: { thread?: PlaygroundThreadDto } } | null>(() => {
          capturedSignal = signal;
        })
    );

    const view = render(
      <TitleHarness
        fetchThreadById={fetchThreadById}
        initialThreads={[createThread({ id: 'thread-1', title: 'New Thread' })]}
      />
    );

    act(() => {
      fireEvent.click(screen.getByText('refresh'));
    });

    await waitFor(() => {
      expect(fetchThreadById).toHaveBeenCalledTimes(1);
      expect(capturedSignal).not.toBeNull();
    });

    if (!capturedSignal) {
      throw new Error('Expected an abort signal to be captured.');
    }
    const signal = capturedSignal as AbortSignal;

    view.unmount();

    expect(signal.aborted).toBe(true);
  });

  it('does not mutate thread titles when auto-title refresh attempts keep failing', async () => {
    vi.useFakeTimers();
    const fetchThreadById = vi.fn(async () => null);

    render(
      <TitleHarness
        fetchThreadById={fetchThreadById}
        initialThreads={[createThread({ id: 'thread-1', title: 'New Thread' })]}
      />
    );

    act(() => {
      fireEvent.click(screen.getByText('refresh'));
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(fetchThreadById).toHaveBeenCalledTimes(8);
    expect(screen.getByTestId('current-title').textContent).toBe('New Thread');
    expect(screen.getByTestId('thread-1-title').textContent).toBe('New Thread');
  });

  it('does not start typing animation for a thread that already has a non-default title', async () => {
    const fetchThreadById = vi.fn(async () => ({
      ok: true,
      data: {
        thread: createThread({ id: 'thread-1', title: '服务器生成标题' })
      }
    }));

    render(
      <TitleHarness
        fetchThreadById={fetchThreadById}
        initialThreads={[createThread({ id: 'thread-1', title: '用户手动标题' })]}
      />
    );

    act(() => {
      fireEvent.click(screen.getByText('refresh'));
    });

    await waitFor(() => {
      expect(fetchThreadById).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByTestId('current-title').textContent).toBe('用户手动标题');
    expect(screen.getByTestId('thread-1-title').textContent).toBe('用户手动标题');
  });

  it('starts typing animation immediately from a thread.title_updated event', async () => {
    vi.useFakeTimers();

    render(
      <TitleHarness
        fetchThreadById={vi.fn(async () => null)}
        initialThreads={[createThread({ id: 'thread-1', title: 'New Thread' })]}
      />
    );

    act(() => {
      fireEvent.click(screen.getByText('event'));
    });

    expect(screen.getByTestId('current-title').textContent?.length).toBeGreaterThan(0);
    expect(screen.getByTestId('current-title').textContent?.length).toBeLessThan('验证码问题排查'.length);
    expect(screen.getByTestId('thread-1-title').textContent).toBe(screen.getByTestId('current-title').textContent);

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId('current-title').textContent).toBe('验证码问题排查');
    expect(screen.getByTestId('thread-1-title').textContent).toBe('验证码问题排查');
  });

  it('restarts typing animation cleanly when a newer thread.title_updated event arrives', async () => {
    vi.useFakeTimers();

    render(
      <TitleHarness
        fetchThreadById={vi.fn(async () => null)}
        initialThreads={[createThread({ id: 'thread-1', title: 'New Thread' })]}
      />
    );

    act(() => {
      fireEvent.click(screen.getByText('event'));
    });

    act(() => {
      vi.advanceTimersByTime(40);
    });

    act(() => {
      fireEvent.click(screen.getByText('event-2'));
    });

    expect(screen.getByTestId('current-title').textContent).toBe('人工复核验证码失败原因');
    expect(screen.getByTestId('thread-1-title').textContent).toBe('人工复核验证码失败原因');

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(screen.getByTestId('current-title').textContent).toBe('人工复核验证码失败原因');
    expect(screen.getByTestId('thread-1-title').textContent).toBe('人工复核验证码失败原因');
  });
});
