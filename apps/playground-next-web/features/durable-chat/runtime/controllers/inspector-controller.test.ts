import type { MessageDto, RunDto, RunTimelineResponseDto } from '@agent-infra/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  loadInspectorController,
  loadRunTimelineController,
  persistSelectedRunSelection,
  resetInspectorControllerState
} from './inspector-controller';

type Updater<T> = T | ((current: T) => T);

function createMessage(): MessageDto {
  return {
    id: 'message-1',
    threadId: 'thread-1',
    runId: null,
    role: 'user',
    seq: 1,
    status: 'completed',
    metadata: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    parts: []
  };
}

function createActions() {
  return {
    setRecentRuns: vi.fn<(next: Updater<RunDto[]>) => void>(),
    setRecentRunsError: vi.fn<(next: Updater<string | null>) => void>(),
    setRecentRunsLoading: vi.fn<(next: Updater<boolean>) => void>(),
    setSelectedRunId: vi.fn<(next: Updater<string | null>) => void>(),
    setTimeline: vi.fn<(next: Updater<RunTimelineResponseDto | null>) => void>(),
    setTimelineError: vi.fn<(next: Updater<string | null>) => void>(),
    setTimelineLoading: vi.fn<(next: Updater<boolean>) => void>()
  };
}

describe('inspector controller', () => {
  it('does not persist selected run until persistence is ready', () => {
    const persistSelectedRunId = vi.fn();

    const persisted = persistSelectedRunSelection({
      activeThreadId: 'thread-1',
      selectedRunId: 'run-1',
      refs: {
        logOpenRef: { current: true },
        runSelectionPersistenceReadyRef: { current: false }
      },
      operations: {
        persistSelectedRunId
      }
    });

    expect(persisted).toBe(false);
    expect(persistSelectedRunId).not.toHaveBeenCalled();
  });

  it('does not write a null selected run while the inspector is closed', () => {
    const persistSelectedRunId = vi.fn();

    const persisted = persistSelectedRunSelection({
      activeThreadId: 'thread-1',
      selectedRunId: null,
      refs: {
        logOpenRef: { current: false },
        runSelectionPersistenceReadyRef: { current: true }
      },
      operations: {
        persistSelectedRunId
      }
    });

    expect(persisted).toBe(false);
    expect(persistSelectedRunId).not.toHaveBeenCalled();
  });

  it('persists selected run after the inspector selection has been initialized', () => {
    const persistSelectedRunId = vi.fn();

    const persisted = persistSelectedRunSelection({
      activeThreadId: 'thread-1',
      selectedRunId: 'run-1',
      refs: {
        logOpenRef: { current: false },
        runSelectionPersistenceReadyRef: { current: true }
      },
      operations: {
        persistSelectedRunId
      }
    });

    expect(persisted).toBe(true);
    expect(persistSelectedRunId).toHaveBeenCalledWith('thread-1', 'run-1');
  });

  it('delegates inspector reset without exposing center chat state to the reset flow', () => {
    const resetLogInspectorState = vi.fn();
    const actions = createActions();
    const refs = {
      logInspectorAbortControllerRef: { current: null },
      logInspectorRequestIdRef: { current: 0 },
      timelineAbortControllerRef: { current: null },
      timelineRequestIdRef: { current: 0 }
    };

    resetInspectorControllerState({
      options: { clearSelectedRun: false },
      refs,
      actions,
      operations: {
        resetLogInspectorState
      }
    });

    expect(resetLogInspectorState).toHaveBeenCalledWith({
      options: { clearSelectedRun: false },
      refs,
      actions
    });
  });

  it('delegates timeline loading through inspector-only refs and actions', async () => {
    const loadRunTimeline = vi.fn().mockResolvedValue(undefined);
    const actions = createActions();
    const refs = {
      selectedRunIdRef: { current: null as string | null },
      timelineAbortControllerRef: { current: null },
      timelineRequestIdRef: { current: 0 }
    };

    await loadRunTimelineController({
      runId: 'run-1',
      options: { preserveExisting: true },
      refs,
      actions,
      operations: {
        loadRunTimeline
      }
    });

    expect(loadRunTimeline).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run-1',
      options: { preserveExisting: true },
      refs,
      actions: expect.objectContaining({
        setSelectedRunId: actions.setSelectedRunId,
        setTimeline: actions.setTimeline,
        setTimelineError: actions.setTimelineError,
        setTimelineLoading: actions.setTimelineLoading
      })
    }));
  });

  it('loads inspector data without requiring message loading or live draft actions', async () => {
    const loadRunTimeline = vi.fn().mockResolvedValue(undefined);
    const loadLogInspectorFlow = vi.fn().mockResolvedValue('run-1');
    const actions = createActions();
    const refs = {
      activeThreadIdRef: { current: 'thread-1' as string | null },
      logInspectorAbortControllerRef: { current: null },
      logInspectorRequestIdRef: { current: 0 }
    };
    const messagesSnapshot = [createMessage()];

    const selectedRunId = await loadInspectorController({
      threadId: 'thread-1',
      messagesSnapshot,
      options: {
        preferredRunId: 'run-1',
        preserveExistingTimeline: true
      },
      refs,
      actions,
      operations: {
        loadRunTimeline,
        loadLogInspectorFlow
      }
    });

    expect(selectedRunId).toBe('run-1');
    expect(loadLogInspectorFlow).toHaveBeenCalledWith({
      threadId: 'thread-1',
      messagesSnapshot,
      options: {
        preferredRunId: 'run-1',
        preserveExistingTimeline: true
      },
      refs,
      actions,
      operations: {
        loadRunTimeline
      }
    });
  });
});
