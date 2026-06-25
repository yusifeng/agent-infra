import type { Run } from '@agent-infra/core';

import { enqueueCloudAgentRun, type CloudAgentRunHandle, type CloudAgentRunJob } from './agent-run-worker';
import { enqueueCloudAgentBullMqRun, hasBullMqRedisUrl } from './bullmq-run-queue';
import { claimNextQueuedCloudAgentRun } from './run-store';
import { readServerEnv } from './server-env';

export type CloudAgentRunQueueProviderKind = 'bullmq' | 'db-poll' | 'db-queue' | 'in-process' | 'temporal';

export interface CloudAgentRunQueueBackendManifest {
  description: string;
  kind: CloudAgentRunQueueProviderKind;
  productionTarget: boolean;
  requiredEnv: string[];
  status: 'planned' | 'supported';
}

export interface CloudAgentRunQueueDiagnostics {
  backends: CloudAgentRunQueueBackendManifest[];
  configuredKind: CloudAgentRunQueueProviderKind;
  error: string | null;
  productionIssues: string[];
  productionReady: boolean;
  ready: boolean;
  worker: CloudAgentWorkerQueueOptions;
}

export interface CloudAgentWorkerQueueOptions {
  configuredWorkerId: string | null;
  concurrency: number;
  leaseMs: number;
  maxAttempts?: number;
  maxIdleMs?: number;
  pollMs: number;
  retryBaseMs?: number;
}

export type CloudAgentRunDispatchResult =
  | {
      handle: CloudAgentRunHandle;
      kind: 'in-process';
      runId: string;
    }
  | {
      kind: 'bullmq' | 'db-poll' | 'db-queue';
      runId: string;
    };

export interface CloudAgentRunQueueProvider {
  claimNext(input: { leaseMs?: number; workerId: string }): Promise<Run | null>;
  dispatch(job: CloudAgentRunJob): Promise<CloudAgentRunDispatchResult>;
  kind: CloudAgentRunQueueProviderKind;
}

class InProcessRunQueueProvider implements CloudAgentRunQueueProvider {
  readonly kind = 'in-process' as const;

  claimNext(_input: { leaseMs?: number; workerId: string }): Promise<Run | null> {
    return Promise.resolve(null);
  }

  async dispatch(job: CloudAgentRunJob): Promise<CloudAgentRunDispatchResult> {
    return {
      handle: enqueueCloudAgentRun(job),
      kind: this.kind,
      runId: job.runId
    };
  }
}

class DbBackedRunQueueProvider implements CloudAgentRunQueueProvider {
  constructor(readonly kind: 'db-poll' | 'db-queue') {}

  claimNext(input: { leaseMs?: number; workerId: string }): Promise<Run | null> {
    return claimNextQueuedCloudAgentRun(input);
  }

  async dispatch(job: CloudAgentRunJob): Promise<CloudAgentRunDispatchResult> {
    return {
      kind: this.kind,
      runId: job.runId
    };
  }
}

class BullMqRunQueueProvider implements CloudAgentRunQueueProvider {
  readonly kind = 'bullmq' as const;

  claimNext(_input: { leaseMs?: number; workerId: string }): Promise<Run | null> {
    throw new Error('BullMQ workers consume Redis jobs. Use `pnpm --filter cloud-agent-next-web worker:bullmq`.');
  }

  async dispatch(job: CloudAgentRunJob): Promise<CloudAgentRunDispatchResult> {
    const options = readCloudAgentWorkerQueueOptions();
    await enqueueCloudAgentBullMqRun({
      runId: job.runId,
      maxAttempts: options.maxAttempts,
      retryBaseMs: options.retryBaseMs
    });
    return {
      kind: this.kind,
      runId: job.runId
    };
  }
}

const inProcessRunQueueProvider = new InProcessRunQueueProvider();
const dbPollRunQueueProvider = new DbBackedRunQueueProvider('db-poll');
const dbQueueRunQueueProvider = new DbBackedRunQueueProvider('db-queue');
const bullMqRunQueueProvider = new BullMqRunQueueProvider();

const RUN_QUEUE_BACKENDS: CloudAgentRunQueueBackendManifest[] = [
  {
    description: 'Local request-owned execution for development. Not an isolated worker backend.',
    kind: 'in-process',
    productionTarget: false,
    requiredEnv: [],
    status: 'supported'
  },
  {
    description: 'SQLite/Postgres-backed polling worker using durable run claim/lease fields.',
    kind: 'db-poll',
    productionTarget: false,
    requiredEnv: [],
    status: 'supported'
  },
  {
    description:
      'DB-backed worker queue using durable run claim/lease fields. Prefer a managed SQL database for production deployments.',
    kind: 'db-queue',
    productionTarget: true,
    requiredEnv: [],
    status: 'supported'
  },
  {
    description: 'Redis/BullMQ production queue backend.',
    kind: 'bullmq',
    productionTarget: true,
    requiredEnv: ['REDIS_URL'],
    status: 'supported'
  },
  {
    description: 'Temporal workflow backend for durable run orchestration.',
    kind: 'temporal',
    productionTarget: true,
    requiredEnv: ['TEMPORAL_ADDRESS', 'TEMPORAL_NAMESPACE', 'TEMPORAL_TASK_QUEUE'],
    status: 'planned'
  }
];

export function getCloudAgentRunQueueProvider(): CloudAgentRunQueueProvider {
  const kind = readCloudAgentRunQueueProviderKind();
  if (kind === 'db-poll') {
    return dbPollRunQueueProvider;
  }

  if (kind === 'db-queue') {
    return dbQueueRunQueueProvider;
  }

  if (kind === 'bullmq') {
    if (!hasBullMqRedisUrl()) {
      throw new Error('CLOUD_AGENT_RUN_QUEUE_PROVIDER=bullmq requires REDIS_URL.');
    }
    return bullMqRunQueueProvider;
  }

  if (kind === 'in-process') {
    return inProcessRunQueueProvider;
  }

  throw new Error(queueProviderNotImplementedMessage(kind));
}

export function getCloudAgentWorkerRunQueueProvider(): CloudAgentRunQueueProvider {
  const provider = getCloudAgentRunQueueProvider();
  return provider.kind === 'in-process' ? dbQueueRunQueueProvider : provider;
}

export function getCloudAgentRunQueueDiagnostics(): CloudAgentRunQueueDiagnostics {
  const configuredKind = readCloudAgentRunQueueProviderKind();
  const manifest = RUN_QUEUE_BACKENDS.find((backend) => backend.kind === configuredKind) ?? null;
  const error = queueProviderDiagnosticsError(configuredKind, manifest);
  const productionIssues = queueProviderProductionIssues(configuredKind, manifest, error);

  return {
    backends: RUN_QUEUE_BACKENDS,
    configuredKind,
    error,
    productionIssues,
    productionReady: productionIssues.length === 0,
    ready: error === null,
    worker: readCloudAgentWorkerQueueOptions()
  };
}

function queueProviderDiagnosticsError(
  configuredKind: CloudAgentRunQueueProviderKind,
  manifest: CloudAgentRunQueueBackendManifest | null
): string | null {
  if (!manifest) {
    return `Unknown cloud agent run queue provider: ${configuredKind}`;
  }

  if (manifest.status !== 'supported') {
    return queueProviderNotImplementedMessage(configuredKind);
  }

  if (configuredKind === 'bullmq' && !hasBullMqRedisUrl()) {
    return 'CLOUD_AGENT_RUN_QUEUE_PROVIDER=bullmq requires REDIS_URL.';
  }

  return null;
}

function queueProviderProductionIssues(
  configuredKind: CloudAgentRunQueueProviderKind,
  manifest: CloudAgentRunQueueBackendManifest | null,
  readinessError: string | null
): string[] {
  const issues: string[] = [];
  if (readinessError) {
    issues.push(readinessError);
  }
  if (!manifest) {
    return issues;
  }
  if (!manifest.productionTarget) {
    issues.push(`Cloud agent run queue provider "${configuredKind}" is intended for development, not production execution.`);
  }

  return issues;
}

export function readCloudAgentWorkerQueueOptions(): CloudAgentWorkerQueueOptions {
  const env = readServerEnv();
  return {
    configuredWorkerId: readTrimmed(env.CLOUD_AGENT_WORKER_ID),
    concurrency: readPositiveNumber(env.CLOUD_AGENT_WORKER_CONCURRENCY) ?? 1,
    leaseMs: readPositiveNumber(env.CLOUD_AGENT_WORKER_LEASE_MS) ?? 5 * 60 * 1000,
    maxAttempts: readPositiveNumber(env.CLOUD_AGENT_WORKER_MAX_ATTEMPTS),
    maxIdleMs: readPositiveNumber(env.CLOUD_AGENT_WORKER_MAX_IDLE_MS),
    pollMs: readPositiveNumber(env.CLOUD_AGENT_WORKER_POLL_MS) ?? 1000,
    retryBaseMs: readPositiveNumber(env.CLOUD_AGENT_WORKER_RETRY_BASE_MS)
  };
}

export function readCloudAgentRunQueueProviderKind(): CloudAgentRunQueueProviderKind {
  const provider = readServerEnv().CLOUD_AGENT_RUN_QUEUE_PROVIDER?.trim().toLowerCase();
  if (isCloudAgentRunQueueProviderKind(provider)) {
    return provider;
  }
  if (provider === 'db-poll' || provider === 'external' || provider === 'worker') {
    return 'db-poll';
  }
  if (provider) {
    throw new Error(`Unknown CLOUD_AGENT_RUN_QUEUE_PROVIDER: ${provider}`);
  }

  const legacyDispatch = readServerEnv().CLOUD_AGENT_RUN_DISPATCH?.trim().toLowerCase();
  return legacyDispatch === 'external' || legacyDispatch === 'worker' ? 'db-poll' : 'in-process';
}

function isCloudAgentRunQueueProviderKind(value: string | undefined): value is CloudAgentRunQueueProviderKind {
  return (
    value === 'bullmq' ||
    value === 'db-poll' ||
    value === 'db-queue' ||
    value === 'in-process' ||
    value === 'temporal'
  );
}

function queueProviderNotImplementedMessage(kind: CloudAgentRunQueueProviderKind): string {
  const manifest = RUN_QUEUE_BACKENDS.find((backend) => backend.kind === kind);
  const requiredEnv = manifest?.requiredEnv.length ? ` Required env: ${manifest.requiredEnv.join(', ')}.` : '';
  return `Cloud agent run queue provider "${kind}" is not implemented in this app yet.${requiredEnv}`;
}

function readPositiveNumber(value: string | undefined): number | undefined {
  const number = Number(value?.trim());
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function readTrimmed(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
