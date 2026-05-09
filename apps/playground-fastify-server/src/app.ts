import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { loadPlaygroundEnv } from './env.js';
import { createPlaygroundAuthConfigFromEnv } from './features/auth/service/auth-config.js';
import { resolveCurrentUser } from './features/thread-catalog/identity/current-user.js';
import { getPlaygroundAppServices } from './playground-app-services.js';
import { applyTimingHeaders, createRequestTiming } from './request-timing.js';
import { registerAuthRoutes, type AuthRouteDependencies } from './routes/auth.js';
import { registerChatRoutes, type ChatRouteDependencies } from './routes/chat.js';

export type BuildPlaygroundServerOptions = ChatRouteDependencies & AuthRouteDependencies & {
  envFiles?: string[];
  loadEnv?: boolean;
  logger?: FastifyServerOptions['logger'];
};

export async function buildPlaygroundServer(options: BuildPlaygroundServerOptions = {}): Promise<{
  app: FastifyInstance;
  envFiles: string[];
}> {
  const envFiles = options.loadEnv === false ? (options.envFiles ?? []) : (options.envFiles ?? loadPlaygroundEnv());
  const authConfig = options.authConfig ?? createPlaygroundAuthConfigFromEnv();
  const getAppServices = options.getAppServices ?? getPlaygroundAppServices;
  const app = Fastify({
    logger: options.logger ?? true
  });

  await app.register(cors, {
    origin: true
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: false
  });

  app.addHook('onRequest', async (request) => {
    request.requestTiming = createRequestTiming();
    const sessionToken = request.cookies?.[authConfig.sessionCookieName];
    if (!sessionToken) {
      request.currentUser = null;
      return;
    }

    request.currentUser = await resolveCurrentUser({
      dbConfig: (await getAppServices()).dbConfig,
      sessionToken
    });
  });

  app.addHook('onSend', async (request, reply, payload) => {
    applyTimingHeaders(request, reply);
    return payload;
  });

  app.addHook('onResponse', async (request, reply) => {
    request.requestTiming.complete(app.log, request, reply);
  });

  app.get('/health', async () => {
    return {
      app: 'playground-fastify-server',
      envFiles,
      status: 'ok'
    };
  });

  await registerAuthRoutes(app, {
    ...options,
    authConfig
  });
  await registerChatRoutes(app, {
    ...options,
    authConfig
  });

  return {
    app,
    envFiles
  };
}
