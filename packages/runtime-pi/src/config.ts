import type { RuntimePiConfig, RuntimePiInput, RuntimePiModelOption, RuntimePiProvider } from './types.js';

const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

const RUNTIME_PI_MODEL_OPTIONS: RuntimePiModelOption[] = [
  {
    key: 'deepseek:deepseek-chat',
    provider: 'deepseek',
    model: 'deepseek-chat',
    label: 'DeepSeek · deepseek-chat',
    description: 'DeepSeek chat model via the official OpenAI-compatible endpoint.'
  },
  {
    key: 'deepseek:deepseek-reasoner',
    provider: 'deepseek',
    model: 'deepseek-reasoner',
    label: 'DeepSeek · deepseek-reasoner',
    description: 'DeepSeek reasoning model via the official OpenAI-compatible endpoint.'
  },
  {
    key: 'openai:gpt-4o-mini',
    provider: 'openai',
    model: 'gpt-4o-mini',
    label: 'OpenAI · gpt-4o-mini',
    description: 'Fast OpenAI baseline for durable runtime smoke tests.'
  }
];

function findModelOption(provider: RuntimePiProvider, model: string) {
  return RUNTIME_PI_MODEL_OPTIONS.find((option) => option.provider === provider && option.model === model);
}

function resolvePreferredOption(preferred: Pick<RuntimePiInput, 'provider' | 'model'> = {}) {
  if (!preferred.provider && !preferred.model) {
    return null;
  }

  if (preferred.provider && preferred.model) {
    const option = findModelOption(preferred.provider as RuntimePiProvider, preferred.model);
    if (option) {
      return option;
    }

    if (preferred.provider === 'openai') {
      return {
        key: `openai:${preferred.model}`,
        provider: 'openai',
        model: preferred.model,
        label: `OpenAI · ${preferred.model}`,
        description: 'OpenAI model provided explicitly.'
      } satisfies RuntimePiModelOption;
    }

    throw new Error(`Unsupported runtime-pi model selection: ${preferred.provider}:${preferred.model}`);
  }

  if (preferred.model) {
    const matches = RUNTIME_PI_MODEL_OPTIONS.filter((option) => option.model === preferred.model);
    if (matches.length === 1) {
      return matches[0];
    }

    throw new Error(`runtime-pi could not infer a provider for model ${preferred.model}.`);
  }

  throw new Error('runtime-pi requires both provider and model when selecting a provider explicitly.');
}

export function listRuntimePiModelOptions(): RuntimePiModelOption[] {
  return RUNTIME_PI_MODEL_OPTIONS.map((option) => ({ ...option }));
}

export function listAvailableRuntimePiModelOptionsFromEnv(): RuntimePiModelOption[] {
  const hasDeepseek = Boolean(process.env.DEEPSEEK_API_KEY?.trim());
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY?.trim());
  const openAiEnvModel = process.env.OPENAI_MODEL?.trim();

  const options = RUNTIME_PI_MODEL_OPTIONS.filter((option) => {
    if (option.provider === 'deepseek') {
      return hasDeepseek;
    }

    return hasOpenAi;
  }).map((option) => ({ ...option }));

  if (hasOpenAi && openAiEnvModel && !options.some((option) => option.provider === 'openai' && option.model === openAiEnvModel)) {
    options.unshift({
      key: `openai:${openAiEnvModel}`,
      provider: 'openai',
      model: openAiEnvModel,
      label: `OpenAI · ${openAiEnvModel}`,
      description: 'OpenAI model selected from OPENAI_MODEL.'
    });
  }

  return options;
}

export function resolveRuntimePiConfigFromEnv(preferred: Pick<RuntimePiInput, 'provider' | 'model'> = {}): RuntimePiConfig {
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const preferredOption = resolvePreferredOption(preferred);

  if (preferredOption) {
    if (preferredOption.provider === 'deepseek') {
      if (!deepseekKey) {
        throw new Error(`runtime-pi requires DEEPSEEK_API_KEY for ${preferredOption.model}.`);
      }

      return {
        provider: 'deepseek',
        model: preferredOption.model,
        apiKey: deepseekKey
      };
    }

    if (!openAiKey) {
      throw new Error(`runtime-pi requires OPENAI_API_KEY for ${preferredOption.model}.`);
    }

    return {
      provider: 'openai',
      model: preferredOption.model,
      apiKey: openAiKey
    };
  }

  if (deepseekKey) {
    return {
      provider: 'deepseek',
      model: DEFAULT_DEEPSEEK_MODEL,
      apiKey: deepseekKey
    };
  }

  if (openAiKey) {
    return {
      provider: 'openai',
      model: process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
      apiKey: openAiKey
    };
  }

  throw new Error('runtime-pi requires DEEPSEEK_API_KEY or OPENAI_API_KEY.');
}
