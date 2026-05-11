import { buildPlaygroundServer } from './app.js';
import { getPlaygroundBaseServices } from './playground-base-services.js';
import { buildPlaygroundStartupSummary } from './startup-summary.js';

async function main() {
  const { app, envFiles } = await buildPlaygroundServer();
  const host = process.env.HOST ?? '0.0.0.0';
  const port = Number(process.env.PORT ?? 4000);
  const baseServices = await getPlaygroundBaseServices();
  await app.listen({ host, port });
  app.log.info(
    {
      host,
      port,
      startup: buildPlaygroundStartupSummary({
        dbInfo: baseServices.dbInfo,
        envFiles
      })
    },
    'playground server ready'
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
