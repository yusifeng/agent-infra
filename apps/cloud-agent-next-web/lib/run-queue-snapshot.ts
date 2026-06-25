import type { Run, RunStatus, RunStatusCount } from '@agent-infra/core';

import { getCloudAgentRepositories } from './db';
import { readCloudAgentWorkerQueueOptions } from './run-queue-provider';
import { appendCloudRunEvent } from './run-store';

const CLOUD_AGENT_APP_ID = 'cloud-agent-next-web';

export interface CloudAgentRunQueueRunSummary {
  attemptCount: number;
  claimExpiresAt: Date | null;
  claimOwner: string | null;
  createdAt: Date;
  error: string | null;
  finishedAt: Date | null;
  id: string;
  model: string | null;
  nextAttemptAt: Date | null;
  provider: string | null;
  startedAt: Date | null;
  status: RunStatus;
  threadId: string;
}

export interface CloudAgentRunQueueSnapshot {
  asOf: Date;
  counts: RunStatusCount;
  deadLetterRuns: CloudAgentRunQueueRunSummary[];
  deadLetterThreshold: number;
  delayedRuns: CloudAgentRunQueueRunSummary[];
  failedRuns: CloudAgentRunQueueRunSummary[];
  leaseExpiredRuns: CloudAgentRunQueueRunSummary[];
  queuedRuns: CloudAgentRunQueueRunSummary[];
  recommendedActions: CloudAgentRunQueueRecommendedAction[];
  runningRuns: CloudAgentRunQueueRunSummary[];
  summary: CloudAgentRunQueueSummary;
}

export interface CloudAgentRunQueueSummary {
  actionRequired: boolean;
  deadLetterCount: number;
  delayedCount: number;
  failedCount: number;
  leaseExpiredCount: number;
  oldestQueuedAt: Date | null;
  oldestRunningStartedAt: Date | null;
  queuedCount: number;
  retryableFailedCount: number;
  runningCount: number;
}

export interface CloudAgentRunQueueRecommendedAction {
  action: 'cancel-db-dead-letter-runs' | 'requeue-db-lease-expired-runs' | 'retry-db-failed-runs';
  reason: string;
  runCount: number;
  severity: 'critical' | 'info' | 'warning';
}

export interface CloudAgentRetryFailedRunsResult {
  deadLetterThreshold: number;
  nextAttemptAt: Date | null;
  retriedRuns: CloudAgentRunQueueRunSummary[];
  skippedDeadLetterRuns: CloudAgentRunQueueRunSummary[];
}

export interface CloudAgentRequeueLeaseExpiredRunsResult {
  nextAttemptAt: Date | null;
  requeuedRuns: CloudAgentRunQueueRunSummary[];
}

export interface CloudAgentCancelDeadLetterRunsResult {
  cancelledRuns: CloudAgentRunQueueRunSummary[];
  deadLetterThreshold: number;
}

export async function readCloudAgentRunQueueSnapshot(input: {
  limit?: number;
} = {}): Promise<CloudAgentRunQueueSnapshot> {
  const repositories = await getCloudAgentRepositories();
  const now = new Date();
  const limit = input.limit ?? 20;
  const deadLetterThreshold = readDeadLetterThreshold();
  const [counts, queuedRuns, runningRuns, failedRuns] = await Promise.all([
    repositories.runRepo.countByApp(CLOUD_AGENT_APP_ID),
    repositories.runRepo.listByApp(CLOUD_AGENT_APP_ID, { limit, statuses: ['queued'] }),
    repositories.runRepo.listByApp(CLOUD_AGENT_APP_ID, { limit, statuses: ['running'] }),
    repositories.runRepo.listByApp(CLOUD_AGENT_APP_ID, { limit, statuses: ['failed'] })
  ]);

  const deadLetterRuns = failedRuns.filter((run) => (run.attemptCount ?? 0) >= deadLetterThreshold).map(toSummary);
  const delayedRuns = queuedRuns.filter((run) => run.nextAttemptAt && run.nextAttemptAt.getTime() > now.getTime()).map(toSummary);
  const failedRunSummaries = failedRuns.map(toSummary);
  const leaseExpiredRuns = runningRuns.filter((run) => run.claimExpiresAt && run.claimExpiresAt.getTime() < now.getTime()).map(toSummary);
  const queuedRunSummaries = queuedRuns.map(toSummary);
  const runningRunSummaries = runningRuns.map(toSummary);
  const summary = summarizeRunQueueSnapshot({
    counts,
    deadLetterRuns,
    delayedRuns,
    failedRuns: failedRunSummaries,
    leaseExpiredRuns,
    queuedRuns: queuedRunSummaries,
    runningRuns: runningRunSummaries
  });

  return {
    asOf: now,
    counts,
    deadLetterRuns,
    deadLetterThreshold,
    delayedRuns,
    failedRuns: failedRunSummaries,
    leaseExpiredRuns,
    queuedRuns: queuedRunSummaries,
    recommendedActions: recommendRunQueueActions(summary),
    runningRuns: runningRunSummaries,
    summary
  };
}

export async function retryFailedCloudAgentRuns(input: {
  actorId: string;
  includeDeadLetter?: boolean;
  limit?: number;
  nextAttemptDelayMs?: number;
  reason?: string | null;
}): Promise<CloudAgentRetryFailedRunsResult> {
  const repositories = await getCloudAgentRepositories();
  const deadLetterThreshold = readDeadLetterThreshold();
  const failedRuns = await repositories.runRepo.listByApp(CLOUD_AGENT_APP_ID, {
    limit: input.limit ?? 20,
    statuses: ['failed']
  });
  const retryableRuns = input.includeDeadLetter
    ? failedRuns
    : failedRuns.filter((run) => (run.attemptCount ?? 0) < deadLetterThreshold);
  const skippedDeadLetterRuns = input.includeDeadLetter
    ? []
    : failedRuns.filter((run) => (run.attemptCount ?? 0) >= deadLetterThreshold).map(toSummary);
  const nextAttemptAt =
    input.nextAttemptDelayMs && input.nextAttemptDelayMs > 0
      ? new Date(Date.now() + input.nextAttemptDelayMs)
      : null;
  const retriedRuns: CloudAgentRunQueueRunSummary[] = [];

  for (const run of retryableRuns) {
    const retried = await repositories.runRepo.updateStatus(run.id, 'queued', {
      claimExpiresAt: null,
      claimOwner: null,
      error: null,
      finishedAt: null,
      nextAttemptAt
    });
    await appendCloudRunEvent({
      threadId: retried.threadId,
      runId: retried.id,
      type: 'run_requeued',
      payload: {
        schemaVersion: 1,
        type: 'run_requeued',
        provider: retried.provider,
        model: retried.model,
        threadId: retried.threadId,
        runId: retried.id,
        reason: input.reason ?? 'Failed run requeued from runtime queue operation.',
        requeuedByActorId: input.actorId,
        nextAttemptAt: nextAttemptAt?.toISOString() ?? null
      }
    });
    retriedRuns.push(toSummary(retried));
  }

  return {
    deadLetterThreshold,
    nextAttemptAt,
    retriedRuns,
    skippedDeadLetterRuns
  };
}

export async function requeueLeaseExpiredCloudAgentRuns(input: {
  actorId: string;
  limit?: number;
  nextAttemptDelayMs?: number;
  reason?: string | null;
}): Promise<CloudAgentRequeueLeaseExpiredRunsResult> {
  const repositories = await getCloudAgentRepositories();
  const now = new Date();
  const runningRuns = await repositories.runRepo.listByApp(CLOUD_AGENT_APP_ID, {
    limit: input.limit ?? 20,
    statuses: ['running']
  });
  const leaseExpiredRuns = runningRuns.filter((run) => run.claimExpiresAt && run.claimExpiresAt.getTime() < now.getTime());
  const nextAttemptAt =
    input.nextAttemptDelayMs && input.nextAttemptDelayMs > 0
      ? new Date(now.getTime() + input.nextAttemptDelayMs)
      : null;
  const requeuedRuns: CloudAgentRunQueueRunSummary[] = [];

  for (const run of leaseExpiredRuns) {
    const requeued = await repositories.runRepo.updateStatus(run.id, 'queued', {
      claimExpiresAt: null,
      claimOwner: null,
      error: null,
      finishedAt: null,
      nextAttemptAt
    });
    await appendCloudRunEvent({
      threadId: requeued.threadId,
      runId: requeued.id,
      type: 'run_requeued',
      payload: {
        schemaVersion: 1,
        type: 'run_requeued',
        provider: requeued.provider,
        model: requeued.model,
        threadId: requeued.threadId,
        runId: requeued.id,
        reason: input.reason ?? 'Lease-expired run requeued from runtime queue operation.',
        requeuedByActorId: input.actorId,
        nextAttemptAt: nextAttemptAt?.toISOString() ?? null
      }
    });
    requeuedRuns.push(toSummary(requeued));
  }

  return {
    nextAttemptAt,
    requeuedRuns
  };
}

export async function cancelDeadLetterCloudAgentRuns(input: {
  actorId: string;
  limit?: number;
  reason?: string | null;
}): Promise<CloudAgentCancelDeadLetterRunsResult> {
  const repositories = await getCloudAgentRepositories();
  const deadLetterThreshold = readDeadLetterThreshold();
  const failedRuns = await repositories.runRepo.listByApp(CLOUD_AGENT_APP_ID, {
    limit: input.limit ?? 20,
    statuses: ['failed']
  });
  const deadLetterRuns = failedRuns.filter((run) => (run.attemptCount ?? 0) >= deadLetterThreshold);
  const cancelledRuns: CloudAgentRunQueueRunSummary[] = [];

  for (const run of deadLetterRuns) {
    const cancelled = await repositories.runRepo.updateStatus(run.id, 'cancelled', {
      finishedAt: new Date(),
      nextAttemptAt: null
    });
    await appendCloudRunEvent({
      threadId: cancelled.threadId,
      runId: cancelled.id,
      type: 'run_cancelled',
      payload: {
        schemaVersion: 1,
        type: 'run_cancelled',
        provider: cancelled.provider,
        model: cancelled.model,
        threadId: cancelled.threadId,
        runId: cancelled.id,
        reason: input.reason ?? 'Dead-letter run cancelled from runtime queue operation.',
        cancelledByActorId: input.actorId
      }
    });
    cancelledRuns.push(toSummary(cancelled));
  }

  return {
    cancelledRuns,
    deadLetterThreshold
  };
}

function readDeadLetterThreshold(): number {
  return readCloudAgentWorkerQueueOptions().maxAttempts ?? 3;
}

function summarizeRunQueueSnapshot(input: {
  counts: RunStatusCount;
  deadLetterRuns: CloudAgentRunQueueRunSummary[];
  delayedRuns: CloudAgentRunQueueRunSummary[];
  failedRuns: CloudAgentRunQueueRunSummary[];
  leaseExpiredRuns: CloudAgentRunQueueRunSummary[];
  queuedRuns: CloudAgentRunQueueRunSummary[];
  runningRuns: CloudAgentRunQueueRunSummary[];
}): CloudAgentRunQueueSummary {
  const retryableFailedCount = input.failedRuns.length - input.deadLetterRuns.length;
  return {
    actionRequired: input.leaseExpiredRuns.length > 0 || input.deadLetterRuns.length > 0 || retryableFailedCount > 0,
    deadLetterCount: input.deadLetterRuns.length,
    delayedCount: input.delayedRuns.length,
    failedCount: input.counts.failed ?? input.failedRuns.length,
    leaseExpiredCount: input.leaseExpiredRuns.length,
    oldestQueuedAt: minDate(input.queuedRuns.map((run) => run.createdAt)),
    oldestRunningStartedAt: minDate(input.runningRuns.map((run) => run.startedAt ?? run.createdAt)),
    queuedCount: input.counts.queued ?? input.queuedRuns.length,
    retryableFailedCount,
    runningCount: input.counts.running ?? input.runningRuns.length
  };
}

function recommendRunQueueActions(summary: CloudAgentRunQueueSummary): CloudAgentRunQueueRecommendedAction[] {
  const actions: CloudAgentRunQueueRecommendedAction[] = [];
  if (summary.leaseExpiredCount > 0) {
    actions.push({
      action: 'requeue-db-lease-expired-runs',
      reason: 'Running runs have expired worker leases and can be explicitly returned to the queue.',
      runCount: summary.leaseExpiredCount,
      severity: 'critical'
    });
  }
  if (summary.retryableFailedCount > 0) {
    actions.push({
      action: 'retry-db-failed-runs',
      reason: 'Failed runs below the dead-letter threshold are available for retry.',
      runCount: summary.retryableFailedCount,
      severity: 'warning'
    });
  }
  if (summary.deadLetterCount > 0) {
    actions.push({
      action: 'cancel-db-dead-letter-runs',
      reason: 'Failed runs have reached the dead-letter threshold and need explicit operator handling.',
      runCount: summary.deadLetterCount,
      severity: 'warning'
    });
  }

  return actions;
}

function minDate(values: Date[]): Date | null {
  if (values.length === 0) {
    return null;
  }

  return new Date(Math.min(...values.map((value) => value.getTime())));
}

function toSummary(run: Run): CloudAgentRunQueueRunSummary {
  return {
    attemptCount: run.attemptCount ?? 0,
    claimExpiresAt: run.claimExpiresAt ?? null,
    claimOwner: run.claimOwner ?? null,
    createdAt: run.createdAt,
    error: run.error ?? null,
    finishedAt: run.finishedAt ?? null,
    id: run.id,
    model: run.model ?? null,
    nextAttemptAt: run.nextAttemptAt ?? null,
    provider: run.provider ?? null,
    startedAt: run.startedAt ?? null,
    status: run.status,
    threadId: run.threadId
  };
}
