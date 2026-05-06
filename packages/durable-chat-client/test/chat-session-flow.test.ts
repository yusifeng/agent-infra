import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runRefreshMeta } from '../src/runtime/chat-session-flow';

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

  it('falls back to flash when the current model is no longer available', async () => {
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

    expect(selectedModelKey).toBe('deepseek:deepseek-v4-flash');
  });
});
