import { buildPlaygroundServer } from './app.js';

async function main() {
  const { app } = await buildPlaygroundServer();
  const host = process.env.HOST ?? '0.0.0.0';
  const port = Number(process.env.PORT ?? 4000);
  await app.listen({ host, port });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
