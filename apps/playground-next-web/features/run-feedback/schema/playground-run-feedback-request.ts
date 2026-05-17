import type { RunFeedbackValue } from '@agent-infra/core';
import { InvalidRouteBodyError } from '@agent-infra/durable-chat-server';

import {
  InvalidPlaygroundRunFeedbackDetailsError,
  normalizePlaygroundRunFeedbackDetails,
  type PlaygroundRunFeedbackDetails
} from '../types/playground-run-feedback-details';

export type PlaygroundSetRunFeedbackRequest = {
  value: RunFeedbackValue;
  details?: PlaygroundRunFeedbackDetails;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parsePlaygroundSetRunFeedbackRequest(body: unknown): PlaygroundSetRunFeedbackRequest {
  if (!isRecord(body)) {
    throw new InvalidRouteBodyError('invalid run feedback request');
  }

  if (body.value !== 'thumbs_up' && body.value !== 'thumbs_down') {
    throw new InvalidRouteBodyError('invalid run feedback value');
  }

  if (body.value === 'thumbs_up') {
    if (Object.prototype.hasOwnProperty.call(body, 'details')) {
      throw new InvalidRouteBodyError('details are only allowed for thumbs_down feedback');
    }

    return {
      value: body.value
    };
  }

  try {
    return {
      value: body.value,
      details: normalizePlaygroundRunFeedbackDetails(body.details)
    };
  } catch (error) {
    if (error instanceof InvalidPlaygroundRunFeedbackDetailsError) {
      throw new InvalidRouteBodyError(error.message);
    }

    throw error;
  }
}
