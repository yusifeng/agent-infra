import cors from '@fastify/cors';
import Fastify from 'fastify';

import { loadPlaygroundEnv } from './env.js';
import { registerChatRoutes } from './routes/chat.js';

async function main() {
  const envFiles = loadPlaygroundEnv();
  const host = process.env.HOST ?? '0.0.0.0';
  const port = Number(process.env.PORT ?? 4000);
  const app = Fastify({
    logger: true
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

  await registerChatRoutes(app);
  await app.listen({ host, port });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
