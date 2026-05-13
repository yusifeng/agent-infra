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
});
