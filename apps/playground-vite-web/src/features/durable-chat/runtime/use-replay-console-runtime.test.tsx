import type { MessageDto } from '@agent-infra/contracts';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useReplayConsoleRuntime } from '@/features/durable-chat/runtime/use-replay-console-runtime';
import type { DurableThreadDto } from '@/features/durable-chat/types/thread';

const replayApiMocks = vi.hoisted(() => ({
  fetchReplayThreadBasis: vi.fn()
}));

const replayRuntimeMocks = vi.hoisted(() => ({
  useReplayRuntime: vi.fn()
}));

const searchPanelMocks = vi.hoisted(() => ({
  useSearchPanelState: vi.fn()
}));

vi.mock('@/features/durable-chat/repo/replay-api', () => ({
  fetchReplayThreadBasis: (...args: unknown[]) => replayApiMocks.fetchReplayThreadBasis(...args)
}));

vi.mock('@/features/durable-chat/runtime/use-replay-runtime', () => ({
  useReplayRuntime: (...args: unknown[]) => replayRuntimeMocks.useReplayRuntime(...args)
}));

vi.mock('@/features/durable-chat/runtime/use-search-panel-state', () => ({
  useSearchPanelState: (...args: unknown[]) => searchPanelMocks.useSearchPanelState(...args)
}));

function createThread(overrides: Partial<DurableThreadDto> = {}): DurableThreadDto {
  return {
    id: 'thread-1',
    appId: 'playground-vite-web',
    title: 'Thread 1',
    pinned: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    ...overrides
  };
}

function createMessage(overrides: Partial<MessageDto> = {}): MessageDto {
  return {
    id: 'assistant-1',
    threadId: 'thread-1',
    runId: 'run-1',
    role: 'assistant',
    seq: 1,
    status: 'completed',
    metadata: null,
    parts: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('useReplayConsoleRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replayRuntimeMocks.useReplayRuntime.mockReturnValue({
      cursor: { stepIndex: -1, status: 'idle', startedAt: null, lastAdvancedAt: null },
      transcriptBlocks: [],
      controlState: {
        canPlay: true,
        canPause: false,
        canResume: false,
        canRestart: false
      },
      viewState: {
        status: 'idle',
        progressLabel: '0 / 0',
        currentStep: null,
        totalSteps: 0,
        completedSteps: 0
      },
      play: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      restart: vi.fn()
    });
    searchPanelMocks.useSearchPanelState.mockReturnValue({
      activeSearchResult: null,
      searchPanelError: null,
      searchPanelLoading: false,
      searchPanelOpen: false,
      onOpenSearchResult: vi.fn(),
      onCloseSearchPanel: vi.fn()
    });
  });

  it('keeps the existing thread list when loading a different replay thread fails', async () => {
    replayApiMocks.fetchReplayThreadBasis
      .mockResolvedValueOnce({
        ok: true,
        data: {
          threads: [createThread({ id: 'thread-1' }), createThread({ id: 'thread-2', title: 'Thread 2' })],
          messages: [createMessage()],
          pageInfo: null,
          activeRun: null,
          runs: []
        }
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        error: 'Replay load failed'
      });

    const { result, rerender } = renderHook(
      ({ threadId }) => useReplayConsoleRuntime({ initialThreadId: threadId }),
      {
        initialProps: { threadId: 'thread-1' as string | null },
        wrapper
      }
    );

    await waitFor(() => {
      expect(result.current.threads.map((thread) => thread.id)).toEqual(['thread-1', 'thread-2']);
      expect(result.current.error).toBeNull();
    });

    rerender({ threadId: 'thread-2' });

    await waitFor(() => {
      expect(result.current.error).toBe('Replay load failed');
    });

    expect(result.current.threads.map((thread) => thread.id)).toEqual(['thread-1', 'thread-2']);
    expect(result.current.sourceMessages).toEqual([]);
    expect(result.current.transcriptBlocks).toEqual([]);
  });

  it('keeps the existing thread list when replay loading throws', async () => {
    replayApiMocks.fetchReplayThreadBasis
      .mockResolvedValueOnce({
        ok: true,
        data: {
          threads: [createThread({ id: 'thread-1' }), createThread({ id: 'thread-2', title: 'Thread 2' })],
          messages: [createMessage()],
          pageInfo: null,
          activeRun: null,
          runs: []
        }
      })
      .mockRejectedValueOnce(new Error('Network unavailable'));

    const { result, rerender } = renderHook(
      ({ threadId }) => useReplayConsoleRuntime({ initialThreadId: threadId }),
      {
        initialProps: { threadId: 'thread-1' as string | null },
        wrapper
      }
    );

    await waitFor(() => {
      expect(result.current.threads.map((thread) => thread.id)).toEqual(['thread-1', 'thread-2']);
    });

    rerender({ threadId: 'thread-2' });

    await waitFor(() => {
      expect(result.current.error).toBe('Network unavailable');
    });

    expect(result.current.threads.map((thread) => thread.id)).toEqual(['thread-1', 'thread-2']);
  });
});
