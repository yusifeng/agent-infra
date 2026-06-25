import type { MessagePart } from '@agent-infra/core';

import type { CloudAgentUser } from './auth';
import { getCloudAgentRepositories } from './db';
import { CloudAgentRunCancelledError } from './agent-run-errors';
import type { AgentProviderId } from './provider-config';
import type { CloudThread } from './thread-store';
import { getThread } from './thread-store';

export interface LoadedCloudAgentRunJob {
  attemptCount: number;
  content: string;
  provider: AgentProviderId;
  runId: string;
  thread: CloudThread;
  user: CloudAgentUser;
}

export async function loadCloudAgentRunJob(runId: string): Promise<LoadedCloudAgentRunJob> {
  const repositories = await getCloudAgentRepositories();
  const run = await repositories.runRepo.findById(runId);
  if (!run) {
    throw new Error(`Run not found: ${runId}`);
  }
  if (run.status === 'cancelled') {
    throw new CloudAgentRunCancelledError(run.id);
  }

  const threadRow = await repositories.threadRepo.findById(run.threadId);
  if (!threadRow || threadRow.status !== 'active') {
    throw new Error(`Thread not found for run: ${run.id}`);
  }

  const ownerUserId = threadRow.userId ?? 'admin';
  const thread = await getThread(ownerUserId, threadRow.id);
  if (!thread) {
    throw new Error(`Thread is not accessible for run: ${run.id}`);
  }

  const triggerMessageId = run.triggerMessageId;
  if (!triggerMessageId) {
    throw new Error(`Run is missing trigger message: ${run.id}`);
  }

  const messages = await repositories.messageRepo.listByThread(thread.id);
  const triggerMessage = messages.find((message) => message.id === triggerMessageId);
  const content = triggerMessage ? textFromParts(triggerMessage.parts) : '';
  if (!content) {
    throw new Error(`Run trigger message is empty or missing: ${run.id}`);
  }

  return {
    attemptCount: run.attemptCount ?? 0,
    content,
    provider: readProvider(run.provider ?? thread.provider),
    runId: run.id,
    thread,
    user: userFromThreadOwner(ownerUserId)
  };
}

function readProvider(value: string | null | undefined): AgentProviderId {
  return value === 'codex' ? 'codex' : 'claude';
}

function textFromParts(parts: MessagePart[]): string {
  return parts
    .filter((part) => part.type === 'text' && part.textValue)
    .map((part) => part.textValue)
    .join('');
}

function userFromThreadOwner(ownerUserId: string): CloudAgentUser {
  return {
    id: ownerUserId,
    username: ownerUserId,
    displayName: ownerUserId
  };
}
