import { Queue, Worker, type ConnectionOptions, type JobsOptions } from 'bullmq';

import { runCloudAgentRunJob } from './agent-run-worker';
import { getCloudAgentRepositories } from './db';
import { claimCloudAgentRunById } from './run-store';
import { readServerEnv } from './server-env';

export interface CloudAgentBullMqJobData {
  runId: string;
}

export interface CloudAgentBullMqWorkerOptions {
  concurrency: number;
  leaseMs: number;
  maxAttempts?: number;
  retryBaseMs?: number;
  workerId: string;
}

export interface CloudAgentBullMqFailedJobSummary {
  attemptsMade: number;
  failedReason: string | null;
  finishedOn: number | null;
  jobId: string | null;
  processedOn: number | null;
  runId: string | null;
}

export interface CloudAgentBullMqQueueSnapshot {
  counts: Record<string, number>;
  failedJobs: CloudAgentBullMqFailedJobSummary[];
  queueName: string;
}

export interface CloudAgentBullMqRetryResult {
  retried: CloudAgentBullMqFailedJobSummary[];
}

export interface CloudAgentBullMqCleanResult {
  cleanedJobIds: string[];
}

const DEFAULT_BULLMQ_QUEUE_NAME = 'cloud-agent-runs';

export async function enqueueCloudAgentBullMqRun(input: {
  maxAttempts?: number;
  retryBaseMs?: number;
  runId: string;
}): Promise<void> {
  const queue = new Queue<CloudAgentBullMqJobData, void, 'run'>(readBullMqQueueName(), {
    connection: readBullMqConnectionOptions()
  });
  try {
    await queue.add('run', { runId: input.runId }, bullMqJobOptions(input));
  } finally {
    await queue.close();
  }
}

export function createCloudAgentBullMqWorker(options: CloudAgentBullMqWorkerOptions): Worker<CloudAgentBullMqJobData, void, 'run'> {
  return new Worker<CloudAgentBullMqJobData, void, 'run'>(
    readBullMqQueueName(),
    async (job) => {
      const claimed = await claimCloudAgentRunById({
        runId: job.data.runId,
        workerId: options.workerId,
        leaseMs: options.leaseMs
      });
      if (!claimed) {
        const repositories = await getCloudAgentRepositories();
        const run = await repositories.runRepo.findById(job.data.runId);
        if (run?.status === 'completed' || run?.status === 'failed' || run?.status === 'cancelled') {
          return;
        }

        throw new Error(`Run is not claimable yet: ${job.data.runId}`);
      }

      await runCloudAgentRunJob(job.data.runId, {
        workerId: options.workerId,
        leaseMs: options.leaseMs,
        maxAttempts: options.maxAttempts,
        retryBaseMs: options.retryBaseMs
      });
    },
    {
      concurrency: options.concurrency,
      connection: readBullMqConnectionOptions()
    }
  );
}

export async function readCloudAgentBullMqQueueSnapshot(input: { failedLimit?: number } = {}): Promise<CloudAgentBullMqQueueSnapshot> {
  const queue = createBullMqQueue();
  try {
    const [counts, failedJobs] = await Promise.all([
      queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'paused', 'prioritized', 'waiting-children'),
      queue.getJobs('failed', 0, Math.max(0, (input.failedLimit ?? 20) - 1), false)
    ]);
    return {
      counts,
      failedJobs: failedJobs.map(toFailedJobSummary),
      queueName: readBullMqQueueName()
    };
  } finally {
    await queue.close();
  }
}

export async function retryCloudAgentBullMqFailedJobs(input: { limit?: number } = {}): Promise<CloudAgentBullMqRetryResult> {
  const queue = createBullMqQueue();
  try {
    const jobs = await queue.getJobs('failed', 0, Math.max(0, (input.limit ?? 20) - 1), false);
    const retried: CloudAgentBullMqFailedJobSummary[] = [];
    for (const job of jobs) {
      await job.retry('failed');
      retried.push(toFailedJobSummary(job));
    }

    return { retried };
  } finally {
    await queue.close();
  }
}

export async function cleanCloudAgentBullMqCompletedJobs(input: {
  graceMs?: number;
  limit?: number;
} = {}): Promise<CloudAgentBullMqCleanResult> {
  const queue = createBullMqQueue();
  try {
    const cleanedJobIds = await queue.clean(input.graceMs ?? 60 * 60 * 1000, input.limit ?? 100, 'completed');
    return { cleanedJobIds };
  } finally {
    await queue.close();
  }
}

export function hasBullMqRedisUrl(env: Record<string, string | undefined> = readServerEnv()): boolean {
  return Boolean(env.REDIS_URL?.trim());
}

export function readBullMqQueueName(env: Record<string, string | undefined> = readServerEnv()): string {
  return env.CLOUD_AGENT_BULLMQ_QUEUE_NAME?.trim() || DEFAULT_BULLMQ_QUEUE_NAME;
}

function createBullMqQueue(): Queue<CloudAgentBullMqJobData, void, 'run'> {
  return new Queue<CloudAgentBullMqJobData, void, 'run'>(readBullMqQueueName(), {
    connection: readBullMqConnectionOptions()
  });
}

function readBullMqConnectionOptions(env: Record<string, string | undefined> = readServerEnv()): ConnectionOptions {
  const redisUrl = env.REDIS_URL?.trim();
  if (!redisUrl) {
    throw new Error('CLOUD_AGENT_RUN_QUEUE_PROVIDER=bullmq requires REDIS_URL.');
  }

  const url = new URL(redisUrl);
  return {
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined,
    host: url.hostname,
    maxRetriesPerRequest: null,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    port: url.port ? Number(url.port) : 6379,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    username: url.username ? decodeURIComponent(url.username) : undefined
  };
}

function toFailedJobSummary(job: {
  attemptsMade: number;
  data?: Partial<CloudAgentBullMqJobData>;
  failedReason?: string;
  finishedOn?: number;
  id?: string;
  processedOn?: number;
}): CloudAgentBullMqFailedJobSummary {
  return {
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason ?? null,
    finishedOn: job.finishedOn ?? null,
    jobId: job.id ?? null,
    processedOn: job.processedOn ?? null,
    runId: typeof job.data?.runId === 'string' ? job.data.runId : null
  };
}

function bullMqJobOptions(input: { maxAttempts?: number; retryBaseMs?: number; runId: string }): JobsOptions {
  const attempts = input.maxAttempts && input.maxAttempts > 0 ? input.maxAttempts : 3;
  const delay = input.retryBaseMs && input.retryBaseMs > 0 ? input.retryBaseMs : 5_000;
  return {
    attempts,
    backoff: {
      type: 'exponential',
      delay
    },
    jobId: input.runId,
    removeOnComplete: true,
    removeOnFail: false
  };
}
