import { runWithPhase1Harness } from './phase1-harness.mjs';
import { runPhase1MainChatSmoke } from './phase1-main-chat-smoke.mjs';

await runWithPhase1Harness(async ({ viteBaseUrl }) => {
  const summary = await runPhase1MainChatSmoke({
    viteBaseUrl,
    threadTitle: 'Phase 1 smoke'
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        viteBaseUrl,
        ...summary
      },
      null,
      2
    )
  );
});
