import {
  mapAgentRuntimeEventToCloudRunEvent,
  type AgentRuntimeEvent
} from '@agent-infra/cloud-agent-runtime';
import type {
  ApprovalResolvedEventPayloadV1,
  CloudRunEventPayloadV1,
  FileChangeDetectedEventPayloadV1,
  PermissionRequestedEventPayloadV1,
  RunApprovalRequest,
  WorkspaceChangeSet
} from '@agent-infra/core';

import { getCloudAgentRepositories } from './db';
import type { AgentProviderId } from './provider-config';
import { publishCloudRunEvent } from './run-event-hub';
import { appendCloudRunEvent } from './run-store';
import { bindThreadProviderSession, type CloudThread } from './thread-store';

export async function recordCloudAgentRuntimeEvent(input: {
  ownerUserId: string;
  provider: AgentProviderId;
  thread: CloudThread;
  runId: string;
  event: AgentRuntimeEvent;
}) {
  const mapped = mapAgentRuntimeEventToCloudRunEvent(input.event, {
    provider: input.provider,
    workspaceId: input.thread.workspaceId,
    threadId: input.thread.id,
    runId: input.runId
  });

  if (mapped) {
    if (
      mapped.payload.type === 'approval_resolved' &&
      (await shouldSkipDuplicateApprovalResolvedEvent({
        provider: input.provider,
        runId: input.runId,
        payload: mapped.payload
      }))
    ) {
      return mapped;
    }

    const record = await appendCloudRunEvent({
      threadId: input.thread.id,
      runId: input.runId,
      type: mapped.type,
      payload: mapped.payload
    });
    await syncApprovalRequestState({
      ownerUserId: input.ownerUserId,
      provider: input.provider,
      thread: input.thread,
      runId: input.runId,
      payload: mapped.payload,
      rawEvent: input.event
    });
    await syncWorkspaceFileChangeState({
      provider: input.provider,
      thread: input.thread,
      runId: input.runId,
      payload: mapped.payload,
      runEvent: record
    });
    publishCloudRunEvent(record);
  }

  if (mapped?.payload.type === 'provider_session_bound') {
    await bindThreadProviderSession({
      ownerUserId: input.ownerUserId,
      threadId: input.thread.id,
      runId: input.runId,
      providerSessionId: mapped.payload.providerSessionId,
      providerProjectKey: mapped.payload.providerProjectKey ?? null
    });
  }

  return mapped;
}

async function syncWorkspaceFileChangeState(input: {
  provider: AgentProviderId;
  thread: CloudThread;
  runId: string;
  payload: CloudRunEventPayloadV1;
  runEvent: {
    id: string;
    seq: number;
  };
}) {
  if (input.payload.type !== 'file_change_detected') {
    return;
  }

  const filePath = normalizeWorkspaceRelativePath(input.payload.path);
  if (!filePath) {
    return;
  }

  const repositories = await getCloudAgentRepositories();
  const changeSet = await getOrCreateRuntimeFileChangeSet({
    provider: input.provider,
    thread: input.thread,
    runId: input.runId
  });
  const contentHash = readContentHash(input.payload);

  await repositories.workspaceFileChangeRepo.create({
    changeSetId: changeSet.id,
    workspaceId: input.thread.workspaceId,
    threadId: input.thread.id,
    runId: input.runId,
    path: filePath,
    changeType: input.payload.changeType,
    beforeContentHash: input.payload.changeType === 'deleted' ? contentHash : null,
    afterContentHash: input.payload.changeType === 'deleted' ? null : contentHash,
    artifactId: null,
    metadata: {
      source: 'file_change_detected',
      provider: input.provider,
      runEventId: input.runEvent.id,
      runEventSeq: input.runEvent.seq,
      toolCallId: input.payload.toolCallId ?? null
    }
  });

  await updateWorkspaceFileIndex({
    changeSet,
    filePath,
    payload: input.payload,
    provider: input.provider,
    runId: input.runId,
    threadId: input.thread.id,
    workspaceId: input.thread.workspaceId
  });
}

async function getOrCreateRuntimeFileChangeSet(input: {
  provider: AgentProviderId;
  thread: CloudThread;
  runId: string;
}): Promise<WorkspaceChangeSet> {
  const repositories = await getCloudAgentRepositories();
  const existing = (await repositories.workspaceChangeSetRepo.listByRun(input.runId)).find((changeSet) => {
    const metadata = changeSet.metadata;
    return isRecord(metadata) && metadata.source === 'file_change_detected';
  });
  if (existing) {
    return existing;
  }

  return repositories.workspaceChangeSetRepo.create({
    workspaceId: input.thread.workspaceId,
    threadId: input.thread.id,
    runId: input.runId,
    status: 'pending',
    baseSnapshotId: null,
    nextSnapshotId: null,
    metadata: {
      source: 'file_change_detected',
      provider: input.provider
    },
    resolvedAt: null
  });
}

async function updateWorkspaceFileIndex(input: {
  changeSet: WorkspaceChangeSet;
  filePath: string;
  payload: FileChangeDetectedEventPayloadV1;
  provider: AgentProviderId;
  runId: string;
  threadId: string;
  workspaceId: string;
}) {
  const repositories = await getCloudAgentRepositories();
  const now = new Date();
  const metadata = {
    source: 'file_change_detected',
    provider: input.provider,
    lastChangeSetId: input.changeSet.id,
    lastRunId: input.runId,
    lastThreadId: input.threadId,
    lastToolCallId: input.payload.toolCallId ?? null
  };

  if (input.payload.changeType === 'deleted') {
    try {
      await repositories.workspaceFileIndexRepo.markDeleted({
        workspaceId: input.workspaceId,
        path: input.filePath,
        deletedAt: now
      });
      return;
    } catch {
      await repositories.workspaceFileIndexRepo.upsert({
        workspaceId: input.workspaceId,
        path: input.filePath,
        kind: 'file',
        sizeBytes: null,
        mimeType: null,
        contentHash: null,
        previewCapability: null,
        metadata,
        deletedAt: now
      });
      return;
    }
  }

  await repositories.workspaceFileIndexRepo.upsert({
    workspaceId: input.workspaceId,
    path: input.filePath,
    kind: 'file',
    sizeBytes: null,
    mimeType: null,
    contentHash: readContentHash(input.payload),
    previewCapability: null,
    metadata,
    deletedAt: null
  });
}

async function syncApprovalRequestState(input: {
  ownerUserId: string;
  provider: AgentProviderId;
  thread: CloudThread;
  runId: string;
  payload: CloudRunEventPayloadV1;
  rawEvent: AgentRuntimeEvent;
}) {
  if (input.payload.type === 'permission_requested') {
    await createDurableApprovalRequest({
      provider: input.provider,
      thread: input.thread,
      runId: input.runId,
      payload: input.payload
    });
    return;
  }

  if (input.payload.type === 'approval_resolved') {
    await resolveDurableApprovalRequest({
      ownerUserId: input.ownerUserId,
      provider: input.provider,
      runId: input.runId,
      payload: input.payload,
      rawEvent: input.rawEvent
    });
  }
}

async function createDurableApprovalRequest(input: {
  provider: AgentProviderId;
  thread: CloudThread;
  runId: string;
  payload: PermissionRequestedEventPayloadV1;
}) {
  const repositories = await getCloudAgentRepositories();
  const existing = await repositories.runApprovalRequestRepo.findByProviderRequest({
    runId: input.runId,
    provider: input.provider,
    permissionRequestId: input.payload.permissionRequestId
  });
  if (existing) {
    return;
  }

  await repositories.runApprovalRequestRepo.create({
    workspaceId: input.thread.workspaceId,
    threadId: input.thread.id,
    runId: input.runId,
    provider: input.provider,
    permissionRequestId: input.payload.permissionRequestId,
    action: input.payload.action,
    details: input.payload.details ?? null,
    decision: null,
    decisionReason: null,
    resolvedByActorId: null,
    metadata: {
      source: 'runtime_event'
    },
    expiresAt: null
  });
}

async function resolveDurableApprovalRequest(input: {
  ownerUserId: string;
  provider: AgentProviderId;
  runId: string;
  payload: ApprovalResolvedEventPayloadV1;
  rawEvent: AgentRuntimeEvent;
}) {
  const repositories = await getCloudAgentRepositories();
  const request = await repositories.runApprovalRequestRepo.findPendingByProviderRequest({
    runId: input.runId,
    provider: input.provider,
    permissionRequestId: input.payload.permissionRequestId
  });
  if (!request) {
    return;
  }

  await repositories.runApprovalRequestRepo.resolvePending(request.id, readApprovalResolvedStatus(input.payload), {
    decision: input.payload.decision,
    decisionReason: input.payload.reason ?? readString(input.rawEvent.payload, 'reason'),
    resolvedByActorId: input.payload.resolvedByActorId ?? input.ownerUserId,
    metadata: mergeApprovalMetadata(request, {
      resolvedFrom: 'runtime_event'
    }),
    resolvedAt: new Date()
  });
}

async function shouldSkipDuplicateApprovalResolvedEvent(input: {
  provider: AgentProviderId;
  runId: string;
  payload: ApprovalResolvedEventPayloadV1;
}): Promise<boolean> {
  const repositories = await getCloudAgentRepositories();
  const request = await repositories.runApprovalRequestRepo.findByProviderRequest({
    runId: input.runId,
    provider: input.provider,
    permissionRequestId: input.payload.permissionRequestId
  });

  return Boolean(request && request.status !== 'pending');
}

function readApprovalResolvedStatus(
  payload: ApprovalResolvedEventPayloadV1
): Extract<RunApprovalRequest['status'], 'approved' | 'denied' | 'expired' | 'cancelled'> {
  if (payload.status === 'expired' || payload.status === 'cancelled') {
    return payload.status;
  }

  return payload.decision === 'approved' ? 'approved' : 'denied';
}

function mergeApprovalMetadata(
  request: RunApprovalRequest,
  patch: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...(isRecord(request.metadata) ? request.metadata : {}),
    ...patch
  };
}

function readString(payload: AgentRuntimeEvent['payload'], key: string): string | null {
  if (!isRecord(payload)) {
    return null;
  }
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readContentHash(payload: FileChangeDetectedEventPayloadV1): string | null {
  return typeof payload.contentHash === 'string' && payload.contentHash.length > 0 ? payload.contentHash : null;
}

function normalizeWorkspaceRelativePath(value: string): string | null {
  const normalized = value.replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return null;
  }

  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) {
    return null;
  }

  return parts.join('/');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
