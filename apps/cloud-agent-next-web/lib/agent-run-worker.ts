import type { MessagePart } from '@agent-infra/core';

import { streamCloudAgentTurn } from './agent-runtime';
import type { CloudAgentUser } from './auth';
import { getCloudAgentRepositories } from './db';
import type { AgentProviderId } from './provider-config';
import { closeCloudRunEventStream } from './run-event-hub';
import {
  completeCloudAgentRun,
  extendCloudAgentRunClaim,
  failCloudAgentRun,
  isCloudAgentRunCancelled,
  scheduleCloudAgentRunRetry,
  startCloudAgentRun
} from './run-store';
import { recordCloudAgentRuntimeEvent } from './runtime-event-recorder';
import type { CloudMessage, CloudThread } from './thread-store';
import { appendAssistantMessage, archiveThreadProviderSession, getThread } from './thread-store';
import { createToolInvocationAccumulator } from './tool-invocation-recorder';
import { captureWorkspaceDiffBaseline, persistWorkspaceDiff } from './workspace-diff-recorder';

export interface CloudAgentRunJob {
  runId: string;
}

export interface CloudAgentRunResult {
  error: string | null;
  failed: boolean;
  message: CloudMessage;
  messages: CloudMessage[];
  thread: CloudThread;
}

export interface CloudAgentRunHandle {
  done: Promise<CloudAgentRunResult>;
  runId: string;
}

export interface CloudAgentRunExecutionOptions {
  leaseMs?: number;
  maxAttempts?: number;
  retryBaseMs?: number;
  workerId?: string | null;
}

interface LoadedCloudAgentRunJob {
  attemptCount: number;
  content: string;
  provider: AgentProviderId;
  runId: string;
  thread: CloudThread;
  user: CloudAgentUser;
}

class InProcessCloudAgentRunQueue {
  private readonly activeRuns = new Map<string, Promise<CloudAgentRunResult>>();

  enqueue(job: CloudAgentRunJob): CloudAgentRunHandle {
    const existing = this.activeRuns.get(job.runId);
    if (existing) {
      return {
        runId: job.runId,
        done: existing
      };
    }

    const done = executeCloudAgentRun(job).finally(() => {
      this.activeRuns.delete(job.runId);
    });
    this.activeRuns.set(job.runId, done);

    return {
      runId: job.runId,
      done
    };
  }
}

const globalForCloudAgentRunQueue = globalThis as typeof globalThis & {
  __cloudAgentRunQueue?: InProcessCloudAgentRunQueue;
};

export function getCloudAgentRunQueue(): InProcessCloudAgentRunQueue {
  if (!globalForCloudAgentRunQueue.__cloudAgentRunQueue) {
    globalForCloudAgentRunQueue.__cloudAgentRunQueue = new InProcessCloudAgentRunQueue();
  }

  return globalForCloudAgentRunQueue.__cloudAgentRunQueue;
}

export function enqueueCloudAgentRun(job: CloudAgentRunJob): CloudAgentRunHandle {
  return getCloudAgentRunQueue().enqueue(job);
}

export function runCloudAgentRunJob(runId: string, options: CloudAgentRunExecutionOptions = {}): Promise<CloudAgentRunResult> {
  return executeCloudAgentRun({ runId }, options);
}

async function executeCloudAgentRun(
  job: CloudAgentRunJob,
  options: CloudAgentRunExecutionOptions = {}
): Promise<CloudAgentRunResult> {
  let loadedJob: LoadedCloudAgentRunJob;
  let stopLeaseRenewal: (() => void) | null = null;
  try {
    loadedJob = await loadCloudAgentRunJob(job.runId);
    const started = await startCloudAgentRun(job.runId);
    if (started.status === 'cancelled') {
      throw new CloudAgentRunCancelledError(job.runId);
    }
    stopLeaseRenewal = startClaimRenewal(job.runId, options);
  } catch (error) {
    if (isCloudAgentRunCancelledError(error)) {
      closeCloudRunEventStream(job.runId);
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    await failCloudAgentRun(job.runId, message).catch(() => undefined);
    closeCloudRunEventStream(job.runId);
    throw error;
  }

  try {
    return await executeLoadedCloudAgentRun(loadedJob);
  } catch (error) {
    if (isCloudAgentRunCancelledError(error)) {
      closeCloudRunEventStream(job.runId);
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (shouldRetryWorkerRun(loadedJob, options)) {
      await scheduleCloudAgentRunRetry({
        runId: job.runId,
        error: message,
        nextAttemptAt: new Date(Date.now() + retryDelayMs(loadedJob, options))
      });
      closeCloudRunEventStream(job.runId);
      throw error;
    }

    await failCloudAgentRun(job.runId, message).catch(() => undefined);
    closeCloudRunEventStream(job.runId);
    throw error;
  } finally {
    stopLeaseRenewal?.();
  }
}

async function runCloudAgentAttempt(
  job: LoadedCloudAgentRunJob,
  thread: CloudThread,
  options: { allowResumeFallback: boolean }
): Promise<{
  assistantContent: string;
  failure: string | null;
  resumeFallbackReason: string | null;
  toolInvocations: ReturnType<typeof createToolInvocationAccumulator>;
}> {
  let assistantContent = '';
  let failure: string | null = null;
  const toolInvocations = createToolInvocationAccumulator();

  try {
    for await (const event of streamCloudAgentTurn({
      user: job.user,
      thread,
      provider: job.provider,
      content: job.content,
      runId: job.runId
    })) {
      if (await isCloudAgentRunCancelled(job.runId)) {
        throw new CloudAgentRunCancelledError(job.runId);
      }

      if (event.type === 'agent_failed') {
        const error = readPayloadString(event.payload, 'error') ?? 'Agent run failed.';
        if (options.allowResumeFallback && thread.providerSessionId && shouldRetryWithoutProviderSession(error)) {
          return {
            assistantContent: '',
            failure: null,
            resumeFallbackReason: error,
            toolInvocations
          };
        }

        failure = error;
      }

      await recordCloudAgentRuntimeEvent({
        ownerUserId: job.user.id,
        provider: job.provider,
        thread,
        runId: job.runId,
        event
      });
      toolInvocations.record(event);

      if (event.type === 'agent_message_delta') {
        assistantContent += readPayloadString(event.payload, 'content') ?? '';
      }
      if (event.type === 'agent_completed') {
        assistantContent = readPayloadString(event.payload, 'content') ?? assistantContent;
      }
    }
  } catch (error) {
    if (isCloudAgentRunCancelledError(error)) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (options.allowResumeFallback && thread.providerSessionId && shouldRetryWithoutProviderSession(message)) {
      return {
        assistantContent: '',
        failure: null,
        resumeFallbackReason: message,
        toolInvocations
      };
    }

    failure = message;
  }

  return {
    assistantContent,
    failure,
    resumeFallbackReason: null,
    toolInvocations
  };
}

async function executeLoadedCloudAgentRun(job: LoadedCloudAgentRunJob): Promise<CloudAgentRunResult> {
  const workspaceDiffBaseline = await captureWorkspaceDiffBaseline({
    provider: job.provider,
    thread: job.thread,
    userId: job.user.id
  });
  let attempt = await runCloudAgentAttempt(job, job.thread, { allowResumeFallback: true });
  if (attempt.resumeFallbackReason) {
    const recoveryStrategy = resolveProviderSessionRecoveryStrategy(job.thread);
    await recordCloudAgentRuntimeEvent({
      ownerUserId: job.user.id,
      provider: job.provider,
      thread: job.thread,
      runId: job.runId,
      event: {
        type: 'provider_session_recovery',
        payload: {
          provider: job.provider,
          strategy: recoveryStrategy,
          reason: attempt.resumeFallbackReason,
          previousProviderSessionId: job.thread.providerSessionId ?? null
        }
      }
    });
    const retryThread = await archiveThreadProviderSession({
      ownerUserId: job.user.id,
      threadId: job.thread.id,
      provider: job.provider,
      runId: job.runId,
      reason: attempt.resumeFallbackReason
    });
    attempt = await runCloudAgentAttempt(
      job,
      {
        ...retryThread,
        providerSessionId: null,
        providerSessionMetadata: job.thread.providerSessionMetadata
      },
      { allowResumeFallback: false }
    );
  }

  if (await isCloudAgentRunCancelled(job.runId)) {
    throw new CloudAgentRunCancelledError(job.runId);
  }

  await persistWorkspaceDiff({
    baseline: workspaceDiffBaseline,
    provider: job.provider,
    runId: job.runId,
    thread: job.thread
  });

  const result = await appendAssistantMessage({
    ownerUserId: job.user.id,
    threadId: job.thread.id,
    runId: job.runId,
    content: attempt.assistantContent || attempt.failure || 'Claude completed without returning assistant text.'
  });
  await attempt.toolInvocations.persist({
    threadId: job.thread.id,
    runId: job.runId,
    messageId: result.message.id
  });
  if (attempt.failure) {
    await failCloudAgentRun(job.runId, attempt.failure);
  } else {
    await completeCloudAgentRun(job.runId);
  }
  closeCloudRunEventStream(job.runId);

  return {
    ...result,
    failed: Boolean(attempt.failure),
    error: attempt.failure
  };
}

function resolveProviderSessionRecoveryStrategy(thread: CloudThread): 'archive_and_restart' | 'compact' | 'replay_transcript' {
  const metadata = thread.providerSessionMetadata;
  if (!isRecord(metadata) || (metadata.lifecycleAction !== 'replay' && metadata.lifecycleAction !== 'compact')) {
    return 'archive_and_restart';
  }

  const transcriptReplay = metadata.transcriptReplay;
  if (!isRecord(transcriptReplay)) {
    return 'archive_and_restart';
  }

  const plan = transcriptReplay.plan;
  if (!isRecord(plan) || plan.available !== true) {
    return 'archive_and_restart';
  }

  return metadata.lifecycleAction === 'compact' ? 'compact' : 'replay_transcript';
}

async function loadCloudAgentRunJob(runId: string): Promise<LoadedCloudAgentRunJob> {
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

class CloudAgentRunCancelledError extends Error {
  constructor(readonly runId: string) {
    super(`Run cancelled: ${runId}`);
    this.name = 'CloudAgentRunCancelledError';
  }
}

function isCloudAgentRunCancelledError(error: unknown): error is CloudAgentRunCancelledError {
  return error instanceof CloudAgentRunCancelledError;
}

function shouldRetryWithoutProviderSession(error: string): boolean {
  const normalized = error.toLowerCase();
  return (
    normalized.includes('resume') ||
    (normalized.includes('session') &&
      (normalized.includes('not found') ||
        normalized.includes('invalid') ||
        normalized.includes('expired') ||
        normalized.includes('does not exist')))
  );
}

function readPayloadString(payload: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = payload?.[key];
  return typeof value === 'string' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function shouldRetryWorkerRun(job: LoadedCloudAgentRunJob, options: CloudAgentRunExecutionOptions): boolean {
  const workerId = options.workerId?.trim();
  if (!workerId) {
    return false;
  }

  return job.attemptCount < maxAttempts(options);
}

function retryDelayMs(job: LoadedCloudAgentRunJob, options: CloudAgentRunExecutionOptions): number {
  const baseMs = options.retryBaseMs && options.retryBaseMs > 0 ? options.retryBaseMs : 5_000;
  const exponent = Math.max(0, job.attemptCount - 1);
  return Math.min(baseMs * 2 ** exponent, 60_000);
}

function maxAttempts(options: CloudAgentRunExecutionOptions): number {
  return options.maxAttempts && options.maxAttempts > 0 ? options.maxAttempts : 3;
}

function startClaimRenewal(runId: string, options: CloudAgentRunExecutionOptions): (() => void) | null {
  const workerId = options.workerId?.trim();
  if (!workerId) {
    return null;
  }

  const leaseMs = options.leaseMs && options.leaseMs > 0 ? options.leaseMs : 5 * 60 * 1000;
  const intervalMs = Math.max(1000, Math.floor(leaseMs / 2));
  const interval = setInterval(() => {
    void extendCloudAgentRunClaim({ runId, workerId, leaseMs }).catch((error) => {
      console.error(`Failed to renew cloud agent run claim for ${runId}:`, error);
    });
  }, intervalMs);
  return () => clearInterval(interval);
}
