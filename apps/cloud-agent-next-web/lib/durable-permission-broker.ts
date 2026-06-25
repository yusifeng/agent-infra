import { setTimeout as delay } from 'node:timers/promises';

import type { PermissionBroker, PermissionDecision, PermissionRequest } from '@agent-infra/cloud-agent-runtime';
import type { RunApprovalRequest } from '@agent-infra/core';

import { getCloudAgentRepositories } from './db';
import { appendCloudRunEvent } from './run-store';

export interface DurablePermissionBrokerOptions {
  pollMs?: number;
  timeoutMs?: number;
}

const DEFAULT_APPROVAL_POLL_MS = 500;
const DEFAULT_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

export class DurablePermissionBroker implements PermissionBroker {
  private readonly pollMs: number;
  private readonly timeoutMs: number;

  constructor(options: DurablePermissionBrokerOptions = {}) {
    this.pollMs = Math.max(100, options.pollMs ?? DEFAULT_APPROVAL_POLL_MS);
    this.timeoutMs = Math.max(this.pollMs, options.timeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS);
  }

  async resolve(request: PermissionRequest): Promise<PermissionDecision> {
    if (!request.scope.runId) {
      return {
        decision: 'denied',
        reason: 'Permission request is missing a run id.',
        resolvedByActorId: 'durable-permission-broker'
      };
    }

    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() <= deadline) {
      if (await this.isRunCancelled(request.scope.runId)) {
        return {
          decision: 'denied',
          approvalStatus: 'cancelled',
          reason: 'Run was cancelled.',
          resolvedByActorId: 'durable-permission-broker'
        };
      }

      const current = await this.findApprovalRequest(request);
      const decision = toPermissionDecision(current);
      if (decision) {
        return decision;
      }

      await delay(this.pollMs);
    }

    await this.expirePendingRequest(request);
    return {
      decision: 'denied',
      approvalStatus: 'expired',
      reason: `Approval request timed out after ${this.timeoutMs}ms.`,
      resolvedByActorId: 'durable-permission-broker'
    };
  }

  private async findApprovalRequest(request: PermissionRequest): Promise<RunApprovalRequest | null> {
    if (!request.scope.runId) {
      return null;
    }

    const repositories = await getCloudAgentRepositories();
    return repositories.runApprovalRequestRepo.findByProviderRequest({
      runId: request.scope.runId,
      provider: request.provider,
      permissionRequestId: request.permissionRequestId
    });
  }

  private async isRunCancelled(runId: string): Promise<boolean> {
    const repositories = await getCloudAgentRepositories();
    const run = await repositories.runRepo.findById(runId);
    return run?.status === 'cancelled';
  }

  private async expirePendingRequest(request: PermissionRequest): Promise<void> {
    if (!request.scope.runId) {
      return;
    }

    const repositories = await getCloudAgentRepositories();
    const pending = await repositories.runApprovalRequestRepo.findPendingByProviderRequest({
      runId: request.scope.runId,
      provider: request.provider,
      permissionRequestId: request.permissionRequestId
    });
    if (!pending) {
      return;
    }

    const now = new Date();
    const reason = `Approval request timed out after ${this.timeoutMs}ms.`;
    const resolved = await repositories.runApprovalRequestRepo.resolvePending(pending.id, 'expired', {
      decision: 'denied',
      decisionReason: reason,
      resolvedByActorId: 'durable-permission-broker',
      metadata: {
        ...(isRecord(pending.metadata) ? pending.metadata : {}),
        resolvedFrom: 'durable_permission_broker_timeout'
      },
      resolvedAt: now
    });
    if (!resolved) {
      return;
    }
    await appendCloudRunEvent({
      threadId: pending.threadId,
      runId: pending.runId,
      type: 'approval_resolved',
      payload: {
        schemaVersion: 1,
        type: 'approval_resolved',
        provider: pending.provider,
        workspaceId: pending.workspaceId,
        threadId: pending.threadId,
        runId: pending.runId,
        permissionRequestId: pending.permissionRequestId,
        decision: 'denied',
        status: 'expired',
        reason,
        resolvedByActorId: 'durable-permission-broker'
      }
    });
  }
}

export function shouldUseDurablePermissionBroker(env: Record<string, string | undefined>): boolean {
  return env.CLOUD_AGENT_APPROVAL_BRIDGE?.trim() === 'durable';
}

export function createDurablePermissionBrokerFromEnv(env: Record<string, string | undefined>): DurablePermissionBroker {
  return new DurablePermissionBroker({
    pollMs: readPositiveNumber(env.CLOUD_AGENT_APPROVAL_POLL_MS),
    timeoutMs: readPositiveNumber(env.CLOUD_AGENT_APPROVAL_TIMEOUT_MS)
  });
}

function toPermissionDecision(request: RunApprovalRequest | null): PermissionDecision | null {
  if (!request) {
    return null;
  }

  if (request.status === 'approved') {
    return {
      decision: 'approved',
      approvalStatus: 'approved',
      reason: request.decisionReason,
      resolvedByActorId: request.resolvedByActorId,
      classification: 'user_temporary'
    };
  }

  if (request.status === 'denied' || request.status === 'expired' || request.status === 'cancelled') {
    return {
      decision: 'denied',
      approvalStatus: request.status,
      reason:
        request.decisionReason ??
        (request.status === 'expired'
          ? 'Approval request expired.'
          : request.status === 'cancelled'
            ? 'Run was cancelled.'
            : 'Permission denied.'),
      resolvedByActorId: request.resolvedByActorId,
      classification: 'user_reject'
    };
  }

  return null;
}

function readPositiveNumber(value: string | undefined): number | undefined {
  const parsed = Number(value?.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
