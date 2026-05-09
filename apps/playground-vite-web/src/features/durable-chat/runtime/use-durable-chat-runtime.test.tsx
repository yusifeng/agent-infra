import type { MessageDto, RunDto } from '@agent-infra/contracts';
import type { LiveAssistantDraft } from '@agent-infra/durable-chat-client';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDurableChatRuntime } from '@/features/durable-chat/runtime/use-durable-chat-runtime';

const durableChatClientMocks = vi.hoisted(() => ({
  runActivateThread: vi.fn(),
  runCreateThreadRecord: vi.fn(),
  runInitializeRuntime: vi.fn(),
  runLoadOlderMessages: vi.fn(),
  runLoadThreadMessages: vi.fn(),
  runReconcileCompletedTurn: vi.fn(),
  runRefreshMeta: vi.fn(),
  runRefreshThreads: vi.fn(),
  runResetDraftThreadState: vi.fn(),
  runSendMessageFlow: vi.fn(),
  runStopViewingLiveResponse: vi.fn()
}));

const liveDraftRecoveryMocks = vi.hoisted(() => ({
  resolveRestoredRunRefreshId: vi.fn(),
  restoreStoredDraftForActiveRun: vi.fn(),
  syncStoredLiveDraft: vi.fn()
}));

const liveDraftPersistenceMocks = vi.hoisted(() => ({
  startRestoredLiveDraftRefreshLoop: vi.fn(),
  shouldRefreshRestoredLiveDraft: vi.fn()
}));

const chatApiMocks = vi.hoisted(() => ({
  createThread: vi.fn(),
  fetchThreads: vi.fn(),
  fetchThreadMessages: vi.fn(),
  renameThread: vi.fn(),
  archiveThread: vi.fn(),
  pinThread: vi.fn(),
  unpinThread: vi.fn()
}));

const shareApiMocks = vi.hoisted(() => ({
  createThreadSnapshotShare: vi.fn(),
  fetchCurrentThreadShare: vi.fn(),
  revokeThreadSnapshotShare: vi.fn()
}));

vi.mock('@agent-infra/durable-chat-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agent-infra/durable-chat-client')>();

  return {
    ...actual,
    INITIAL_MESSAGE_PAGE_LIMIT: 50,
    applyHydratedTranscriptState: ({ messages, pageInfo, activeResponseRun, selectedRunId, runs, actions }: any) => {
      actions.setMessages(messages);
      actions.setMessagePageInfo(pageInfo);
      actions.setActiveResponseRun(activeResponseRun);
      actions.setSelectedRunId(selectedRunId);
      actions.setRecentRuns(runs);
    },
    createInitialRunInspectorState: () => ({
      logOpen: false,
      selectedRunId: null,
      recentRuns: [],
      recentRunsLoading: false,
      recentRunsError: null,
      timeline: null,
      timelineLoading: false,
      timelineError: null
    }),
    runActivateThread: (...args: unknown[]) => durableChatClientMocks.runActivateThread(...args),
    runCreateThreadRecord: (...args: unknown[]) => durableChatClientMocks.runCreateThreadRecord(...args),
    runInitializeRuntime: (...args: unknown[]) => durableChatClientMocks.runInitializeRuntime(...args),
    runLoadOlderMessages: (...args: unknown[]) => durableChatClientMocks.runLoadOlderMessages(...args),
    runLoadThreadMessages: (...args: unknown[]) => durableChatClientMocks.runLoadThreadMessages(...args),
    runReconcileCompletedTurn: (...args: unknown[]) => durableChatClientMocks.runReconcileCompletedTurn(...args),
    runRefreshMeta: (...args: unknown[]) => durableChatClientMocks.runRefreshMeta(...args),
    runRefreshThreads: (...args: unknown[]) => durableChatClientMocks.runRefreshThreads(...args),
    runResetDraftThreadState: (...args: unknown[]) => durableChatClientMocks.runResetDraftThreadState(...args),
    runSendMessageFlow: (...args: unknown[]) => durableChatClientMocks.runSendMessageFlow(...args),
    runStopViewingLiveResponse: (...args: unknown[]) => durableChatClientMocks.runStopViewingLiveResponse(...args)
  };
});

vi.mock('@/features/durable-chat/runtime/live-draft-recovery', () => ({
  resolveRestoredRunRefreshId: (...args: unknown[]) => liveDraftRecoveryMocks.resolveRestoredRunRefreshId(...args),
  restoreStoredDraftForActiveRun: (...args: unknown[]) => liveDraftRecoveryMocks.restoreStoredDraftForActiveRun(...args),
  syncStoredLiveDraft: (...args: unknown[]) => liveDraftRecoveryMocks.syncStoredLiveDraft(...args)
}));

vi.mock('@/features/durable-chat/runtime/live-draft-persistence', () => ({
  startRestoredLiveDraftRefreshLoop: (...args: unknown[]) => liveDraftPersistenceMocks.startRestoredLiveDraftRefreshLoop(...args),
  shouldRefreshRestoredLiveDraft: (...args: unknown[]) => liveDraftPersistenceMocks.shouldRefreshRestoredLiveDraft(...args)
}));

vi.mock('@/features/durable-chat/repo/chat-api', () => ({
  createThread: (...args: unknown[]) => chatApiMocks.createThread(...args),
  fetchThreads: (...args: unknown[]) => chatApiMocks.fetchThreads(...args),
  fetchThreadMessages: (...args: unknown[]) => chatApiMocks.fetchThreadMessages(...args),
  renameThread: (...args: unknown[]) => chatApiMocks.renameThread(...args),
  archiveThread: (...args: unknown[]) => chatApiMocks.archiveThread(...args),
  pinThread: (...args: unknown[]) => chatApiMocks.pinThread(...args),
  unpinThread: (...args: unknown[]) => chatApiMocks.unpinThread(...args)
}));

vi.mock('@/features/durable-chat/repo/share-api', () => ({
  createThreadSnapshotShare: (...args: unknown[]) => shareApiMocks.createThreadSnapshotShare(...args),
  fetchCurrentThreadShare: (...args: unknown[]) => shareApiMocks.fetchCurrentThreadShare(...args),
  revokeThreadSnapshotShare: (...args: unknown[]) => shareApiMocks.revokeThreadSnapshotShare(...args)
}));

vi.mock('@/features/durable-chat/runtime/use-search-panel-state', () => ({
  useSearchPanelState: () => ({
    activeSearchResult: null,
    searchPanelError: null,
    searchPanelLoading: false,
    searchPanelOpen: false,
    onCloseSearchPanel: vi.fn(),
    onOpenSearchResult: vi.fn()
  })
}));

function createRun(overrides: Partial<RunDto> = {}): RunDto {
  return {
    id: 'run-1',
    threadId: 'thread-1',
    triggerMessageId: null,
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    status: 'running',
    usage: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function createThread(
  overrides: Partial<import('@/features/durable-chat/types/thread').PlaygroundThreadDto> = {}
) {
  return {
    id: 'thread-1',
    appId: 'playground-vite-web',
    title: 'Thread title',
    status: 'active' as const,
    metadata: null,
    pinned: false,
    pinnedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
    ...overrides
  };
}

function createMessage(overrides: Partial<MessageDto> = {}): MessageDto {
  return {
    id: 'assistant-message-1',
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

function createDraft(): LiveAssistantDraft {
  return {
    runId: 'run-1',
    messageId: 'assistant-1',
    source: 'restored',
    committedText: 'Searching',
    partialText: '',
    segmentText: '',
    segmentTextMessageId: null,
    partialReasoning: null,
    segmentReasoningMessageId: null,
    activeTools: [],
    eventType: 'streaming',
    segments: []
  };
}

let currentPath = '';

function LocationProbe() {
  currentPath = useLocation().pathname;
  return null;
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={['/chat/thread-1']}>
      <LocationProbe />
      {children}
    </MemoryRouter>
  );
}

describe('useDurableChatRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    durableChatClientMocks.runRefreshMeta.mockResolvedValue(undefined);
    chatApiMocks.fetchThreads.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        threads: [
          createThread({ id: 'thread-1', title: '第一个会话', updatedAt: '2026-01-01T00:00:01.000Z' }),
          createThread({ id: 'thread-2', title: '第二个会话', updatedAt: '2026-01-01T00:00:02.000Z' })
        ]
      }
    });
    chatApiMocks.createThread.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        thread: createThread({ id: 'thread-3', title: '新会话', updatedAt: '2026-01-01T00:00:03.000Z' })
      }
    });
    durableChatClientMocks.runResetDraftThreadState.mockImplementation(() => undefined);
    durableChatClientMocks.runStopViewingLiveResponse.mockImplementation(() => undefined);
    durableChatClientMocks.runActivateThread.mockImplementation(async ({ threadId, actions, operations }: any) => {
      actions.setActiveThreadId(threadId);
      await operations.loadThreadMessages(threadId);
      return { ok: true };
    });
    durableChatClientMocks.runLoadThreadMessages.mockImplementation(async ({ operations }: any) => {
      operations.applyHydratedTranscript({
        messages: [] as MessageDto[],
        pageInfo: null,
        activeResponseRun: createRun(),
        selectedRunId: null,
        runs: []
      });
      return { ok: true, restoredRunId: null };
    });
    durableChatClientMocks.runInitializeRuntime.mockImplementation(async ({ initialThreadId, operations }: any) => {
      await operations.refreshThreads();
      if (initialThreadId) {
        await operations.activateThread(initialThreadId);
      }
    });
    liveDraftRecoveryMocks.syncStoredLiveDraft.mockReturnValue('noop');
    liveDraftRecoveryMocks.restoreStoredDraftForActiveRun.mockImplementation(
      ({ activeResponseRun, liveAssistantDraft }: { activeResponseRun: RunDto | null; liveAssistantDraft: LiveAssistantDraft | null }) => {
        if (
          !activeResponseRun ||
          liveAssistantDraft ||
          !['queued', 'running'].includes(activeResponseRun.status)
        ) {
          return null;
        }

        return {
          restoredRunId: activeResponseRun.id,
          draft: createDraft()
        };
      }
    );
    liveDraftRecoveryMocks.resolveRestoredRunRefreshId.mockImplementation(
      ({ restoredRunRefreshId }: { restoredRunRefreshId: string | null }) => restoredRunRefreshId
    );
    liveDraftPersistenceMocks.shouldRefreshRestoredLiveDraft.mockImplementation(
      ({ restoredRunId }: { restoredRunId: string | null }) => restoredRunId === 'run-1'
    );
    liveDraftPersistenceMocks.startRestoredLiveDraftRefreshLoop.mockImplementation(() => () => undefined);
    chatApiMocks.renameThread.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        thread: createThread({ id: 'thread-1', title: '已重命名' })
      }
    });
    chatApiMocks.archiveThread.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        thread: createThread({ id: 'thread-1', status: 'archived', archivedAt: '2026-01-01T00:00:03.000Z' })
      }
    });
    chatApiMocks.pinThread.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        thread: createThread({ id: 'thread-1', pinned: true })
      }
    });
    chatApiMocks.unpinThread.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        thread: createThread({ id: 'thread-1', pinned: false })
      }
    });
    shareApiMocks.fetchCurrentThreadShare.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        share: null
      }
    });
    currentPath = '/chat/thread-1';
  });

  it('restores an active live draft and starts its refresh loop after thread hydration', async () => {
    const { result } = renderHook(() => useDurableChatRuntime({ initialThreadId: 'thread-1' }), {
      wrapper
    });

    await waitFor(() => {
      expect(result.current.activeThreadId).toBe('thread-1');
      expect(result.current.liveAssistantDraft?.source).toBe('restored');
    });

    expect(liveDraftRecoveryMocks.restoreStoredDraftForActiveRun).toHaveBeenCalled();
    expect(liveDraftPersistenceMocks.startRestoredLiveDraftRefreshLoop).toHaveBeenCalledTimes(1);
  });

  it('uses the restored refresh loop to reload thread messages in background mode', async () => {
    let refresh!: () => Promise<void>;
    liveDraftPersistenceMocks.startRestoredLiveDraftRefreshLoop.mockImplementation(({ refresh: nextRefresh }: { refresh: () => Promise<void> }) => {
      refresh = nextRefresh;
      return () => undefined;
    });

    renderHook(() => useDurableChatRuntime({ initialThreadId: 'thread-1' }), {
      wrapper
    });

    await waitFor(() => {
      expect(liveDraftPersistenceMocks.startRestoredLiveDraftRefreshLoop).toHaveBeenCalledTimes(1);
    });

    await refresh();

    expect(durableChatClientMocks.runLoadThreadMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread-1',
        options: expect.objectContaining({
          background: true,
          skipTimelineReload: true,
          preserveExistingTimeline: true
        })
      })
    );
  });

  it('runs runtime lifecycle boot effects only once across rerenders', async () => {
    const { rerender } = renderHook(
      ({ initialThreadId }) => useDurableChatRuntime({ initialThreadId }),
      {
        initialProps: { initialThreadId: 'thread-1' as string | null },
        wrapper
      }
    );

    await waitFor(() => {
      expect(durableChatClientMocks.runRefreshMeta).toHaveBeenCalledTimes(1);
      expect(durableChatClientMocks.runInitializeRuntime).toHaveBeenCalledTimes(1);
    });

    rerender({ initialThreadId: 'thread-1' });

    await waitFor(() => {
      expect(durableChatClientMocks.runRefreshMeta).toHaveBeenCalledTimes(1);
      expect(durableChatClientMocks.runInitializeRuntime).toHaveBeenCalledTimes(1);
    });
  });

  it('reconciles the completed turn after a send flow finishes', async () => {
    durableChatClientMocks.runReconcileCompletedTurn.mockImplementation(async ({ actions }: any) => {
      actions.setActiveResponseRun(createRun({ status: 'completed' }));
      actions.setMessages([createMessage()]);
      actions.setLiveAssistantDraft(null);
    });
    durableChatClientMocks.runSendMessageFlow.mockImplementation(async ({ actions, operations }: any) => {
      actions.setLiveAssistantDraft(createDraft());
      await operations.reconcileCompletedTurn('thread-1', 'run-1', 7);
    });

    const { result } = renderHook(() => useDurableChatRuntime({ initialThreadId: 'thread-1' }), {
      wrapper
    });

    await waitFor(() => {
      expect(result.current.activeThreadId).toBe('thread-1');
    });

    act(() => {
      result.current.onDraftChange('Summarize this');
    });

    act(() => {
      result.current.onSend();
    });

    await waitFor(() => {
      expect(durableChatClientMocks.runReconcileCompletedTurn).toHaveBeenCalledTimes(1);
      expect(result.current.liveAssistantDraft).toBeNull();
      expect(result.current.displayedMessages).toEqual([expect.objectContaining({ id: 'assistant-message-1' })]);
    });
  });

  it('renames a thread and updates the visible thread title', async () => {
    const { result } = renderHook(() => useDurableChatRuntime({ initialThreadId: 'thread-1' }), {
      wrapper
    });

    await waitFor(() => {
      expect(result.current.threads.map((thread) => thread.id)).toEqual(['thread-2', 'thread-1']);
    });

    act(() => {
      result.current.onOpenRenameThread('thread-1');
      result.current.onRenameDraftTitleChange('已重命名');
    });

    act(() => {
      result.current.onConfirmRenameThread();
    });

    await waitFor(() => {
      expect(chatApiMocks.renameThread).toHaveBeenCalledWith('thread-1', '已重命名');
      expect(result.current.threads.find((thread) => thread.id === 'thread-1')?.title).toBe('已重命名');
      expect(result.current.renameDialogThreadId).toBeNull();
    });
  });

  it('surfaces rename failures without closing the dialog', async () => {
    chatApiMocks.renameThread.mockResolvedValue({
      ok: false,
      status: 400,
      error: 'Invalid title',
      data: {}
    });

    const { result } = renderHook(() => useDurableChatRuntime({ initialThreadId: 'thread-1' }), {
      wrapper
    });

    await waitFor(() => {
      expect(result.current.threads).toHaveLength(2);
    });

    act(() => {
      result.current.onOpenRenameThread('thread-1');
      result.current.onRenameDraftTitleChange(' ');
    });

    act(() => {
      result.current.onConfirmRenameThread();
    });

    await waitFor(() => {
      expect(result.current.threadActionError).toBe('请输入会话标题。');
      expect(result.current.renameDialogThreadId).toBe('thread-1');
    });
  });

  it('archives the active thread and navigates back to /new', async () => {
    const { result } = renderHook(() => useDurableChatRuntime({ initialThreadId: 'thread-1' }), {
      wrapper
    });

    await waitFor(() => {
      expect(result.current.activeThreadId).toBe('thread-1');
      expect(result.current.threads).toHaveLength(2);
    });

    act(() => {
      result.current.onPinThread('thread-1');
      result.current.onOpenArchiveThread('thread-1');
    });

    act(() => {
      result.current.onConfirmArchiveThread();
    });

    await waitFor(() => {
      expect(chatApiMocks.archiveThread).toHaveBeenCalledWith('thread-1');
      expect(result.current.threads.find((thread) => thread.id === 'thread-1')).toBeUndefined();
      expect(result.current.pinnedThreadIds).toEqual([]);
      expect(currentPath).toBe('/new');
    });
  });

  it('opens the share dialog for a thread action target', async () => {
    const { result } = renderHook(() => useDurableChatRuntime({ initialThreadId: 'thread-1' }), {
      wrapper
    });

    await waitFor(() => {
      expect(result.current.threads).toHaveLength(2);
    });

    act(() => {
      result.current.onOpenShareThread('thread-2');
    });

    await waitFor(() => {
      expect(result.current.shareDialog.open).toBe(true);
      expect(result.current.shareDialog.targetThreadId).toBe('thread-2');
    });
  });
});
