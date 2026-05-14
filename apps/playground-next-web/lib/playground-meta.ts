import path from 'node:path';

import { resolveDbModeOverrideFromEnv } from '@agent-infra/db';
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
  const flashOption = modelOptions.find((option) => option.provider === 'deepseek' && option.model === 'deepseek-v4-flash');
  const proOption = modelOptions.find((option) => option.provider === 'deepseek' && option.model === 'deepseek-v4-pro');
  return flashOption && proOption ? [flashOption, proOption] : modelOptions;
}

export function getPlaygroundDbInfo(): PlaygroundDbInfo {
  const forcedMode = resolveDbModeOverrideFromEnv();
  if (forcedMode === 'sqlite') {
    return getSqliteDbInfo();
  }

  if (forcedMode === 'turso') {
    return {
      mode: 'turso',
      connectionString: process.env.TURSO_DATABASE_URL ?? ''
    };
  }

  if (forcedMode === 'postgres') {
    return {
      mode: 'postgres',
      connectionString: process.env.DATABASE_URL ?? ''
    };
  }

  if (process.env.TURSO_DATABASE_URL) {
    return {
      mode: 'turso',
      connectionString: process.env.TURSO_DATABASE_URL
    };
  }

  if (process.env.DATABASE_URL) {
    return {
      mode: 'postgres',
      connectionString: process.env.DATABASE_URL
    };
  }

  return getSqliteDbInfo();
}

function getSqliteDbInfo(): PlaygroundDbInfo {
  const sqlitePath = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.SQLITE_PATH ?? './local.db');

  return {
    mode: 'sqlite',
    connectionString: `file:${sqlitePath}`
  };
}

export function getPlaygroundMeta(
  preferred: RuntimeSelectionPreference = {},
  dbInfo: PlaygroundDbInfo = getPlaygroundDbInfo()
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
