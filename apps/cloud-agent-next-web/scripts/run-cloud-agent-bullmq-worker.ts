import { createCloudAgentBullMqWorker } from '../lib/bullmq-run-queue';
import { readDockerRuntime } from '../lib/agent-runtime-config';
import { readCloudAgentWorkerQueueOptions } from '../lib/run-queue-provider';
import { readServerEnv } from '../lib/server-env';
import { heartbeatCloudAgentWorker, markCloudAgentWorkerStopped } from '../lib/worker-registry';

const workerOptions = readCloudAgentWorkerQueueOptions();
const workerId = workerOptions.configuredWorkerId ?? `bullmq-worker-${process.pid}`;
const activeRunIds = new Set<string>();
const heartbeatIntervalMs = Math.max(
  1000,
  Math.min(workerOptions.pollMs, Math.floor(workerOptions.leaseMs / 2))
);
const worker = createCloudAgentBullMqWorker({
  workerId,
  concurrency: workerOptions.concurrency,
  leaseMs: workerOptions.leaseMs,
  maxAttempts: workerOptions.maxAttempts,
  retryBaseMs: workerOptions.retryBaseMs
});

let stopping = false;
const heartbeatTimer = setInterval(() => {
  void heartbeatWorker(stopping ? 'draining' : 'active').then((workerStatus) => {
    if (workerStatus === 'draining' && !stopping) {
      void stop();
    }
  });
}, heartbeatIntervalMs);
heartbeatTimer.unref?.();

const stop = async () => {
  if (stopping) {
    return;
  }

  stopping = true;
  await heartbeatWorker('draining');
  await worker.close();
  clearInterval(heartbeatTimer);
  await markCloudAgentWorkerStopped({ workerId });
  console.log(
    JSON.stringify(
      {
        concurrency: workerOptions.concurrency,
        queueProvider: 'bullmq',
        stopped: true,
        workerId
      },
      null,
      2
    )
  );
};

const initialStatus = await heartbeatWorker('active');
if (initialStatus === 'draining') {
  void stop();
}

process.once('SIGINT', () => {
  void stop();
});
process.once('SIGTERM', () => {
  void stop();
});

worker.on('active', (job) => {
  activeRunIds.add(job.data.runId);
  void heartbeatWorker('active');
});

worker.on('completed', (job) => {
  activeRunIds.delete(job.data.runId);
  void heartbeatWorker(stopping ? 'draining' : 'active');
  console.log(JSON.stringify({ jobId: job.id, queueProvider: 'bullmq', runId: job.data.runId, status: 'completed', workerId }));
});

worker.on('failed', (job, error) => {
  const runId = job?.data.runId ?? null;
  if (runId) {
    activeRunIds.delete(runId);
  }
  void heartbeatWorker(stopping ? 'draining' : 'active');
  console.error(
    JSON.stringify({
      error: error.message,
      jobId: job?.id ?? null,
      queueProvider: 'bullmq',
      runId,
      status: 'failed',
      workerId
    })
  );
});

console.log(
  JSON.stringify(
    {
      concurrency: workerOptions.concurrency,
      dockerRuntime: readDockerRuntime(readServerEnv()) ?? 'default',
      leaseMs: workerOptions.leaseMs,
      maxAttempts: workerOptions.maxAttempts ?? null,
      pollMs: workerOptions.pollMs,
      queueProvider: 'bullmq',
      ready: true,
      retryBaseMs: workerOptions.retryBaseMs ?? null,
      workerId
    },
    null,
    2
  )
);

async function heartbeatWorker(status: 'active' | 'draining'): Promise<'active' | 'draining' | 'stopped' | null> {
  const worker = await heartbeatCloudAgentWorker({
    activeRunIds: [...activeRunIds],
    concurrency: workerOptions.concurrency,
    metadata: {
      pid: process.pid
    },
    queueProvider: 'bullmq',
    status,
    workerId
  }).catch((error) => {
    console.error('Cloud agent BullMQ worker heartbeat failed:', error);
    return null;
  });
  return worker?.status ?? null;
}
