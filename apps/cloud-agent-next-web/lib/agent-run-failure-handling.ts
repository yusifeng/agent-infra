import { CloudAgentRunCancelledError, isCloudAgentRunCancelledError } from './agent-run-errors';
import type { LoadedCloudAgentRunJob } from './agent-run-loader';
import type { CloudAgentRunLeaseOptions } from './agent-run-retry';
import { retryDelayMs, shouldRetryWorkerRun } from './agent-run-retry';
import { closeCloudRunEventStream } from './run-event-hub';
import { failCloudAgentRun, scheduleCloudAgentRunRetry } from './run-store';

export async function handleCloudAgentRunStartError(input: {
  error: unknown;
  runId: string;
}): Promise<never> {
  if (isCloudAgentRunCancelledError(input.error)) {
    closeCloudRunEventStream(input.runId);
    throw input.error;
  }

  const message = errorMessage(input.error);
  await failCloudAgentRun(input.runId, message).catch(() => undefined);
  closeCloudRunEventStream(input.runId);
  throw input.error;
}

export async function handleCloudAgentRunExecutionError(input: {
  error: unknown;
  job: { runId: string };
  loadedJob: LoadedCloudAgentRunJob;
  options: CloudAgentRunLeaseOptions;
}): Promise<never> {
  if (isCloudAgentRunCancelledError(input.error)) {
    closeCloudRunEventStream(input.job.runId);
    throw input.error;
  }

  const message = errorMessage(input.error);
  if (shouldRetryWorkerRun(input.loadedJob, input.options)) {
    await scheduleCloudAgentRunRetry({
      runId: input.job.runId,
      error: message,
      nextAttemptAt: new Date(Date.now() + retryDelayMs(input.loadedJob, input.options))
    });
    throw input.error;
  }

  await failCloudAgentRun(input.job.runId, message).catch(() => undefined);
  closeCloudRunEventStream(input.job.runId);
  throw input.error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
