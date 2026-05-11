import type { PlaygroundDbInfo } from './playground-meta.js';

export type PlaygroundStartupSummary = {
  dbConnection: string;
  dbMode: string;
  dbModeForced: boolean;
  envFiles: string[];
  nodeEnv: string;
};

function isDbModeForcedFromEnv() {
  const rawMode = process.env.PLAYGROUND_DB_MODE?.trim().toLowerCase();
  return rawMode === 'sqlite' || rawMode === 'turso' || rawMode === 'postgres';
}

function redactDbConnection(connectionString: string) {
  if (connectionString.startsWith('file:')) {
    return connectionString;
  }

  try {
    const url = new URL(connectionString);
    if (url.password) {
      url.password = '***';
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}

export function buildPlaygroundStartupSummary(input: {
  dbInfo: PlaygroundDbInfo;
  envFiles: string[];
}): PlaygroundStartupSummary {
  return {
    dbMode: input.dbInfo.mode,
    dbConnection: redactDbConnection(input.dbInfo.connectionString),
    dbModeForced: isDbModeForcedFromEnv(),
    envFiles: input.envFiles,
    nodeEnv: process.env.NODE_ENV ?? 'development'
  };
}
