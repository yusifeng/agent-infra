import { runCloudAgentRunJob } from '../lib/agent-run-worker';
import { readDockerRuntime } from '../lib/agent-runtime-config';
import {
  getCloudAgentWorkerRunQueueProvider,
  readCloudAgentWorkerQueueOptions
} from '../lib/run-queue-provider';
import { readServerEnv } from '../lib/server-env';
import { heartbeatCloudAgentWorker, markCloudAgentWorkerStopped } from '../lib/worker-registry';

const workerOptions = readCloudAgentWorkerQueueOptions();
const workerId = workerOptions.configuredWorkerId ?? `worker-${process.pid}`;
const { concurrency, leaseMs, maxAttempts, maxIdleMs, pollMs, retryBaseMs } = workerOptions;
let stopping = false;

process.once('SIGINT', () => {
  stopping = true;
});
process.once('SIGTERM', () => {
  stopping = true;
});

let idleStartedAt = Date.now();
const queueProvider = getCloudAgentWorkerRunQueueProvider();
const active = new Map<string, Promise<void>>();
const heartbeatIntervalMs = Math.max(1000, Math.min(pollMs, Math.floor(leaseMs / 2)));
let lastHeartbeatAt = 0;

console.log(
  JSON.stringify(
    {
      concurrency,
      dockerRuntime: readDockerRuntime(readServerEnv()) ?? 'default',
      leaseMs,
      maxAttempts: maxAttempts ?? null,
      maxIdleMs: maxIdleMs ?? null,
      pollMs,
      queueProvider: queueProvider.kind,
      ready: true,
      retryBaseMs: retryBaseMs ?? null,
      workerId
    },
    null,
    2
  )
);

await heartbeatWorker('active');

while (!stopping || active.size > 0) {
  await maybeHeartbeatWorker();

  let claimedAny = false;
  while (!stopping && active.size < concurrency) {
    const run = await queueProvider.claimNext({ workerId, leaseMs });
    if (!run) {
      break;
    }

    claimedAny = true;
    idleStartedAt = Date.now();
    let execution: Promise<void>;
    execution = runCloudAgentRunJob(run.id, { workerId, leaseMs, maxAttempts, retryBaseMs })
      .then(() => undefined)
      .catch((error) => {
        console.error(`Cloud agent worker failed run ${run.id}:`, error);
      })
      .finally(() => {
        active.delete(run.id);
        void maybeHeartbeatWorker(true);
      });
    active.set(run.id, execution);
    await maybeHeartbeatWorker(true);
  }

  if (active.size > 0) {
    await Promise.race([...active.values(), sleep(pollMs)]);
    continue;
  }

  if (!claimedAny) {
    if (maxIdleMs && Date.now() - idleStartedAt >= maxIdleMs) {
      break;
    }

    await sleep(pollMs);
  }
}

await markCloudAgentWorkerStopped({ workerId });
console.log(JSON.stringify({ concurrency, queueProvider: queueProvider.kind, stopped: true, workerId }, null, 2));

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function maybeHeartbeatWorker(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastHeartbeatAt < heartbeatIntervalMs) {
    return;
  }

  await heartbeatWorker(stopping ? 'draining' : 'active');
}

async function heartbeatWorker(status: 'active' | 'draining'): Promise<void> {
  lastHeartbeatAt = Date.now();
  const worker = await heartbeatCloudAgentWorker({
    activeRunIds: [...active.keys()],
    concurrency,
    metadata: {
      pid: process.pid
    },
    queueProvider: queueProvider.kind,
    status,
    workerId
  }).catch((error) => {
    console.error('Cloud agent worker heartbeat failed:', error);
    return null;
  });
  if (worker?.status === 'draining') {
    stopping = true;
  }
}
