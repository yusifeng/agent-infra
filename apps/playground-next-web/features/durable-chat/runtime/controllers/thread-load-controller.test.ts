import type { MessageDto, RunDto, ThreadMessagesPageInfoDto } from '@agent-infra/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  applyThreadLoadTimelineDefaults,
  runActivateThreadController,
  runLoadThreadMessagesController
} from './thread-load-controller';
import type { ChatPhase, DurableRecoveryState } from '@/features/durable-chat/types/runtime';

type Updater<T> = T | ((current: T) => T);

function createMessage(id: string): MessageDto {
  return {
    id,
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

function createRun(): RunDto {
  return {
    id: 'run-1',
    threadId: 'thread-1',
    triggerMessageId: null,
    provider: 'openai',
    model: 'gpt-4o-mini',
    status: 'running',
    usage: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z'
  };
}

function createPageInfo(): ThreadMessagesPageInfoDto {
  return {
    hasOlder: false,
    hasNewer: false,
    startCursor: 'cursor-1',
    endCursor: 'cursor-1'
  };
}

function resolveUpdater<T>(value: Updater<T>, current: T) {
  return typeof value === 'function' ? (value as (current: T) => T)(current) : value;
}

describe('thread load controller', () => {
  it('defaults thread-load timeline flags from inspector open state without overwriting explicit options', () => {
    expect(applyThreadLoadTimelineDefaults({ preferredRunId: 'run-1' }, true)).toEqual({
      preferredRunId: 'run-1',
      preserveExistingTimeline: true,
      skipTimelineReload: true
    });

    expect(applyThreadLoadTimelineDefaults({ preserveExistingTimeline: false }, true)).toEqual({
      preserveExistingTimeline: false,
      skipTimelineReload: true
    });
  });

  it('activates a thread through the durable flow and applies timeline defaults to message loading', async () => {
    const activeThreadIdRef = { current: null as string | null };
    const shouldAutoScrollRef = { current: false };
    const loadThreadMessages = vi.fn().mockResolvedValue({ ok: true, restoredRunId: 'run-1' });
    let recoveryState: DurableRecoveryState = { phase: 'idle', message: null };

    const restoredRunId = await runActivateThreadController({
      threadId: 'thread-1',
      options: {
        preferredRunId: 'run-1',
        recoveryMode: 'initial-thread'
      },
      refs: {
        activeThreadIdRef,
        logOpenRef: { current: true },
        shouldAutoScrollRef
      },
      actions: {
        setActiveThreadId: vi.fn((next: Updater<string | null>) => {
          activeThreadIdRef.current = resolveUpdater(next, activeThreadIdRef.current);
        }),
        setDurableRecoveryState: vi.fn((next: Updater<DurableRecoveryState>) => {
          recoveryState = resolveUpdater(next, recoveryState);
        })
      },
      operations: {
        loadThreadMessages
      }
    });

    expect(restoredRunId).toBe('run-1');
    expect(activeThreadIdRef.current).toBe('thread-1');
    expect(shouldAutoScrollRef.current).toBe(true);
    expect(recoveryState).toEqual({ phase: 'restored', message: null });
    expect(loadThreadMessages).toHaveBeenCalledWith('thread-1', {
      preferredRunId: 'run-1',
      recoveryMode: 'initial-thread',
      preserveExistingTimeline: true,
      skipTimelineReload: true
    });
  });

  it('hydrates messages and applies transcript state without requiring the hook to duplicate apply logic', async () => {
    const messages = [createMessage('message-1')];
    const pageInfo = createPageInfo();
    const run = createRun();
    const state = {
      activeResponseRun: null as RunDto | null,
      chatPhase: 'thinking' as ChatPhase,
      error: 'old error' as string | null,
      liveAssistantDraft: null,
      messages: [] as MessageDto[],
      pageInfo: null as ThreadMessagesPageInfoDto | null,
      selectedRunId: null as string | null
    };

    const result = await runLoadThreadMessagesController({
      threadId: 'thread-1',
      refs: {
        activeThreadIdRef: { current: 'thread-1' },
        logOpenRef: { current: false },
        messagesAbortControllerRef: { current: null },
        messagesRequestIdRef: { current: 0 }
      },
      actions: {
        setActiveResponseRun: vi.fn((next: Updater<RunDto | null>) => {
          state.activeResponseRun = resolveUpdater(next, state.activeResponseRun);
        }),
        setChatPhase: vi.fn((next: Updater<ChatPhase>) => {
          state.chatPhase = resolveUpdater(next, state.chatPhase);
        }),
        setError: vi.fn((next: Updater<string | null>) => {
          state.error = resolveUpdater(next, state.error);
        }),
        setHistoryLoading: vi.fn(),
        setLiveAssistantDraft: vi.fn((next) => {
          state.liveAssistantDraft = resolveUpdater(next, state.liveAssistantDraft);
        }),
        setLoadingMessages: vi.fn(),
        setMessagePageInfo: vi.fn((next: Updater<ThreadMessagesPageInfoDto | null>) => {
          state.pageInfo = resolveUpdater(next, state.pageInfo);
        }),
        setMessages: vi.fn((next: Updater<MessageDto[]>) => {
          state.messages = resolveUpdater(next, state.messages);
        }),
        setOptimisticUserMessage: vi.fn(),
        setRecentRuns: vi.fn(),
        setRecentRunsError: vi.fn(),
        setRecentRunsLoading: vi.fn(),
        setSelectedRunId: vi.fn((next: Updater<string | null>) => {
          state.selectedRunId = resolveUpdater(next, state.selectedRunId);
        })
      },
      operations: {
        hydrateTranscript: vi.fn().mockResolvedValue({
          messages,
          pageInfo,
          activeResponseRun: run
        }),
        loadLogInspector: vi.fn(),
        resetLogInspectorState: vi.fn()
      }
    });

    expect(result).toEqual({ ok: true, restoredRunId: null });
    expect(state.messages).toEqual(messages);
    expect(state.pageInfo).toEqual(pageInfo);
    expect(state.activeResponseRun).toEqual(run);
    expect(state.error).toBeNull();
  });
});
