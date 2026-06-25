import type {
  ResolveRunApprovalRequestDto,
  RunApprovalRequestDto,
  RunApprovalRequestResponseDto,
  RunApprovalRequestsResponseDto
} from '@agent-infra/contracts';
import type { RunApprovalRequest } from '@agent-infra/core';

import { getCloudAgentRepositories } from './db';
import { publishCloudRunEvent } from './run-event-hub';
import { appendCloudRunEvent, getCloudRunForOwner } from './run-store';

export async function listRunApprovalRequestsForOwner(input: {
  ownerUserId: string;
  runId: string;
}): Promise<RunApprovalRequestsResponseDto | null> {
  const run = await getCloudRunForOwner(input);
  if (!run) {
    return null;
  }

  const repositories = await getCloudAgentRepositories();
  const approvalRequests = await repositories.runApprovalRequestRepo.listByRun(run.id);
  return {
    approvalRequests: approvalRequests.map(toRunApprovalRequestDto)
  };
}

export async function resolveRunApprovalRequestForOwner(input: {
  approvalRequestId: string;
  body: ResolveRunApprovalRequestDto;
  ownerUserId: string;
  runId: string;
}): Promise<{ status: 200 | 404 | 409; response: RunApprovalRequestResponseDto }> {
  const run = await getCloudRunForOwner({
    ownerUserId: input.ownerUserId,
    runId: input.runId
  });
  if (!run) {
    return { status: 404, response: { error: 'run not found' } };
  }

  const repositories = await getCloudAgentRepositories();
  const approvalRequest =
    (await repositories.runApprovalRequestRepo.findById(input.approvalRequestId)) ??
    (await repositories.runApprovalRequestRepo.findByProviderRequest({
      runId: run.id,
      provider: run.provider ?? 'claude',
      permissionRequestId: input.approvalRequestId
    }));
  if (!approvalRequest || approvalRequest.runId !== run.id) {
    return { status: 404, response: { error: 'approval request not found' } };
  }

  if (approvalRequest.status !== 'pending') {
    return {
      status: 409,
      response: {
        approvalRequest: toRunApprovalRequestDto(approvalRequest),
        error: 'approval request is already resolved'
      }
    };
  }

  const resolved = await repositories.runApprovalRequestRepo.resolvePending(approvalRequest.id, input.body.decision, {
    decision: input.body.decision,
    decisionReason: input.body.reason ?? null,
    resolvedByActorId: input.ownerUserId,
    metadata: {
      ...(isRecord(approvalRequest.metadata) ? approvalRequest.metadata : {}),
      resolvedFrom: 'http_api'
    },
    resolvedAt: new Date()
  });
  if (!resolved) {
    const current = (await repositories.runApprovalRequestRepo.findById(approvalRequest.id)) ?? approvalRequest;
    return {
      status: 409,
      response: {
        approvalRequest: toRunApprovalRequestDto(current),
        error: 'approval request is already resolved'
      }
    };
  }
  const event = await appendCloudRunEvent({
    threadId: run.threadId,
    runId: run.id,
    type: 'approval_resolved',
    payload: {
      schemaVersion: 1,
      type: 'approval_resolved',
      provider: resolved.provider,
      model: run.model,
      workspaceId: resolved.workspaceId ?? null,
      threadId: run.threadId,
      runId: run.id,
      permissionRequestId: resolved.permissionRequestId,
      decision: input.body.decision,
      status: input.body.decision,
      reason: input.body.reason ?? null,
      resolvedByActorId: input.ownerUserId
    }
  });
  publishCloudRunEvent(event);

  return {
    status: 200,
    response: {
      approvalRequest: toRunApprovalRequestDto(resolved)
    }
  };
}

export function toRunApprovalRequestDto(request: RunApprovalRequest): RunApprovalRequestDto {
  return {
    id: request.id,
    workspaceId: request.workspaceId,
    threadId: request.threadId,
    runId: request.runId,
    provider: request.provider,
    permissionRequestId: request.permissionRequestId,
    action: request.action,
    status: request.status,
    details: request.details,
    decision: request.decision,
    decisionReason: request.decisionReason,
    resolvedByActorId: request.resolvedByActorId,
    metadata: request.metadata,
    expiresAt: toIsoDate(request.expiresAt),
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    resolvedAt: toIsoDate(request.resolvedAt)
  };
}

function toIsoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
