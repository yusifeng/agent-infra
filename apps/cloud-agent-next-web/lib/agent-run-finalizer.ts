import type { LoadedCloudAgentRunJob } from './agent-run-loader';
import type { CloudAgentRunAttemptResult } from './agent-run-attempt';
import { completeCloudAgentRun, failCloudAgentRun } from './run-store';
import type { CloudMessage, CloudThread } from './thread-store';
import { appendAssistantMessage } from './thread-store';
import { persistWorkspaceDiff, type WorkspaceDiffBaseline } from './workspace-diff-recorder';

export interface FinalizedCloudAgentRunResult {
  error: string | null;
  failed: boolean;
  message: CloudMessage;
  messages: CloudMessage[];
  thread: CloudThread;
}

export async function finalizeCloudAgentRun(input: {
  attempt: CloudAgentRunAttemptResult;
  job: LoadedCloudAgentRunJob;
  workspaceDiffBaseline: WorkspaceDiffBaseline | null;
}): Promise<FinalizedCloudAgentRunResult> {
  await persistWorkspaceDiff({
    baseline: input.workspaceDiffBaseline,
    provider: input.job.provider,
    runId: input.job.runId,
    thread: input.job.thread
  });

  const result = await appendAssistantMessage({
    ownerUserId: input.job.user.id,
    threadId: input.job.thread.id,
    runId: input.job.runId,
    content: input.attempt.assistantContent || input.attempt.failure || 'Claude completed without returning assistant text.'
  });
  await input.attempt.toolInvocations.persist({
    threadId: input.job.thread.id,
    runId: input.job.runId,
    messageId: result.message.id
  });
  if (input.attempt.failure) {
    await failCloudAgentRun(input.job.runId, input.attempt.failure);
  } else {
    await completeCloudAgentRun(input.job.runId);
  }

  return {
    ...result,
    failed: Boolean(input.attempt.failure),
    error: input.attempt.failure
  };
}
