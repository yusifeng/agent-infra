import {
  createDbConfigFromEnv,
  DrizzleMessageRepository,
  DrizzleRunEventRepository,
  DrizzleRunRepository,
  DrizzleThreadRepository,
  DrizzleToolInvocationRepository,
  SqliteMessageRepository,
  SqliteRunEventRepository,
  SqliteRunRepository,
  SqliteThreadRepository,
  SqliteToolInvocationRepository
} from '@agent-infra/db';
import { listAvailableRuntimePiModelOptionsFromEnv, resolveRuntimePiConfigFromEnv, type RuntimePiInput } from '@agent-infra/runtime-pi';

const dbConfig = createDbConfigFromEnv();

export const dbReady = dbConfig.initialize();

export const runtimePiRepos =
  dbConfig.mode === 'sqlite'
    ? {
        threadRepo: new SqliteThreadRepository(dbConfig.db),
        runRepo: new SqliteRunRepository(dbConfig.db),
        messageRepo: new SqliteMessageRepository(dbConfig.db),
        toolRepo: new SqliteToolInvocationRepository(dbConfig.db),
        runEventRepo: new SqliteRunEventRepository(dbConfig.db)
      }
    : {
        threadRepo: new DrizzleThreadRepository(dbConfig.db),
        runRepo: new DrizzleRunRepository(dbConfig.db),
        messageRepo: new DrizzleMessageRepository(dbConfig.db),
        toolRepo: new DrizzleToolInvocationRepository(dbConfig.db),
        runEventRepo: new DrizzleRunEventRepository(dbConfig.db)
      };

export function getRuntimePiMeta(preferred: Pick<RuntimePiInput, 'provider' | 'model'> = {}) {
  const modelOptions = listAvailableRuntimePiModelOptionsFromEnv();

  try {
    const runtime = resolveRuntimePiConfigFromEnv(preferred);
    return {
      configured: true,
      provider: runtime.provider,
      model: runtime.model,
      defaultModelKey: `${runtime.provider}:${runtime.model}`,
      modelOptions,
      configError: null
    };
  } catch (error) {
    return {
      configured: false,
      provider: modelOptions[0]?.provider ?? 'deepseek',
      model: modelOptions[0]?.model ?? 'deepseek-chat',
      defaultModelKey: modelOptions[0]?.key ?? null,
      modelOptions,
      configError: error instanceof Error ? error.message : 'Unknown runtime-pi configuration error'
    };
  }
}

export const runtimePiDbInfo = {
  mode: dbConfig.mode,
  connectionString: dbConfig.connectionString
};
