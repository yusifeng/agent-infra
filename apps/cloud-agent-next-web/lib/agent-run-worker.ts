import { finalizeCloudAgentRun } from './agent-run-finalizer';
import { runCloudAgentAttempt } from './agent-run-attempt';
import { CloudAgentRunCancelledError } from './agent-run-errors';
import { handleCloudAgentRunExecutionError, handleCloudAgentRunStartError } from './agent-run-failure-handling';
import { loadCloudAgentRunJob, type LoadedCloudAgentRunJob } from './agent-run-loader';
import { startClaimRenewal, type CloudAgentRunLeaseOptions } from './agent-run-retry';
import { resolveProviderSessionRecoveryStrategy } from './provider-session-recovery';
import { closeCloudRunEventStream } from './run-event-hub';
import { isCloudAgentRunCancelled, startCloudAgentRun } from './run-store';
import { recordCloudAgentRuntimeEvent } from './runtime-event-recorder';
import type { CloudMessage, CloudThread } from './thread-store';
import { archiveThreadProviderSession } from './thread-store';
import { captureWorkspaceDiffBaseline } from './workspace-diff-recorder';

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
  leaseMs?: CloudAgentRunLeaseOptions['leaseMs'];
  maxAttempts?: CloudAgentRunLeaseOptions['maxAttempts'];
  retryBaseMs?: CloudAgentRunLeaseOptions['retryBaseMs'];
  workerId?: CloudAgentRunLeaseOptions['workerId'];
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
    return await handleCloudAgentRunStartError({ error, runId: job.runId });
  }

  try {
    return await executeLoadedCloudAgentRun(loadedJob);
  } catch (error) {
    return await handleCloudAgentRunExecutionError({ error, job, loadedJob, options });
  } finally {
    stopLeaseRenewal?.();
  }
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

  const result = await finalizeCloudAgentRun({
    attempt,
    job,
    workspaceDiffBaseline
  });
  closeCloudRunEventStream(job.runId);

  return result;
}
