import { extendCloudAgentRunClaim } from './run-store';

export interface CloudAgentRunLeaseOptions {
  leaseMs?: number;
  maxAttempts?: number;
  retryBaseMs?: number;
  workerId?: string | null;
}

export interface WorkerRetryJob {
  attemptCount: number;
}

export function shouldRetryWorkerRun(job: WorkerRetryJob, options: CloudAgentRunLeaseOptions): boolean {
  const workerId = options.workerId?.trim();
  if (!workerId) {
    return false;
  }

  return job.attemptCount < maxAttempts(options);
}

export function retryDelayMs(job: WorkerRetryJob, options: CloudAgentRunLeaseOptions): number {
  const baseMs = options.retryBaseMs && options.retryBaseMs > 0 ? options.retryBaseMs : 5_000;
  const exponent = Math.max(0, job.attemptCount - 1);
  return Math.min(baseMs * 2 ** exponent, 60_000);
}

export function startClaimRenewal(runId: string, options: CloudAgentRunLeaseOptions): (() => void) | null {
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

function maxAttempts(options: CloudAgentRunLeaseOptions): number {
  return options.maxAttempts && options.maxAttempts > 0 ? options.maxAttempts : 3;
}
