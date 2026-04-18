import { runWithPhase1Harness, runWorkspaceCommand } from './phase1-harness.mjs';
import { runPhase1MainChatSmoke } from './phase1-main-chat-smoke.mjs';

const buildTimeoutMs = Number(process.env.PLAYGROUND_PHASE1_BUILD_TIMEOUT_MS ?? 1200000);
const buildSteps = [
  ['@agent-infra/core', ['--filter', '@agent-infra/core', 'build']],
  ['@agent-infra/contracts', ['--filter', '@agent-infra/contracts', 'build']],
  ['@agent-infra/durable-chat-client', ['--filter', '@agent-infra/durable-chat-client', 'build']],
  ['@agent-infra/db', ['--filter', '@agent-infra/db', 'build']],
  ['@agent-infra/app', ['--filter', '@agent-infra/app', 'build']],
  ['@agent-infra/durable-chat-server', ['--filter', '@agent-infra/durable-chat-server', 'build']],
  ['@agent-infra/runtime-pi', ['--filter', '@agent-infra/runtime-pi', 'build']],
  ['playground-fastify-server', ['--filter', 'playground-fastify-server', 'build']],
  ['playground-vite-web', ['--filter', 'playground-vite-web', 'build']]
];

for (const [name, args] of buildSteps) {
  console.log(`[phase1-production-smoke] building ${name}`);
  await runWorkspaceCommand(name, args, process.env, {
    timeoutMs: buildTimeoutMs
  });
}

await runWithPhase1Harness(
  async ({ fastifyBaseUrl, viteBaseUrl }) => {
    const summary = await runPhase1MainChatSmoke({
      viteBaseUrl,
      threadTitle: 'Phase 1 production smoke'
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          fastifyBaseUrl,
          viteBaseUrl,
          mode: 'production-shaped',
          ...summary
        },
        null,
        2
      )
    );
  },
  {
    fastifyMode: 'start',
    viteMode: 'preview',
    timeoutMs: Number(process.env.PLAYGROUND_PHASE1_PRODUCTION_TIMEOUT_MS ?? process.env.PLAYGROUND_PHASE1_TIMEOUT_MS ?? 180000)
  }
);
