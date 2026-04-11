import { AgentInfraAppError } from '@agent-infra/app';

export function getRouteErrorStatus(error: unknown) {
  if (error instanceof AgentInfraAppError) {
    return error.statusCode;
  }

  return 500;
}

export function getRouteErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
