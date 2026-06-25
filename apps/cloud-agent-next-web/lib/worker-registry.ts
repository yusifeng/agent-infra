import type { CloudAgentWorker } from '@agent-infra/core';

import { getCloudAgentRepositories } from './db';
import { readCloudAgentWorkerQueueOptions, type CloudAgentRunQueueProviderKind } from './run-queue-provider';

const CLOUD_AGENT_APP_ID = 'cloud-agent-next-web';
const DEFAULT_WORKER_RECENCY_MS = 5 * 60 * 1000;

export interface CloudAgentWorkerHeartbeatInput {
  activeRunIds?: string[];
  concurrency: number;
  metadata?: Record<string, unknown> | null;
  queueProvider: CloudAgentRunQueueProviderKind;
  status?: CloudAgentWorker['status'];
  workerId: string;
}

export interface CloudAgentWorkerRegistrySnapshot {
  recommendedActions: CloudAgentWorkerRegistryRecommendedAction[];
  summary: CloudAgentWorkerRegistrySummary;
  staleAfterMs: number;
  staleWorkers: CloudAgentWorker[];
  workers: CloudAgentWorker[];
}

export interface CloudAgentWorkerRegistryRecommendedAction {
  action: 'clear-workers-drain' | 'drain-workers' | 'mark-stale-workers-stopped';
  reason: string;
  severity: 'info' | 'warning';
  workerCount: number;
}

export interface CloudAgentWorkerRegistrySummary {
  activeRunCount: number;
  activeRunIds: string[];
  byQueueProvider: Record<string, number>;
  byStatus: Record<CloudAgentWorker['status'], number>;
  staleWorkerCount: number;
  totalWorkers: number;
}

export interface CloudAgentMarkStaleWorkersStoppedResult {
  skippedWorkers: CloudAgentWorker[];
  staleAfterMs: number;
  staleBefore: string;
  stoppedWorkers: CloudAgentWorker[];
}

export type CloudAgentMarkWorkerStoppedResult =
  | {
      activeRunIds: string[];
      status: 'skipped_active_runs';
      worker: CloudAgentWorker;
    }
  | {
      status: 'not_found';
      worker: null;
    }
  | {
      status: 'stopped';
      worker: CloudAgentWorker;
    };

export interface CloudAgentWorkerPoolDrainResult {
  drainedWorkers: CloudAgentWorker[];
}

export interface CloudAgentWorkerPoolClearDrainResult {
  workers: CloudAgentWorker[];
}

export async function heartbeatCloudAgentWorker(input: CloudAgentWorkerHeartbeatInput): Promise<CloudAgentWorker> {
  const repositories = await getCloudAgentRepositories();
  const now = new Date();
  return repositories.cloudAgentWorkerRepo.heartbeat({
    id: input.workerId,
    appId: CLOUD_AGENT_APP_ID,
    queueProvider: input.queueProvider,
    status: input.status ?? 'active',
    concurrency: input.concurrency,
    activeRunIds: input.activeRunIds ?? [],
    metadata: input.metadata ?? null,
    startedAt: now,
    lastHeartbeatAt: now,
    heartbeatAt: now,
    stoppedAt: input.status === 'stopped' ? now : null
  });
}

export async function markCloudAgentWorkerStopped(input: {
  workerId: string;
}): Promise<CloudAgentWorker | null> {
  const repositories = await getCloudAgentRepositories();
  return repositories.cloudAgentWorkerRepo.markStopped({
    id: input.workerId,
    stoppedAt: new Date()
  });
}

export async function safelyMarkCloudAgentWorkerStopped(input: {
  actorId?: string | null;
  force?: boolean;
  reason?: string | null;
  workerId: string;
}): Promise<CloudAgentMarkWorkerStoppedResult> {
  const repositories = await getCloudAgentRepositories();
  const existing = await repositories.cloudAgentWorkerRepo.findById(input.workerId);
  if (!existing) {
    return { status: 'not_found', worker: null };
  }

  const activeRunIds = existing.activeRunIds ?? [];
  if (!input.force && existing.status !== 'stopped' && activeRunIds.length > 0) {
    return {
      activeRunIds,
      status: 'skipped_active_runs',
      worker: existing
    };
  }

  const worker = await repositories.cloudAgentWorkerRepo.markStopped({
    actorId: input.actorId ?? null,
    id: input.workerId,
    reason: input.reason ?? null,
    stoppedAt: new Date()
  });
  return worker ? { status: 'stopped', worker } : { status: 'not_found', worker: null };
}

export async function markStaleCloudAgentWorkersStopped(input: {
  actorId?: string | null;
  limit?: number;
  reason?: string | null;
  staleAfterMs?: number;
} = {}): Promise<CloudAgentMarkStaleWorkersStoppedResult> {
  const repositories = await getCloudAgentRepositories();
  const staleAfterMs = input.staleAfterMs ?? readCloudAgentWorkerQueueOptions().leaseMs * 2;
  const staleBefore = new Date(Date.now() - staleAfterMs);
  const workers = await repositories.cloudAgentWorkerRepo.listByApp(CLOUD_AGENT_APP_ID, {
    limit: Math.max(input.limit ?? 50, 50)
  });
  const staleWorkers = workers.filter(
    (worker) => worker.status !== 'stopped' && worker.lastHeartbeatAt.getTime() < staleBefore.getTime()
  );
  const stoppedWorkers: CloudAgentWorker[] = [];
  const skippedWorkers: CloudAgentWorker[] = [];
  const candidates = input.limit && input.limit > 0 ? staleWorkers.slice(0, input.limit) : staleWorkers;

  for (const worker of candidates) {
    const stopped = await repositories.cloudAgentWorkerRepo.markStoppedIfStale({
      actorId: input.actorId ?? null,
      id: worker.id,
      reason: input.reason ?? 'stale_worker_cleanup',
      staleBefore,
      stoppedAt: new Date()
    });
    if (stopped) {
      stoppedWorkers.push(stopped);
    } else {
      skippedWorkers.push(worker);
    }
  }

  return {
    skippedWorkers,
    staleAfterMs,
    staleBefore: staleBefore.toISOString(),
    stoppedWorkers
  };
}

export async function requestCloudAgentWorkerDrain(input: {
  actorId: string;
  reason?: string | null;
  workerId: string;
}): Promise<CloudAgentWorker | null> {
  const repositories = await getCloudAgentRepositories();
  return repositories.cloudAgentWorkerRepo.requestDrain({
    actorId: input.actorId,
    id: input.workerId,
    reason: input.reason ?? null,
    requestedAt: new Date()
  });
}

export async function clearCloudAgentWorkerDrain(input: {
  actorId: string;
  reason?: string | null;
  workerId: string;
}): Promise<CloudAgentWorker | null> {
  const repositories = await getCloudAgentRepositories();
  return repositories.cloudAgentWorkerRepo.clearDrain({
    actorId: input.actorId,
    id: input.workerId,
    reason: input.reason ?? null,
    requestedAt: new Date()
  });
}

export async function requestCloudAgentWorkerPoolDrain(input: {
  actorId: string;
  limit?: number;
  reason?: string | null;
}): Promise<CloudAgentWorkerPoolDrainResult> {
  const repositories = await getCloudAgentRepositories();
  const requestedAt = new Date();
  const workers = await repositories.cloudAgentWorkerRepo.listByApp(CLOUD_AGENT_APP_ID, {
    limit: input.limit ?? 50
  });
  const drainedWorkers: CloudAgentWorker[] = [];

  for (const worker of workers) {
    if (worker.status === 'stopped') {
      continue;
    }

    const drained = await repositories.cloudAgentWorkerRepo.requestDrain({
      actorId: input.actorId,
      id: worker.id,
      reason: input.reason ?? null,
      requestedAt
    });
    if (drained) {
      drainedWorkers.push(drained);
    }
  }

  return { drainedWorkers };
}

export async function clearCloudAgentWorkerPoolDrain(input: {
  actorId: string;
  limit?: number;
  reason?: string | null;
}): Promise<CloudAgentWorkerPoolClearDrainResult> {
  const repositories = await getCloudAgentRepositories();
  const requestedAt = new Date();
  const workers = await repositories.cloudAgentWorkerRepo.listByApp(CLOUD_AGENT_APP_ID, {
    limit: input.limit ?? 50
  });
  const clearedWorkers: CloudAgentWorker[] = [];

  for (const worker of workers) {
    if (worker.status === 'stopped') {
      continue;
    }

    const cleared = await repositories.cloudAgentWorkerRepo.clearDrain({
      actorId: input.actorId,
      id: worker.id,
      reason: input.reason ?? null,
      requestedAt
    });
    if (cleared) {
      clearedWorkers.push(cleared);
    }
  }

  return { workers: clearedWorkers };
}

export async function listRecentCloudAgentWorkers(input: {
  limit?: number;
  sinceMs?: number;
} = {}): Promise<CloudAgentWorker[]> {
  const repositories = await getCloudAgentRepositories();
  const sinceMs = input.sinceMs ?? readCloudAgentWorkerQueueOptions().leaseMs ?? DEFAULT_WORKER_RECENCY_MS;
  return repositories.cloudAgentWorkerRepo.listByApp(CLOUD_AGENT_APP_ID, {
    since: new Date(Date.now() - sinceMs),
    limit: input.limit ?? 50
  });
}

export async function readCloudAgentWorkerRegistrySnapshot(input: {
  limit?: number;
  staleAfterMs?: number;
} = {}): Promise<CloudAgentWorkerRegistrySnapshot> {
  const repositories = await getCloudAgentRepositories();
  const staleAfterMs = input.staleAfterMs ?? readCloudAgentWorkerQueueOptions().leaseMs * 2;
  const staleBefore = Date.now() - staleAfterMs;
  const workers = await repositories.cloudAgentWorkerRepo.listByApp(CLOUD_AGENT_APP_ID, {
    limit: input.limit ?? 50
  });
  const staleWorkers = workers.filter(
    (worker) => worker.status !== 'stopped' && worker.lastHeartbeatAt.getTime() < staleBefore
  );
  const summary = summarizeCloudAgentWorkers(workers, staleWorkers);
  return {
    recommendedActions: recommendCloudAgentWorkerActions(summary),
    summary,
    staleAfterMs,
    staleWorkers,
    workers
  };
}

export function summarizeCloudAgentWorkers(
  workers: CloudAgentWorker[],
  staleWorkers: CloudAgentWorker[]
): CloudAgentWorkerRegistrySummary {
  const activeRunIds = Array.from(
    new Set(workers.flatMap((worker) => worker.activeRunIds ?? []))
  ).sort();
  const byQueueProvider: Record<string, number> = {};
  const byStatus: Record<CloudAgentWorker['status'], number> = {
    active: 0,
    draining: 0,
    stopped: 0
  };

  for (const worker of workers) {
    byQueueProvider[worker.queueProvider] = (byQueueProvider[worker.queueProvider] ?? 0) + 1;
    byStatus[worker.status] += 1;
  }

  return {
    activeRunCount: activeRunIds.length,
    activeRunIds,
    byQueueProvider,
    byStatus,
    staleWorkerCount: staleWorkers.length,
    totalWorkers: workers.length
  };
}

function recommendCloudAgentWorkerActions(
  summary: CloudAgentWorkerRegistrySummary
): CloudAgentWorkerRegistryRecommendedAction[] {
  const actions: CloudAgentWorkerRegistryRecommendedAction[] = [];
  if (summary.staleWorkerCount > 0) {
    actions.push({
      action: 'mark-stale-workers-stopped',
      reason: 'Workers have not heartbeated within the stale threshold and can be marked stopped.',
      severity: 'warning',
      workerCount: summary.staleWorkerCount
    });
  }
  if (summary.byStatus.active > 0) {
    actions.push({
      action: 'drain-workers',
      reason: 'Active workers can be asked to drain before planned maintenance.',
      severity: 'info',
      workerCount: summary.byStatus.active
    });
  }
  if (summary.byStatus.draining > 0) {
    actions.push({
      action: 'clear-workers-drain',
      reason: 'Draining workers can have their drain request cleared if maintenance is cancelled.',
      severity: 'info',
      workerCount: summary.byStatus.draining
    });
  }

  return actions;
}
