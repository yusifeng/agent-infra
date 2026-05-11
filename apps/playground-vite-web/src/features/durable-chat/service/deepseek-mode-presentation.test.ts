import type { RuntimePiMetaDto } from '@agent-infra/contracts';
import { describe, expect, it } from 'vitest';

import { buildDeepseekModePresentation, resolveDeepseekModeModelKey } from './deepseek-mode-presentation';

function createModelOptions(): RuntimePiMetaDto['modelOptions'] {
  return [
    {
      key: 'deepseek:deepseek-v4-flash',
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      label: 'DeepSeek · flash',
      description: 'Fast mode'
    },
    {
      key: 'deepseek:deepseek-v4-pro',
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      label: 'DeepSeek · pro',
      description: 'Expert mode'
    }
  ];
}

describe('deepseek mode presentation', () => {
  it('maps the selected flash key to quick mode', () => {
    const result = buildDeepseekModePresentation({
      modelOptions: createModelOptions(),
      selectedModelKey: 'deepseek:deepseek-v4-flash'
    });

    expect(result.flashOption?.model).toBe('deepseek-v4-flash');
    expect(result.proOption?.model).toBe('deepseek-v4-pro');
    expect(result.selectedMode).toBe('quick');
  });

  it('maps the selected pro key to expert mode', () => {
    const result = buildDeepseekModePresentation({
      modelOptions: createModelOptions(),
      selectedModelKey: 'deepseek:deepseek-v4-pro'
    });

    expect(result.selectedMode).toBe('expert');
  });

  it('degrades safely when only one deepseek model is available', () => {
    const result = buildDeepseekModePresentation({
      modelOptions: [createModelOptions()[0]!],
      selectedModelKey: 'deepseek:deepseek-v4-flash'
    });

    expect(result.flashOption?.model).toBe('deepseek-v4-flash');
    expect(result.proOption).toBeNull();
    expect(resolveDeepseekModeModelKey({ mode: 'expert', modelOptions: [createModelOptions()[0]!] })).toBeNull();
  });
});
