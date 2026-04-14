import type { RunStreamAssistantSnapshotDto } from '@agent-infra/contracts';

export type LiveAssistantDraft = {
  runId: string;
  messageId: string;
  partialText: string;
  partialReasoning: string | null;
  eventType: RunStreamAssistantSnapshotDto['eventType'];
};
