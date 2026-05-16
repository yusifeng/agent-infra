import type { MessageDto, RunDto, RunTimelineResponseDto, ThreadMessagesPageInfoDto } from '@agent-infra/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  runReconcileCompletedTurnController,
  type ReconcileCompletedTurnControllerArgs
} from './send-reconcile-controller';
import type { PlaygroundThreadDto } from '@/features/durable-chat/repo/chat-api';
import type { ChatPhase } from '@/features/durable-chat/types/runtime';
import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';

type Updater<T> = T | ((current: T) => T);

const now = '2026-01-01T00:00:00.000Z';

function createThread(overrides: Partial<PlaygroundThreadDto> = {}): PlaygroundThreadDto {
  return {
    id: 'thread-1',
    appId: 'playground',
    title: 'Thread One',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function createMessage(): MessageDto {
  return {
    id: 'message-1',
    threadId: 'thread-1',
    runId: null,
    role: 'user',
    seq: 1,
    status: 'completed',
    metadata: null,
    createdAt: now,
    parts: []
  };
}

function createArgs(
  overrides: {
    reconcileCompletedTurn?: ReconcileCompletedTurnControllerArgs['operations']['reconcileCompletedTurn'];
    refreshThreadAfterCompletedRun?: ReconcileCompletedTurnControllerArgs['operations']['refreshThreadAfterCompletedRun'];
    refreshThreads?: ReconcileCompletedTurnControllerArgs['operations']['refreshThreads'];
    getThreads?: ReconcileCompletedTurnControllerArgs['operations']['getThreads'];
    threads?: PlaygroundThreadDto[];
  } = {}
): ReconcileCompletedTurnControllerArgs {
  const reconcileCompletedTurn = overrides.reconcileCompletedTurn ?? vi.fn().mockResolvedValue(undefined);
  const refreshThreadAfterCompletedRun =
    overrides.refreshThreadAfterCompletedRun ?? vi.fn().mockResolvedValue(undefined);
  const refreshThreads = overrides.refreshThreads ?? vi.fn().mockResolvedValue(undefined);
  const actions: ReconcileCompletedTurnControllerArgs['actions'] = {
    setActiveResponseRun: vi.fn<(next: Updater<RunDto | null>) => void>(),
    setChatPhase: vi.fn<(next: Updater<ChatPhase>) => void>(),
    setError: vi.fn<(next: Updater<string | null>) => void>(),
    setLiveAssistantDraft: vi.fn<(next: Updater<LiveAssistantDraft | null>) => void>(),
    setLoadingThreadId: vi.fn<(next: Updater<string | null>) => void>(),
    setMessages: vi.fn<(next: Updater<MessageDto[]>) => void>(),
    setMessagePageInfo: vi.fn<(next: Updater<ThreadMessagesPageInfoDto | null>) => void>(),
    setOptimisticUserMessage: vi.fn<(next: Updater<MessageDto | null>) => void>(),
    setPersistingTurn: vi.fn<(next: Updater<boolean>) => void>(),
    setRecentRuns: vi.fn<(next: Updater<RunDto[]>) => void>(),
    setRecentRunsError: vi.fn<(next: Updater<string | null>) => void>(),
    setRecentRunsLoading: vi.fn<(next: Updater<boolean>) => void>(),
    setSelectedRunId: vi.fn<(next: Updater<string | null>) => void>(),
    setTimeline: vi.fn<(next: Updater<RunTimelineResponseDto | null>) => void>(),
    setTimelineError: vi.fn<(next: Updater<string | null>) => void>(),
    setTimelineLoading: vi.fn<(next: Updater<boolean>) => void>()
  };

  return {
    threadId: 'thread-1',
    preferredRunId: 'run-1',
    requestId: 3,
    state: {
      messages: [createMessage()],
      pageInfo: null
    },
    refs: {
      activeThreadIdRef: { current: 'thread-1' },
      logOpenRef: { current: false },
      reconcileRequestIdRef: { current: 0 },
      selectedRunIdRef: { current: null },
      sendRequestIdRef: { current: 3 }
    },
    actions,
    operations: {
      getThreads: overrides.getThreads ?? (() => overrides.threads ?? [createThread()]),
      isDefaultThreadTitle: (title) => title === undefined || title === null || title.startsWith('新对话'),
      refreshThreadAfterCompletedRun,
      refreshThreads,
      reconcileCompletedTurn
    }
  };
}

describe('runReconcileCompletedTurnController', () => {
  it('forwards durable reconcile arguments before refreshing surrounding thread state', async () => {
    const reconcileCompletedTurn = vi.fn().mockResolvedValue(undefined);
    const args = createArgs({ reconcileCompletedTurn });

    await runReconcileCompletedTurnController(args);

    expect(reconcileCompletedTurn).toHaveBeenCalledWith(expect.objectContaining({
      threadId: 'thread-1',
      preferredRunId: 'run-1',
      requestId: 3,
      state: {
        messages: args.state.messages,
        pageInfo: null
      },
      refs: args.refs,
      actions: args.actions
    }));
  });

  it('refreshes the generated title path for missing or default-title threads', async () => {
    const refreshThreadAfterCompletedRun = vi.fn().mockResolvedValue(undefined);
    const refreshThreads = vi.fn().mockResolvedValue(undefined);

    await runReconcileCompletedTurnController(createArgs({
      refreshThreadAfterCompletedRun,
      refreshThreads,
      threads: [createThread({ title: '新对话' })]
    }));

    expect(refreshThreadAfterCompletedRun).toHaveBeenCalledWith('thread-1');
    expect(refreshThreads).not.toHaveBeenCalled();
  });

  it('refreshes the thread list when the completed thread already has a user-facing title', async () => {
    const refreshThreadAfterCompletedRun = vi.fn().mockResolvedValue(undefined);
    const refreshThreads = vi.fn().mockResolvedValue(undefined);

    await runReconcileCompletedTurnController(createArgs({
      refreshThreadAfterCompletedRun,
      refreshThreads,
      threads: [createThread({ title: 'Existing title' })]
    }));

    expect(refreshThreadAfterCompletedRun).not.toHaveBeenCalled();
    expect(refreshThreads).toHaveBeenCalledOnce();
  });

  it('keeps title and list refresh best-effort after durable reconcile succeeds', async () => {
    const refreshThreadAfterCompletedRun = vi.fn().mockRejectedValue(new Error('title refresh failed'));
    const refreshThreads = vi.fn().mockRejectedValue(new Error('list refresh failed'));

    await expect(runReconcileCompletedTurnController(createArgs({
      refreshThreadAfterCompletedRun,
      threads: [createThread({ title: '新对话' })]
    }))).resolves.toBeUndefined();

    await expect(runReconcileCompletedTurnController(createArgs({
      refreshThreads,
      threads: [createThread({ title: 'Existing title' })]
    }))).resolves.toBeUndefined();
  });

  it('reads the latest thread list after durable reconcile settles', async () => {
    const refreshThreadAfterCompletedRun = vi.fn().mockResolvedValue(undefined);
    const refreshThreads = vi.fn().mockResolvedValue(undefined);
    let threads = [createThread({ title: 'Existing title' })];
    const reconcileCompletedTurn = vi.fn().mockImplementation(async () => {
      threads = [createThread({ title: '新对话' })];
    });

    await runReconcileCompletedTurnController(createArgs({
      getThreads: () => threads,
      reconcileCompletedTurn,
      refreshThreadAfterCompletedRun,
      refreshThreads
    }));

    expect(refreshThreadAfterCompletedRun).toHaveBeenCalledWith('thread-1');
    expect(refreshThreads).not.toHaveBeenCalled();
  });
});
