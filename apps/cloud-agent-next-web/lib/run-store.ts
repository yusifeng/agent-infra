import { randomUUID } from 'node:crypto';

import type { CloudRunEventPayloadV1, Run, RunEvent } from '@agent-infra/core';
import type { CloudRunEventRecord } from '@agent-infra/cloud-agent-runtime';

import type { AgentProviderId } from './provider-config';
import { getCloudAgentRepositories, withCloudAgentTransaction } from './db';

const CLOUD_AGENT_APP_ID = 'cloud-agent-next-web';

export async function createCloudAgentRun(input: {
  threadId: string;
  triggerMessageId: string;
  provider: AgentProviderId;
  model?: string | null;
}): Promise<Run> {
  return withCloudAgentTransaction((repositories) =>
    repositories.runRepo.create({
      id: randomUUID(),
      threadId: input.threadId,
      triggerMessageId: input.triggerMessageId,
      provider: input.provider,
      model: input.model ?? null,
      status: 'queued',
      usage: null,
      error: null,
      startedAt: null,
      finishedAt: null
    })
  );
}

export async function appendCloudRunEvent(input: {
  threadId: string;
  runId: string;
  type: CloudRunEventPayloadV1['type'];
  payload: CloudRunEventPayloadV1;
}): Promise<CloudRunEventRecord> {
  return withCloudAgentTransaction(async (repositories) => {
    const seq = await repositories.runEventRepo.nextSeq(input.runId);
    const event = await repositories.runEventRepo.append({
      id: randomUUID(),
      threadId: input.threadId,
      runId: input.runId,
      seq,
      type: input.type,
      payload: input.payload as unknown as Record<string, unknown>
    });
    return toCloudRunEventRecord(event);
  });
}

export async function getCloudRunForOwner(input: {
  ownerUserId: string;
  runId: string;
}): Promise<Run | null> {
  const repositories = await getCloudAgentRepositories();
  const run = await repositories.runRepo.findById(input.runId);
  if (!run) {
    return null;
  }

  const thread = await repositories.threadRepo.findById(run.threadId);
  if (!thread || thread.appId !== CLOUD_AGENT_APP_ID || thread.userId !== input.ownerUserId || thread.status !== 'active') {
    return null;
  }

  return run;
}

export async function listActiveCloudRunsForThreadOwner(input: {
  ownerUserId: string;
  threadId: string;
}): Promise<Run[] | null> {
  const repositories = await getCloudAgentRepositories();
  const thread = await repositories.threadRepo.findById(input.threadId);
  if (!thread || thread.appId !== CLOUD_AGENT_APP_ID || thread.userId !== input.ownerUserId || thread.status !== 'active') {
    return null;
  }

  return repositories.runRepo.listActiveByThread(thread.id);
}

export async function claimNextQueuedCloudAgentRun(input: {
  workerId: string;
  leaseMs?: number;
}): Promise<Run | null> {
  const repositories = await getCloudAgentRepositories();
  const now = new Date();
  return repositories.runRepo.claimNextQueued({
    appId: CLOUD_AGENT_APP_ID,
    workerId: input.workerId,
    leaseExpiresAt: new Date(now.getTime() + (input.leaseMs ?? 5 * 60 * 1000)),
    now
  });
}

export async function claimCloudAgentRunById(input: {
  runId: string;
  workerId: string;
  leaseMs?: number;
}): Promise<Run | null> {
  const repositories = await getCloudAgentRepositories();
  const now = new Date();
  return repositories.runRepo.claimById({
    runId: input.runId,
    workerId: input.workerId,
    leaseExpiresAt: new Date(now.getTime() + (input.leaseMs ?? 5 * 60 * 1000)),
    now
  });
}

export async function extendCloudAgentRunClaim(input: {
  runId: string;
  workerId: string;
  leaseMs?: number;
}): Promise<Run | null> {
  const repositories = await getCloudAgentRepositories();
  const now = new Date();
  return repositories.runRepo.extendClaim({
    runId: input.runId,
    workerId: input.workerId,
    leaseExpiresAt: new Date(now.getTime() + (input.leaseMs ?? 5 * 60 * 1000)),
    now
  });
}

export async function startCloudAgentRun(runId: string): Promise<Run> {
  const repositories = await getCloudAgentRepositories();
  const existing = await repositories.runRepo.findById(runId);
  if (existing?.status === 'cancelled') {
    return existing;
  }

  return repositories.runRepo.updateStatus(runId, 'running', {
    startedAt: new Date(),
    finishedAt: null,
    nextAttemptAt: null,
    error: null
  });
}

export async function isCloudAgentRunCancelled(runId: string): Promise<boolean> {
  const repositories = await getCloudAgentRepositories();
  const run = await repositories.runRepo.findById(runId);
  return run?.status === 'cancelled';
}

export async function cancelCloudAgentRunForOwner(input: {
  actorId: string;
  ownerUserId: string;
  reason?: string | null;
  runId: string;
}): Promise<
  | {
      events: CloudRunEventRecord[];
      run: Run;
      status: 'cancelled';
    }
  | {
      run: Run;
      status: 'already_terminal';
    }
  | null
> {
  const run = await getCloudRunForOwner({
    ownerUserId: input.ownerUserId,
    runId: input.runId
  });
  if (!run) {
    return null;
  }

  if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
    return {
      run,
      status: 'already_terminal'
    };
  }

  const cancelled = await failOrCancelCloudAgentRun({
    runId: run.id,
    status: 'cancelled',
    error: input.reason ?? 'Run cancelled.',
    finishedAt: new Date()
  });
  const event = await appendCloudRunEvent({
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
      reason: input.reason ?? 'Run cancelled.',
      cancelledByActorId: input.actorId
    }
  });
  const approvalEvents = await cancelPendingApprovalRequestsForRun({
    actorId: input.actorId,
    reason: input.reason ?? 'Run cancelled.',
    run: cancelled
  });

  return {
    events: [event, ...approvalEvents],
    run: cancelled,
    status: 'cancelled'
  };
}

async function cancelPendingApprovalRequestsForRun(input: {
  actorId: string;
  reason: string;
  run: Run;
}): Promise<CloudRunEventRecord[]> {
  const repositories = await getCloudAgentRepositories();
  const approvalRequests = await repositories.runApprovalRequestRepo.listByRun(input.run.id);
  const events: CloudRunEventRecord[] = [];
  for (const approvalRequest of approvalRequests) {
    if (approvalRequest.status !== 'pending') {
      continue;
    }

    const resolved = await repositories.runApprovalRequestRepo.resolvePending(approvalRequest.id, 'cancelled', {
      decision: 'denied',
      decisionReason: input.reason,
      resolvedByActorId: input.actorId,
      metadata: {
        ...(isRecord(approvalRequest.metadata) ? approvalRequest.metadata : {}),
        resolvedFrom: 'run_cancelled'
      },
      resolvedAt: new Date()
    });
    if (!resolved) {
      continue;
    }
    events.push(
      await appendCloudRunEvent({
        threadId: input.run.threadId,
        runId: input.run.id,
        type: 'approval_resolved',
        payload: {
          schemaVersion: 1,
          type: 'approval_resolved',
          provider: resolved.provider,
          model: input.run.model,
          workspaceId: resolved.workspaceId ?? null,
          threadId: input.run.threadId,
          runId: input.run.id,
          permissionRequestId: resolved.permissionRequestId,
          decision: 'denied',
          status: 'cancelled',
          reason: input.reason,
          resolvedByActorId: input.actorId
        }
      })
    );
  }

  return events;
}

export async function scheduleCloudAgentRunRetry(input: {
  error: string;
  nextAttemptAt: Date;
  runId: string;
}): Promise<Run> {
  const repositories = await getCloudAgentRepositories();
  return repositories.runRepo.updateStatus(input.runId, 'queued', {
    error: input.error,
    finishedAt: null,
    claimOwner: null,
    claimExpiresAt: null,
    nextAttemptAt: input.nextAttemptAt
  });
}

export async function completeCloudAgentRun(runId: string): Promise<Run> {
  const repositories = await getCloudAgentRepositories();
  return repositories.runRepo.updateStatus(runId, 'completed', {
    finishedAt: new Date(),
    nextAttemptAt: null,
    error: null
  });
}

export async function failCloudAgentRun(runId: string, error: string): Promise<Run> {
  return failOrCancelCloudAgentRun({
    runId,
    status: 'failed',
    error,
    finishedAt: new Date()
  });
}

async function failOrCancelCloudAgentRun(input: {
  error: string;
  finishedAt: Date;
  runId: string;
  status: 'cancelled' | 'failed';
}): Promise<Run> {
  const repositories = await getCloudAgentRepositories();
  return repositories.runRepo.updateStatus(input.runId, input.status, {
    finishedAt: input.finishedAt,
    nextAttemptAt: null,
    error: input.error
  });
}

export async function listCloudRunEventsForOwner(input: {
  ownerUserId: string;
  runId: string;
}): Promise<{ run: Run; events: CloudRunEventRecord[] } | null> {
  const repositories = await getCloudAgentRepositories();
  const run = await getCloudRunForOwner(input);
  if (!run) {
    return null;
  }

  const events = await repositories.runEventRepo.listByRun(run.id);
  return {
    run,
    events: events.map(toCloudRunEventRecord)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toCloudRunEventRecord(event: RunEvent): CloudRunEventRecord {
  return {
    id: event.id,
    threadId: event.threadId,
    runId: event.runId,
    seq: event.seq,
    type: event.type as CloudRunEventPayloadV1['type'],
    payload: event.payload as unknown as CloudRunEventPayloadV1,
    createdAt: event.createdAt.toISOString()
  };
}
