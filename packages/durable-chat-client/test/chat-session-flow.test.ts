import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runInitializeRuntime, runRefreshMeta } from '../src/runtime/chat-session-flow';

const { fetchRuntimeMetaResponse } = vi.hoisted(() => ({
  fetchRuntimeMetaResponse: vi.fn()
}));

vi.mock('../src/repo/chat-api.js', () => ({
  fetchRuntimeMetaResponse
}));

describe('chat-session-flow', () => {
  beforeEach(() => {
    fetchRuntimeMetaResponse.mockReset();
  });

  it('preserves the current selected model when it is still available', async () => {
    fetchRuntimeMetaResponse.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        runtimeConfigured: true,
        runtimeProvider: 'deepseek',
        runtimeModel: 'deepseek-v4-pro',
        defaultModelKey: 'deepseek:deepseek-v4-pro',
        modelOptions: [
          {
            key: 'deepseek:deepseek-v4-flash',
            provider: 'deepseek',
            model: 'deepseek-v4-flash',
            label: 'flash',
            description: 'flash'
          },
          {
            key: 'deepseek:deepseek-v4-pro',
            provider: 'deepseek',
            model: 'deepseek-v4-pro',
            label: 'pro',
            description: 'pro'
          }
        ]
      }
    });

    let selectedModelKey = 'deepseek:deepseek-v4-pro';

    await runRefreshMeta({
      actions: {
        setError: vi.fn(),
        setMeta: vi.fn(),
        setSelectedModelKey: (next) => {
          selectedModelKey = typeof next === 'function' ? next(selectedModelKey) : next;
        }
      }
    });

    expect(selectedModelKey).toBe('deepseek:deepseek-v4-pro');
  });

  it('falls back to the default model when the current model is no longer available', async () => {
    fetchRuntimeMetaResponse.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        runtimeConfigured: true,
        runtimeProvider: 'deepseek',
        runtimeModel: 'deepseek-v4-flash',
        defaultModelKey: 'deepseek:deepseek-v4-pro',
        modelOptions: [
          {
            key: 'deepseek:deepseek-v4-flash',
            provider: 'deepseek',
            model: 'deepseek-v4-flash',
            label: 'flash',
            description: 'flash'
          },
          {
            key: 'deepseek:deepseek-v4-pro',
            provider: 'deepseek',
            model: 'deepseek-v4-pro',
            label: 'pro',
            description: 'pro'
          }
        ]
      }
    });

    let selectedModelKey = 'deepseek:missing-model';

    await runRefreshMeta({
      actions: {
        setError: vi.fn(),
        setMeta: vi.fn(),
        setSelectedModelKey: (next) => {
          selectedModelKey = typeof next === 'function' ? next(selectedModelKey) : next;
        }
      }
    });

    expect(selectedModelKey).toBe('deepseek:deepseek-v4-pro');
  });

  it('respects a non-DeepSeek default model when DeepSeek options are also available', async () => {
    fetchRuntimeMetaResponse.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        runtimeConfigured: true,
        runtimeProvider: 'openai',
        runtimeModel: 'gpt-5.4',
        defaultModelKey: 'openai:gpt-5.4',
        modelOptions: [
          {
            key: 'openai:gpt-5.4',
            provider: 'openai',
            model: 'gpt-5.4',
            label: 'GPT-5.4',
            description: 'OpenAI model'
          },
          {
            key: 'deepseek:deepseek-v4-flash',
            provider: 'deepseek',
            model: 'deepseek-v4-flash',
            label: 'flash',
            description: 'flash'
          }
        ]
      }
    });

    let selectedModelKey = '';

    await runRefreshMeta({
      actions: {
        setError: vi.fn(),
        setMeta: vi.fn(),
        setSelectedModelKey: (next) => {
          selectedModelKey = typeof next === 'function' ? next(selectedModelKey) : next;
        }
      }
    });

    expect(selectedModelKey).toBe('openai:gpt-5.4');
  });

  it('starts direct-thread activation without waiting for thread list refresh to finish', async () => {
    let resolveRefreshThreads!: (threads: []) => void;
    const refreshThreads = vi.fn(
      () =>
        new Promise<[]>((resolve) => {
          resolveRefreshThreads = resolve;
        })
    );
    const activateThread = vi.fn().mockResolvedValue('thread-1');

    const initialization = runInitializeRuntime({
      initialThreadId: 'thread-1',
      refs: {
        runSelectionPersistenceReadyRef: { current: false }
      },
      actions: {
        setDurableRecoveryState: vi.fn(),
        setError: vi.fn()
      },
      operations: {
        activateThread,
        getPreferredRunId: vi.fn().mockReturnValue('run-1'),
        isCurrentRequest: vi.fn().mockReturnValue(true),
        refreshThreads,
        resetDraftThreadState: vi.fn()
      }
    });

    await Promise.resolve();

    expect(refreshThreads).toHaveBeenCalledTimes(1);
    expect(activateThread).toHaveBeenCalledWith('thread-1', {
      preferredRunId: 'run-1',
      recoveryMode: 'initial-thread',
      isCurrentRequest: expect.any(Function)
    });

    resolveRefreshThreads([]);
    await initialization;
  });

  it('does not activate an initial thread when the bootstrap request is already stale', async () => {
    let resolveRefreshThreads!: (threads: []) => void;
    const refreshThreads = vi.fn(
      () =>
        new Promise<[]>((resolve) => {
          resolveRefreshThreads = resolve;
        })
    );
    const activateThread = vi.fn().mockResolvedValue('thread-1');

    const initialization = runInitializeRuntime({
      initialThreadId: 'thread-1',
      refs: {
        runSelectionPersistenceReadyRef: { current: false }
      },
      actions: {
        setDurableRecoveryState: vi.fn(),
        setError: vi.fn()
      },
      operations: {
        activateThread,
        getPreferredRunId: vi.fn().mockReturnValue('run-1'),
        isCurrentRequest: vi.fn().mockReturnValue(false),
        refreshThreads,
        resetDraftThreadState: vi.fn()
      }
    });

    await Promise.resolve();

    expect(refreshThreads).toHaveBeenCalledTimes(1);
    expect(activateThread).not.toHaveBeenCalled();

    resolveRefreshThreads([]);
    await initialization;

    expect(activateThread).not.toHaveBeenCalled();
  });

  it('keeps draft reset after thread list refresh when no initial thread is selected', async () => {
    const events: string[] = [];
    let resolveRefreshThreads!: (threads: []) => void;
    const refreshThreads = vi.fn(
      () =>
        new Promise<[]>((resolve) => {
          events.push('refresh:start');
          resolveRefreshThreads = (threads) => {
            events.push('refresh:finish');
            resolve(threads);
          };
        })
    );
    const resetDraftThreadState = vi.fn(() => {
      events.push('reset');
    });

    const initialization = runInitializeRuntime({
      initialThreadId: null,
      refs: {
        runSelectionPersistenceReadyRef: { current: false }
      },
      actions: {
        setDurableRecoveryState: vi.fn(),
        setError: vi.fn()
      },
      operations: {
        activateThread: vi.fn(),
        getPreferredRunId: vi.fn(),
        isCurrentRequest: vi.fn().mockReturnValue(true),
        refreshThreads,
        resetDraftThreadState
      }
    });

    await Promise.resolve();

    expect(resetDraftThreadState).not.toHaveBeenCalled();
    resolveRefreshThreads([]);
    await initialization;

    expect(events).toEqual(['refresh:start', 'refresh:finish', 'reset']);
  });
});
