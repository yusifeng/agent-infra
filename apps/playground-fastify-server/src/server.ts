import cors from '@fastify/cors';
import Fastify from 'fastify';

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

  app.get('/api/meta', async () => {
    return {
      app: 'playground-fastify-server',
      role: 'Fastify validation host for non-Next durable chat routes',
      plannedPackages: ['@agent-infra/durable-chat-server', '@agent-infra/runtime-pi']
    };
  });

  await app.listen({ host, port });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
