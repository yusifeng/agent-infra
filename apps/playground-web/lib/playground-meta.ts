import path from 'node:path';

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

export function getPlaygroundDbInfo(): PlaygroundDbInfo {
  if (process.env.DATABASE_URL) {
    return {
      mode: 'postgres',
      connectionString: process.env.DATABASE_URL
    };
  }

  const sqlitePath = path.resolve(process.cwd(), process.env.SQLITE_PATH ?? './local.db');

  return {
    mode: 'sqlite',
    connectionString: `file:${sqlitePath}`
  };
}

export function getPlaygroundMeta(
  preferred: RuntimeSelectionPreference = {},
  dbInfo: PlaygroundDbInfo = getPlaygroundDbInfo()
): PlaygroundMeta {
  const modelOptions = listAvailableRuntimePiModelOptionsFromEnv();

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
      model: modelOptions[0]?.model ?? 'deepseek-chat',
      defaultModelKey: modelOptions[0]?.key ?? null,
      modelOptions,
      configError: error instanceof Error ? error.message : 'Unknown runtime-pi configuration error',
      dbInfo
    };
  }
}
