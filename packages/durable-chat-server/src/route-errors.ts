import { AgentInfraAppError } from '@agent-infra/app';

export class InvalidRouteCursorError extends Error {}

export class InvalidRouteBodyError extends Error {}

function readStatusCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('statusCode' in error)) {
    return null;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === 'number' && Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599
    ? statusCode
    : null;
}

export function getRouteErrorStatus(error: unknown) {
  if (error instanceof AgentInfraAppError) {
    return error.statusCode;
  }

  const statusCode = readStatusCode(error);
  if (statusCode !== null) {
    return statusCode;
  }

  if (error instanceof InvalidRouteCursorError || error instanceof InvalidRouteBodyError) {
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
