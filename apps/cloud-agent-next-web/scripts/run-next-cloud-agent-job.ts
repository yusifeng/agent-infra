import { runCloudAgentRunJob } from '../lib/agent-run-worker';
import {
  getCloudAgentWorkerRunQueueProvider,
  readCloudAgentWorkerQueueOptions
} from '../lib/run-queue-provider';

const workerOptions = readCloudAgentWorkerQueueOptions();
const workerId = workerOptions.configuredWorkerId ?? `worker-${process.pid}`;
const { leaseMs, maxAttempts, retryBaseMs } = workerOptions;
const queueProvider = getCloudAgentWorkerRunQueueProvider();
const run = await queueProvider.claimNext({ workerId, leaseMs });
if (!run) {
  console.log(JSON.stringify({ claimed: false, queueProvider: queueProvider.kind, runId: null, workerId }, null, 2));
} else {
  const result = await runCloudAgentRunJob(run.id, {
    workerId,
    leaseMs,
    maxAttempts,
    retryBaseMs
  });
  console.log(
    JSON.stringify(
      {
        claimed: true,
        queueProvider: queueProvider.kind,
        workerId,
        runId: run.id,
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
