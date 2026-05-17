import type { DatasetExampleMetadataSnapshotV1 } from '@agent-infra/app';
import type { RunFeedback } from '@agent-infra/core';
import { toRunFeedbackDto } from '@agent-infra/durable-chat-server';

import { PlaygroundRunFeedbackDetailsRepo } from '@/features/run-feedback/repo/playground-run-feedback-details-repo';
import type { PlaygroundRunFeedbackDetails } from '@/features/run-feedback/types/playground-run-feedback-details';
import type { PlaygroundAppServices } from '@/lib/playground-base-services';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function buildPlaygroundDatasetCaptureMetadata(input: {
  callerMetadata?: Record<string, unknown> | null;
  sharedRunFeedback?: RunFeedback | null;
  runFeedbackDetails?: PlaygroundRunFeedbackDetails | null;
}): Record<string, unknown> | undefined {
  const metadata = { ...(input.callerMetadata ?? {}) };
  const callerFeedback = asRecord(metadata.feedback);
  const callerHost = asRecord(metadata.host);
  const callerPlayground = asRecord(callerHost.playground);

  if (input.sharedRunFeedback) {
    metadata.feedback = {
      ...callerFeedback,
      sharedRunFeedback: toRunFeedbackDto(input.sharedRunFeedback)
    };
  }

  if (input.runFeedbackDetails) {
    metadata.host = {
      ...callerHost,
      playground: {
        ...callerPlayground,
        runFeedbackDetails: input.runFeedbackDetails
      }
    };
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

export async function loadPlaygroundDatasetCaptureMetadata(
  services: PlaygroundAppServices,
  sourceRunId: string,
  actorId: string,
  callerMetadata?: Record<string, unknown> | null
): Promise<(Partial<DatasetExampleMetadataSnapshotV1> & Record<string, unknown>) | undefined> {
  const [feedbackRows, detailsRow] = await Promise.all([
    services.repos.runFeedbackRepo.listByRunIds([sourceRunId], actorId),
    new PlaygroundRunFeedbackDetailsRepo(services.dbConfig).findByRunAndActor(sourceRunId, actorId)
  ]);

  return buildPlaygroundDatasetCaptureMetadata({
    callerMetadata,
    sharedRunFeedback: feedbackRows[0] ?? null,
    runFeedbackDetails: detailsRow?.details ?? null
  }) as (Partial<DatasetExampleMetadataSnapshotV1> & Record<string, unknown>) | undefined;
}
