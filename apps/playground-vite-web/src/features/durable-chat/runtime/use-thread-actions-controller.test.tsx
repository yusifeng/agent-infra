import { act, renderHook, waitFor } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as chatApi from '@/features/durable-chat/repo/chat-api';
import { useThreadActionsController } from '@/features/durable-chat/runtime/use-thread-actions-controller';
import type { PlaygroundThreadDto } from '@/features/durable-chat/types/thread';

vi.mock('@/features/durable-chat/repo/chat-api', () => ({
  archiveThread: vi.fn(),
  pinThread: vi.fn(),
  renameThread: vi.fn(),
  unpinThread: vi.fn()
}));

function createThread(overrides: Partial<PlaygroundThreadDto> = {}): PlaygroundThreadDto {
  return {
    id: 'thread-1',
    appId: 'playground-vite-web',
    title: 'New Thread',
    status: 'active',
    metadata: null,
    pinned: false,
    pinnedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
    ...overrides
  };
}

type HookOptions = {
  activeThreadId?: string | null;
  initialThreads?: PlaygroundThreadDto[];
  typingTitleThreadId?: string | null;
  onOpenShareDialogForThread?: ReturnType<typeof vi.fn>;
  resetDraftThreadState?: ReturnType<typeof vi.fn>;
  setDurableRecoveryState?: ReturnType<typeof vi.fn>;
  stopTypingTitleAnimation?: ReturnType<typeof vi.fn>;
  stopViewingLiveResponse?: ReturnType<typeof vi.fn>;
  navigateToNewChat?: ReturnType<typeof vi.fn>;
};

function useThreadActionsHarness({
  activeThreadId = 'thread-1',
  initialThreads = [createThread({ id: 'thread-1' }), createThread({ id: 'thread-2', title: 'Second Thread' })],
  typingTitleThreadId = null,
  onOpenShareDialogForThread = vi.fn(),
  resetDraftThreadState = vi.fn(),
  setDurableRecoveryState = vi.fn(),
  stopTypingTitleAnimation = vi.fn(),
  stopViewingLiveResponse = vi.fn(),
  navigateToNewChat = vi.fn()
}: HookOptions = {}) {
  const [threads, setThreads] = useState(initialThreads);
  const activeThreadIdRef = useRef<string | null>(activeThreadId);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  const controller = useThreadActionsController({
    activeThreadIdRef,
    navigateToNewChat,
    onOpenShareDialogForThread,
    resetDraftThreadState,
    setDurableRecoveryState,
    setThreads,
    stopTypingTitleAnimation,
    stopViewingLiveResponse,
    threads,
    typingTitleThreadId
  });

  return {
    threads,
    ...controller
  };
}

describe('useThreadActionsController', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the rename dialog open and skips the API when the draft title is empty', async () => {
    const { result } = renderHook(() => useThreadActionsHarness());

    act(() => {
      result.current.onOpenRenameThread('thread-1');
      result.current.onRenameDraftTitleChange('   ');
      result.current.onConfirmRenameThread();
    });

    await waitFor(() => {
      expect(result.current.threadActionError).toBe('请输入会话标题。');
      expect(result.current.renameDialogThreadId).toBe('thread-1');
    });

    expect(chatApi.renameThread).not.toHaveBeenCalled();
  });

  it('archives the active thread and runs the required cleanup callbacks', async () => {
    vi.mocked(chatApi.archiveThread).mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        thread: createThread({ id: 'thread-1', status: 'archived', archivedAt: '2026-01-01T00:00:03.000Z' })
      }
    });
    const stopViewingLiveResponse = vi.fn();
    const resetDraftThreadState = vi.fn();
    const setDurableRecoveryState = vi.fn();
    const navigateToNewChat = vi.fn();
    const { result } = renderHook(() =>
      useThreadActionsHarness({
        activeThreadId: 'thread-1',
        navigateToNewChat,
        resetDraftThreadState,
        setDurableRecoveryState,
        stopViewingLiveResponse
      })
    );

    act(() => {
      result.current.onOpenArchiveThread('thread-1');
    });

    act(() => {
      result.current.onConfirmArchiveThread();
    });

    await waitFor(() => {
      expect(result.current.threads.find((thread) => thread.id === 'thread-1')).toBeUndefined();
    });

    expect(stopViewingLiveResponse).toHaveBeenCalledTimes(1);
    expect(resetDraftThreadState).toHaveBeenCalledTimes(1);
    expect(setDurableRecoveryState).toHaveBeenCalledWith({
      phase: 'idle',
      message: null
    });
    expect(navigateToNewChat).toHaveBeenCalledTimes(1);
  });

  it('archives a non-active thread without resetting the active runtime state', async () => {
    vi.mocked(chatApi.archiveThread).mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        thread: createThread({ id: 'thread-2', status: 'archived', archivedAt: '2026-01-01T00:00:03.000Z' })
      }
    });
    const stopViewingLiveResponse = vi.fn();
    const resetDraftThreadState = vi.fn();
    const setDurableRecoveryState = vi.fn();
    const navigateToNewChat = vi.fn();
    const { result } = renderHook(() =>
      useThreadActionsHarness({
        activeThreadId: 'thread-1',
        navigateToNewChat,
        resetDraftThreadState,
        setDurableRecoveryState,
        stopViewingLiveResponse
      })
    );

    act(() => {
      result.current.onOpenArchiveThread('thread-2');
    });

    act(() => {
      result.current.onConfirmArchiveThread();
    });

    await waitFor(() => {
      expect(result.current.threads.map((thread) => thread.id)).toEqual(['thread-1']);
    });

    expect(stopViewingLiveResponse).not.toHaveBeenCalled();
    expect(resetDraftThreadState).not.toHaveBeenCalled();
    expect(setDurableRecoveryState).not.toHaveBeenCalled();
    expect(navigateToNewChat).not.toHaveBeenCalled();
  });

  it('surfaces pin failures without mutating the current thread order', async () => {
    vi.mocked(chatApi.pinThread).mockResolvedValue({
      ok: false,
      status: 500,
      error: 'Pin failed',
      data: {}
    });
    const initialThreads = [createThread({ id: 'thread-1' }), createThread({ id: 'thread-2', title: 'Second Thread' })];
    const { result } = renderHook(() => useThreadActionsHarness({ initialThreads }));

    act(() => {
      result.current.onOpenThreadMenu('thread-2');
      result.current.onPinThread('thread-2');
    });

    await waitFor(() => {
      expect(result.current.threadActionError).toBe('Pin failed');
    });

    expect(result.current.threads.map((thread) => thread.id)).toEqual(['thread-1', 'thread-2']);
    expect(result.current.openThreadMenuId).toBe('thread-2');
  });

  it('surfaces unpin failures without mutating thread pin state', async () => {
    vi.mocked(chatApi.unpinThread).mockResolvedValue({
      ok: false,
      status: 500,
      error: 'Unpin failed',
      data: {}
    });
    const initialThreads = [
      createThread({ id: 'thread-1', pinned: true, pinnedAt: '2026-01-01T00:00:01.000Z' }),
      createThread({ id: 'thread-2', title: 'Second Thread' })
    ];
    const { result } = renderHook(() => useThreadActionsHarness({ initialThreads }));

    act(() => {
      result.current.onOpenThreadMenu('thread-1');
      result.current.onUnpinThread('thread-1');
    });

    await waitFor(() => {
      expect(result.current.threadActionError).toBe('Unpin failed');
    });

    expect(result.current.threads.find((thread) => thread.id === 'thread-1')?.pinned).toBe(true);
    expect(result.current.openThreadMenuId).toBe('thread-1');
  });

  it('closes the thread menu before opening the share dialog', () => {
    const onOpenShareDialogForThread = vi.fn();
    const { result } = renderHook(() =>
      useThreadActionsHarness({
        onOpenShareDialogForThread
      })
    );

    act(() => {
      result.current.onOpenThreadMenu('thread-2');
      result.current.onOpenShareThread('thread-2');
    });

    expect(result.current.openThreadMenuId).toBeNull();
    expect(onOpenShareDialogForThread).toHaveBeenCalledWith('thread-2');
  });
});
