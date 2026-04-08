import {
  createDbConfigFromEnv,
  DrizzleMessageRepository,
  DrizzleRunRepository,
  DrizzleThreadRepository,
  DrizzleToolInvocationRepository,
  SqliteMessageRepository,
  SqliteRunRepository,
  SqliteThreadRepository,
  SqliteToolInvocationRepository
} from '@agent-infra/db';
import { resolveRuntimeAiConfigFromEnv } from '@agent-infra/runtime-ai-sdk';

const dbConfig = createDbConfigFromEnv();

export const runtimeInfo = {
  dbMode: dbConfig.mode,
  dbConnection: dbConfig.connectionString,
  ai: resolveRuntimeAiConfigFromEnv()
};

export const dbReady = dbConfig.initialize();

export const repos =
  dbConfig.mode === 'sqlite'
    ? {
        threadRepo: new SqliteThreadRepository(dbConfig.db),
        runRepo: new SqliteRunRepository(dbConfig.db),
        messageRepo: new SqliteMessageRepository(dbConfig.db),
        toolRepo: new SqliteToolInvocationRepository(dbConfig.db)
      }
    : {
        threadRepo: new DrizzleThreadRepository(dbConfig.db),
        runRepo: new DrizzleRunRepository(dbConfig.db),
        messageRepo: new DrizzleMessageRepository(dbConfig.db),
        toolRepo: new DrizzleToolInvocationRepository(dbConfig.db)
      };
