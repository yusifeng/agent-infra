import type { RuntimePiMetaDto } from '@agent-infra/contracts';

type ModelOption = RuntimePiMetaDto['modelOptions'][number];

export type DeepseekLandingMode = 'quick' | 'expert';

export type DeepseekModePresentation = {
  flashOption: ModelOption | null;
  proOption: ModelOption | null;
  selectedMode: DeepseekLandingMode | null;
};

export function buildDeepseekModePresentation(input: {
  modelOptions: RuntimePiMetaDto['modelOptions'];
  selectedModelKey: string;
}): DeepseekModePresentation {
  const { modelOptions, selectedModelKey } = input;
  const flashOption = modelOptions.find((option) => option.provider === 'deepseek' && option.model === 'deepseek-v4-flash') ?? null;
  const proOption = modelOptions.find((option) => option.provider === 'deepseek' && option.model === 'deepseek-v4-pro') ?? null;

  if (selectedModelKey === flashOption?.key) {
    return {
      flashOption,
      proOption,
      selectedMode: 'quick'
    };
  }

  if (selectedModelKey === proOption?.key) {
    return {
      flashOption,
      proOption,
      selectedMode: 'expert'
    };
  }

  return {
    flashOption,
    proOption,
    selectedMode: null
  };
}

export function resolveDeepseekModeModelKey(input: {
  mode: DeepseekLandingMode;
  modelOptions: RuntimePiMetaDto['modelOptions'];
}): string | null {
  const presentation = buildDeepseekModePresentation({
    modelOptions: input.modelOptions,
    selectedModelKey: ''
  });

  return input.mode === 'quick' ? presentation.flashOption?.key ?? null : presentation.proOption?.key ?? null;
}
