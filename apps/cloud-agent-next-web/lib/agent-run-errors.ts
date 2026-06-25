export class CloudAgentRunCancelledError extends Error {
  constructor(readonly runId: string) {
    super(`Run cancelled: ${runId}`);
    this.name = 'CloudAgentRunCancelledError';
  }
}

export function isCloudAgentRunCancelledError(error: unknown): error is CloudAgentRunCancelledError {
  return error instanceof CloudAgentRunCancelledError;
}
