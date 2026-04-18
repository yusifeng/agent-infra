import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { loadPlaygroundEnv } from './env.js';
import { registerChatRoutes, type ChatRouteDependencies } from './routes/chat.js';

export type BuildPlaygroundServerOptions = ChatRouteDependencies & {
  envFiles?: string[];
  loadEnv?: boolean;
  logger?: FastifyServerOptions['logger'];
};

export async function buildPlaygroundServer(options: BuildPlaygroundServerOptions = {}): Promise<{
  app: FastifyInstance;
  envFiles: string[];
}> {
  const envFiles = options.loadEnv === false ? (options.envFiles ?? []) : (options.envFiles ?? loadPlaygroundEnv());
  const app = Fastify({
    logger: options.logger ?? true
  });

  await app.register(cors, {
    origin: true
  });

  app.get('/health', async () => {
    return {
      app: 'playground-fastify-server',
      envFiles,
      status: 'ok'
    };
  });

  await registerChatRoutes(app, options);

  return {
    app,
    envFiles
  };
}
