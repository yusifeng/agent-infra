import { AgentInfraAppError } from '@agent-infra/app';

export class InvalidRouteCursorError extends Error {}

export function getRouteErrorStatus(error: unknown) {
  if (error instanceof AgentInfraAppError) {
    return error.statusCode;
  }

  if (error instanceof InvalidRouteCursorError) {
    return 400;
  }

  return 500;
}

export function getRouteErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
