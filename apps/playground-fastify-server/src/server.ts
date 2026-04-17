import cors from '@fastify/cors';
import Fastify from 'fastify';

import { registerChatRoutes } from './routes/chat.js';

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 4000);

async function main() {
  const app = Fastify({
    logger: true
  });

  await app.register(cors, {
    origin: true
  });

  app.get('/health', async () => {
    return {
      app: 'playground-fastify-server',
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
