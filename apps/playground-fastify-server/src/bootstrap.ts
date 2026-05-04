import { createDbConfigFromEnv } from '@agent-infra/db';

import { loadPlaygroundEnv } from './env.js';

export type PlaygroundDbBootstrapResult = {
  connectionString: string;
  dbMode: 'sqlite' | 'turso' | 'postgres';
  envFiles: string[];
};

export async function bootstrapPlaygroundDb(options: { loadEnv?: boolean } = {}): Promise<PlaygroundDbBootstrapResult> {
  const envFiles = options.loadEnv === false ? [] : loadPlaygroundEnv();
  const dbConfig = createDbConfigFromEnv();

  await dbConfig.bootstrapSchema();

  return {
    dbMode: dbConfig.mode,
    connectionString: dbConfig.connectionString,
    envFiles
  };
}
