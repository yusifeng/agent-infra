import { readFile } from 'node:fs/promises';

import type {
  CloudRunEventDto,
  ProviderTranscriptEntryDto,
  RunDto,
  RunObservabilityDto,
  ToolInvocationDto,
  WorkspaceFileChangeDiffDto,
  WorkspaceFileChangeDto
} from '@agent-infra/contracts';
import { resolveInside } from '@agent-infra/cloud-agent-runtime';
import type {
  CloudRunEventPayloadV1,
  ProviderTranscriptEntry,
  Run,
  RunEvent,
  ToolInvocation,
  WorkspaceFileChange
} from '@agent-infra/core';

import { getCloudAgentRepositories } from './db';
import { toRunApprovalRequestDto } from './run-approval-store';
import { getCloudRunForOwner } from './run-store';
import { resolveCloudWorkspaceRuntimePaths } from './workspace-runtime';

const MAX_DIFF_FILE_BYTES = 64 * 1024;

export async function getRunObservabilityForOwner(input: {
  ownerUserId: string;
  runId: string;
}): Promise<RunObservabilityDto | null> {
  const repositories = await getCloudAgentRepositories();
  const run = await getCloudRunForOwner(input);
  if (!run) {
    return null;
  }

  const [events, approvalRequests, toolInvocations, workspaceFileChanges, providerTranscript, thread] = await Promise.all([
    repositories.runEventRepo.listByRun(run.id),
    repositories.runApprovalRequestRepo.listByRun(run.id),
    repositories.toolRepo.listByRun(run.id),
    repositories.workspaceFileChangeRepo.listByRun(run.id),
    repositories.providerTranscriptRepo.listByRun(run.id),
    repositories.threadRepo.findById(run.threadId)
  ]);
  const ownerUserId = thread?.userId ?? input.ownerUserId;

  return {
    schemaVersion: 1,
    run: toRunDto(run),
    events: events.map(toCloudRunEventDto),
    approvalRequests: approvalRequests.map(toRunApprovalRequestDto),
    toolInvocations: toolInvocations.map(toToolInvocationDto),
    workspaceFileChanges: await Promise.all(
      workspaceFileChanges.map((change) =>
        toWorkspaceFileChangeDto(change, {
          ownerUserId
        })
      )
    ),
    providerTranscript: providerTranscript.map(toProviderTranscriptEntryDto)
  };
}

function toRunDto(run: Run): RunDto {
  return {
    id: run.id,
    threadId: run.threadId,
    triggerMessageId: run.triggerMessageId,
    provider: run.provider,
    model: run.model,
    status: run.status,
    usage: run.usage,
    error: run.error,
    startedAt: toIsoDate(run.startedAt),
    finishedAt: toIsoDate(run.finishedAt),
    createdAt: run.createdAt.toISOString()
  };
}

function toCloudRunEventDto(event: RunEvent): CloudRunEventDto {
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

function toToolInvocationDto(tool: ToolInvocation): ToolInvocationDto {
  return {
    id: tool.id,
    threadId: tool.threadId,
    runId: tool.runId,
    messageId: tool.messageId,
    toolName: tool.toolName,
    toolCallId: tool.toolCallId,
    status: tool.status,
    input: tool.input,
    output: tool.output,
    error: tool.error,
    startedAt: toIsoDate(tool.startedAt),
    finishedAt: toIsoDate(tool.finishedAt),
    createdAt: tool.createdAt.toISOString()
  };
}

function toProviderTranscriptEntryDto(entry: ProviderTranscriptEntry): ProviderTranscriptEntryDto {
  return {
    id: entry.id,
    workspaceId: entry.workspaceId,
    threadId: entry.threadId,
    runId: entry.runId,
    provider: entry.provider,
    providerSessionId: entry.providerSessionId,
    providerProjectKey: entry.providerProjectKey,
    providerEntryId: entry.providerEntryId,
    ordinal: entry.ordinal,
    entryType: entry.entryType,
    rawJson: entry.rawJson,
    createdAt: entry.createdAt.toISOString()
  };
}

async function toWorkspaceFileChangeDto(
  change: WorkspaceFileChange,
  context: { ownerUserId: string }
): Promise<WorkspaceFileChangeDto> {
  return {
    id: change.id,
    changeSetId: change.changeSetId,
    workspaceId: change.workspaceId,
    threadId: change.threadId,
    runId: change.runId,
    path: change.path,
    changeType: change.changeType,
    beforeContentHash: change.beforeContentHash,
    afterContentHash: change.afterContentHash,
    artifactId: change.artifactId,
    metadata: change.metadata,
    diff: await buildWorkspaceFileChangeDiff(change, context),
    createdAt: change.createdAt.toISOString()
  };
}

async function buildWorkspaceFileChangeDiff(
  change: WorkspaceFileChange,
  context: { ownerUserId: string }
): Promise<WorkspaceFileChangeDiffDto> {
  const persistedDiff = readPersistedDiff(change.metadata);
  if (persistedDiff && !shouldResolveDiffFromWorkspace(persistedDiff)) {
    return persistedDiff;
  }

  if (change.changeType === 'modified') {
    return unavailableDiff('before_snapshot_not_available');
  }

  if (change.changeType === 'deleted') {
    return unavailableDiff('deleted_file_content_not_available');
  }

  const runtimePaths = resolveCloudWorkspaceRuntimePaths({
    userId: context.ownerUserId,
    workspaceId: change.workspaceId
  });
  const filePath = resolveInside(runtimePaths.hostWorkspacePath, change.path);
  const content = await readSmallUtf8File(filePath);
  if (!content) {
    return unavailableDiff('after_file_not_readable');
  }

  return {
    status: 'available',
    format: 'unified',
    beforePath: '/dev/null',
    afterPath: change.path,
    unifiedDiff: buildCreatedFileUnifiedDiff(change.path, content.text),
    truncated: content.truncated
  };
}

async function readSmallUtf8File(filePath: string): Promise<{ text: string; truncated: boolean } | null> {
  try {
    const content = await readFile(filePath);
    const truncated = content.byteLength > MAX_DIFF_FILE_BYTES;
    const slice = truncated ? content.subarray(0, MAX_DIFF_FILE_BYTES) : content;
    return {
      text: slice.toString('utf8'),
      truncated
    };
  } catch {
    return null;
  }
}

function buildCreatedFileUnifiedDiff(filePath: string, content: string): string {
  const lines = content.split('\n');
  if (lines.at(-1) === '') {
    lines.pop();
  }

  return [
    `--- /dev/null`,
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`)
  ].join('\n');
}

function unavailableDiff(reason: string): WorkspaceFileChangeDiffDto {
  return {
    status: 'unavailable',
    format: null,
    reason,
    beforePath: null,
    afterPath: null,
    unifiedDiff: null,
    truncated: false
  };
}

function readPersistedDiff(metadata: Record<string, unknown> | null | undefined): WorkspaceFileChangeDiffDto | null {
  if (!metadata || !isRecord(metadata.diff)) {
    return null;
  }

  const diff = metadata.diff;
  const status = diff.status === 'available' || diff.status === 'unavailable' ? diff.status : null;
  if (!status) {
    return null;
  }

  return {
    status,
    format: diff.format === 'unified' ? 'unified' : null,
    reason: readString(diff, 'reason'),
    beforePath: readString(diff, 'beforePath'),
    afterPath: readString(diff, 'afterPath'),
    unifiedDiff: readString(diff, 'unifiedDiff'),
    truncated: diff.truncated === true
  };
}

function shouldResolveDiffFromWorkspace(diff: WorkspaceFileChangeDiffDto): boolean {
  return diff.status === 'unavailable' && diff.reason === 'created_file_diff_resolved_from_workspace';
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toIsoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}
