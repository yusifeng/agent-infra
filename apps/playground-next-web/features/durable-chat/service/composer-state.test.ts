import type { RuntimePiMetaDto } from '@agent-infra/contracts';
import { describe, expect, it } from 'vitest';

import { buildComposerState } from '@/features/durable-chat/service/composer-state';

const meta: RuntimePiMetaDto = {
  dbMode: 'sqlite',
  dbConnection: 'memory',
  runtimeConfigured: true,
  runtimeProvider: 'openai',
  runtimeModel: 'gpt-4.1',
  defaultModelKey: 'deepseek-chat',
  runtimeConfigError: null,
  modelOptions: [
    {
      model: 'deepseek-chat',
      key: 'deepseek-chat',
      label: 'DeepSeek Chat',
      description: 'DeepSeek model',
      provider: 'deepseek'
    },
    {
      model: 'gpt-4.1',
      key: 'openai-chat',
      label: 'OpenAI Chat',
      description: 'OpenAI model',
      provider: 'openai'
    }
  ]
};

describe('buildComposerState', () => {
  it('enables toggles and submit for a ready deepseek composer', () => {
    expect(
      buildComposerState({
        draft: 'search this',
        isResponding: false,
        sendDisabled: false,
        inputLocked: false,
        selectedThinkingEnabled: true,
        selectedModelOption: meta.modelOptions[0] ?? null,
        meta
      })
    ).toEqual({
      hasDraftValue: true,
      isDeepseekModel: true,
      searchToggleDisabled: false,
      thinkingToggleDisabled: false,
      reasoningSelectDisabled: false,
      textareaDisabled: false,
      canSubmit: true
    });
  });

  it('disables controls when runtime or model selection is unavailable', () => {
    expect(
      buildComposerState({
        draft: 'search this',
        isResponding: false,
        sendDisabled: true,
        inputLocked: false,
        selectedThinkingEnabled: false,
        selectedModelOption: null,
        meta: { ...meta, runtimeConfigured: false }
      })
    ).toEqual({
      hasDraftValue: true,
      isDeepseekModel: false,
      searchToggleDisabled: true,
      thinkingToggleDisabled: true,
      reasoningSelectDisabled: true,
      textareaDisabled: true,
      canSubmit: false
    });
  });

  it('keeps submit available while responding and locks interactive toggles', () => {
    expect(
      buildComposerState({
        draft: '',
        isResponding: true,
        sendDisabled: true,
        inputLocked: true,
        selectedThinkingEnabled: false,
        selectedModelOption: meta.modelOptions[1] ?? null,
        meta
      })
    ).toEqual({
      hasDraftValue: false,
      isDeepseekModel: false,
      searchToggleDisabled: true,
      thinkingToggleDisabled: true,
      reasoningSelectDisabled: true,
      textareaDisabled: true,
      canSubmit: true
    });
  });
});
