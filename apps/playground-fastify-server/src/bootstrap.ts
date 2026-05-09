import { createDbConfigFromEnv } from '@agent-infra/db';

import { loadPlaygroundEnv } from './env.js';
import { bootstrapPlaygroundAuthSchema } from './features/auth/repo/schema.js';
import { bootstrapPlaygroundThreadCatalog } from './features/thread-catalog/repo/schema.js';

export type PlaygroundDbBootstrapResult = {
  connectionString: string;
  dbMode: 'sqlite' | 'turso' | 'postgres';
  envFiles: string[];
};

export async function bootstrapPlaygroundDb(options: { loadEnv?: boolean } = {}): Promise<PlaygroundDbBootstrapResult> {
  const envFiles = options.loadEnv === false ? [] : loadPlaygroundEnv();
  const dbConfig = createDbConfigFromEnv();

  await dbConfig.bootstrapSchema();
  await bootstrapPlaygroundAuthSchema(dbConfig);
  await bootstrapPlaygroundThreadCatalog(dbConfig);

  return {
    dbMode: dbConfig.mode,
    connectionString: dbConfig.connectionString,
    envFiles
  };
}
