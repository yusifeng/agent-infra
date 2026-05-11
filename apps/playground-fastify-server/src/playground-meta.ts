import type { DurableChatDbInfo } from '@agent-infra/durable-chat-server';

import {
  listAvailableRuntimePiModelOptionsFromEnv,
  resolveRuntimePiConfigFromEnv
} from '@agent-infra/runtime-pi/config';

export type PlaygroundDbInfo = {
  mode: string;
  connectionString: string;
};

type RuntimeSelectionPreference = {
  provider?: string;
  model?: string;
};

export type PlaygroundMeta = {
  configured: boolean;
  provider: string;
  model: string;
  defaultModelKey: string | null;
  modelOptions: ReturnType<typeof listAvailableRuntimePiModelOptionsFromEnv>;
  configError: string | null;
  dbInfo: PlaygroundDbInfo;
};

function filterDemoModelOptions(
  modelOptions: ReturnType<typeof listAvailableRuntimePiModelOptionsFromEnv>
) {
  const deepseekOptions = modelOptions.filter((option) => option.provider === 'deepseek');
  return deepseekOptions.length > 0 ? deepseekOptions : modelOptions;
}

export function toPlaygroundDbInfo(dbInfo: DurableChatDbInfo): PlaygroundDbInfo {
  return {
    mode: dbInfo.mode,
    connectionString: dbInfo.connectionString
  };
}

export function getPlaygroundMeta(
  preferred: RuntimeSelectionPreference = {},
  dbInfo: PlaygroundDbInfo
): PlaygroundMeta {
  const modelOptions = filterDemoModelOptions(listAvailableRuntimePiModelOptionsFromEnv());

  try {
    const runtime = resolveRuntimePiConfigFromEnv(preferred);
    return {
      configured: true,
      provider: runtime.provider,
      model: runtime.model,
      defaultModelKey: `${runtime.provider}:${runtime.model}`,
      modelOptions,
      configError: null,
      dbInfo
    };
  } catch (error) {
    return {
      configured: false,
      provider: modelOptions[0]?.provider ?? 'deepseek',
      model: modelOptions[0]?.model ?? 'deepseek-v4-flash',
      defaultModelKey: modelOptions[0]?.key ?? null,
      modelOptions,
      configError: error instanceof Error ? error.message : 'Unknown runtime-pi configuration error',
      dbInfo
    };
  }
}
