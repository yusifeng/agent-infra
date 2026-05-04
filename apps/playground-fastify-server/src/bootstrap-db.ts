import { bootstrapPlaygroundDb } from './bootstrap.js';

async function main() {
  const result = await bootstrapPlaygroundDb();

  console.log(
    JSON.stringify(
      {
        ok: true,
        ...result
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
