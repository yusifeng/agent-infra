import type { MessageDto, RunDto } from '@agent-infra/contracts';
import type { LiveAssistantDraft } from '@agent-infra/durable-chat-client';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('useDurableChatRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    durableChatClientMocks.runRefreshMeta.mockResolvedValue(undefined);
    durableChatClientMocks.runRefreshThreads.mockResolvedValue(undefined);
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
      if (initialThreadId) {
        await operations.activateThread(initialThreadId);
      }
    });
    liveDraftRecoveryMocks.syncStoredLiveDraft.mockReturnValue('noop');
    liveDraftRecoveryMocks.restoreStoredDraftForActiveRun.mockImplementation(
      ({ activeResponseRun, liveAssistantDraft }: { activeResponseRun: RunDto | null; liveAssistantDraft: LiveAssistantDraft | null }) => {
        if (!activeResponseRun || liveAssistantDraft) {
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
});
