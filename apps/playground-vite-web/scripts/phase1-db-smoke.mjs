import { getAvailablePhase1DbModes, runWithPhase1Harness } from './phase1-harness.mjs';
import { runPhase1MainChatSmoke } from './phase1-main-chat-smoke.mjs';

const requestedModes = (process.env.PLAYGROUND_PHASE1_DB_MODES ?? 'sqlite,postgres,turso')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const availableModes = new Set(getAvailablePhase1DbModes());
const results = [];
const skipped = [];

for (const mode of requestedModes) {
  if (!availableModes.has(mode)) {
    skipped.push({
      mode,
      reason: `missing env for ${mode}`
    });
    continue;
  }

  const summary = await runWithPhase1Harness(
    async ({ viteBaseUrl, dbMode }) =>
      runPhase1MainChatSmoke({
        viteBaseUrl,
        threadTitle: `Phase 1 ${dbMode} smoke`,
        expectedDbMode: dbMode
      }),
    {
      dbMode: mode
    }
  );

  results.push(summary);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      requestedModes,
      results,
      skipped
    },
    null,
    2
  )
);
