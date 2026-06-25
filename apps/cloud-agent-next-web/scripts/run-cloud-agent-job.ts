import { runCloudAgentRunJob } from '../lib/agent-run-worker';

const runId = process.argv[2]?.trim();
if (!runId) {
  console.error('Usage: pnpm --filter cloud-agent-next-web worker:run <runId>');
  process.exitCode = 1;
} else {
  const workerId = process.env.CLOUD_AGENT_WORKER_ID?.trim() || null;
  const result = await runCloudAgentRunJob(runId, {
    workerId,
    leaseMs: readPositiveNumber(process.env.CLOUD_AGENT_WORKER_LEASE_MS),
    maxAttempts: readPositiveNumber(process.env.CLOUD_AGENT_WORKER_MAX_ATTEMPTS),
    retryBaseMs: readPositiveNumber(process.env.CLOUD_AGENT_WORKER_RETRY_BASE_MS)
  });
  console.log(
    JSON.stringify(
      {
        runId,
        failed: result.failed,
        error: result.error,
        messageId: result.message.id,
        threadId: result.thread.id
      },
      null,
      2
    )
  );
}

function readPositiveNumber(value: string | undefined): number | undefined {
  const number = Number(value?.trim());
  return Number.isFinite(number) && number > 0 ? number : undefined;
}
