import { streamCloudAgentTurn } from './agent-runtime';
import { CloudAgentRunCancelledError, isCloudAgentRunCancelledError } from './agent-run-errors';
import type { LoadedCloudAgentRunJob } from './agent-run-loader';
import { isCloudAgentRunCancelled } from './run-store';
import { recordCloudAgentRuntimeEvent } from './runtime-event-recorder';
import type { CloudThread } from './thread-store';
import { createToolInvocationAccumulator } from './tool-invocation-recorder';

export interface CloudAgentRunAttemptOptions {
  allowResumeFallback: boolean;
}

export interface CloudAgentRunAttemptResult {
  assistantContent: string;
  failure: string | null;
  resumeFallbackReason: string | null;
  toolInvocations: ReturnType<typeof createToolInvocationAccumulator>;
}

export async function runCloudAgentAttempt(
  job: LoadedCloudAgentRunJob,
  thread: CloudThread,
  options: CloudAgentRunAttemptOptions
): Promise<CloudAgentRunAttemptResult> {
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

function shouldRetryWithoutProviderSession(error: string): boolean {
  const normalized = error.toLowerCase();
  return (
    normalized.includes('resume') ||
    (normalized.includes('no conversation found') && normalized.includes('session id')) ||
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
