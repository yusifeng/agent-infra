import type {
  CloudRunEventPayloadV1,
  ProviderSessionBinding,
  Run,
  RunEvent
} from '@agent-infra/core';
import type {
  CloudRunEventDto,
  ProviderSessionBindingDto,
  ProviderSessionRecoveryReportDto,
  ProviderSessionRecommendedActionDto,
  ProviderSessionSnapshotDto,
  ProviderTranscriptReplayPlanDto,
  ProviderTranscriptSummaryDto,
  RunDto
} from '@agent-infra/contracts';

import type { AgentProviderId } from './provider-config';
import { getCloudAgentRepositories } from './db';
import { PROVIDER_RECOVERY_MANIFESTS } from './provider-session-manifest';
import {
  buildProviderTranscriptReplayPlan,
  summarizeProviderTranscript,
  type ProviderTranscriptReplayPlan,
  type ProviderTranscriptSummary
} from './provider-transcript-replay';
import { appendCloudRunEvent } from './run-store';

const CLOUD_AGENT_APP_ID = 'cloud-agent-next-web';

export type ProviderSessionLifecycleAction = 'archive' | 'compact' | 'fork' | 'replay';

export interface ProviderSessionSnapshot {
  binding: ProviderSessionBinding;
  replayPlan: ProviderTranscriptReplayPlan;
  transcriptSummary: ProviderTranscriptSummary;
}

export async function listThreadProviderSessionsForOwner(input: {
  ownerUserId: string;
  threadId: string;
}): Promise<ProviderSessionSnapshot[] | null> {
  const repositories = await getCloudAgentRepositories();
  const thread = await repositories.threadRepo.findById(input.threadId);
  if (!thread || thread.appId !== CLOUD_AGENT_APP_ID || thread.userId !== input.ownerUserId || thread.status !== 'active') {
    return null;
  }

  const bindings = await repositories.providerSessionBindingRepo.listByThread(thread.id);
  return Promise.all(
    bindings.map(async (binding) => {
      const transcript = await repositories.providerTranscriptRepo.listByProviderSession({
        provider: binding.provider,
        providerProjectKey: binding.providerProjectKey,
        providerSessionId: binding.providerSessionId
      });
      return {
        binding,
        replayPlan: buildProviderTranscriptReplayPlan(transcript),
        transcriptSummary: summarizeProviderTranscript(transcript)
      };
    })
  );
}

export async function transitionActiveProviderSessionForOwner(input: {
  action: ProviderSessionLifecycleAction;
  actorId: string;
  ownerUserId: string;
  provider: AgentProviderId;
  reason?: string | null;
  threadId: string;
}): Promise<ProviderSessionSnapshot | null> {
  const repositories = await getCloudAgentRepositories();
  const thread = await repositories.threadRepo.findById(input.threadId);
  if (!thread || thread.appId !== CLOUD_AGENT_APP_ID || thread.userId !== input.ownerUserId || thread.status !== 'active') {
    return null;
  }

  const binding = await repositories.providerSessionBindingRepo.findActiveByThread({
    provider: input.provider,
    threadId: thread.id
  });
  if (!binding) {
    return null;
  }

  const transcript = await repositories.providerTranscriptRepo.listByProviderSession({
    provider: binding.provider,
    providerProjectKey: binding.providerProjectKey,
    providerSessionId: binding.providerSessionId
  });
  const transcriptSummary = summarizeProviderTranscript(transcript);
  const replayPlan = buildProviderTranscriptReplayPlan(transcript);
  const now = new Date();
  const shouldKeepActive = input.action === 'replay' || input.action === 'compact';
  const status = input.action === 'fork' ? 'forked' : 'archived';
  const metadata = {
    ...(binding.metadata ?? {}),
    lifecycleAction: input.action,
    lifecycleActorId: input.actorId,
    lifecycleAt: now.toISOString(),
    lifecycleReason: input.reason ?? null,
    transcriptReplay: {
      plan: replayPlan,
      summary: transcriptSummary
    }
  };
  const updated =
    shouldKeepActive
      ? await repositories.providerSessionBindingRepo.upsertActive({
          workspaceId: binding.workspaceId,
          threadId: binding.threadId,
          runId: binding.runId,
          provider: binding.provider,
          providerSessionId: binding.providerSessionId,
          providerProjectKey: binding.providerProjectKey,
          metadata
        })
      : await repositories.providerSessionBindingRepo.updateStatus(binding.id, status, {
          archivedAt: now,
          metadata
        });
  await appendProviderSessionLifecycleEvent({
    action: input.action,
    actorId: input.actorId,
    binding: updated,
    reason: input.reason ?? null,
    replayPlan,
    transcriptSummary
  });

  return {
    binding: updated,
    replayPlan,
    transcriptSummary
  };
}

export async function getProviderSessionRecoveryReportForOwner(input: {
  ownerUserId: string;
  threadId: string;
}): Promise<ProviderSessionRecoveryReportDto | null> {
  const repositories = await getCloudAgentRepositories();
  const thread = await repositories.threadRepo.findById(input.threadId);
  if (!thread || thread.appId !== CLOUD_AGENT_APP_ID || thread.userId !== input.ownerUserId || thread.status !== 'active') {
    return null;
  }

  const [sessions, runs] = await Promise.all([
    listThreadProviderSessionsForOwner(input),
    repositories.runRepo.listByThread(thread.id, { limit: 50 })
  ]);
  if (!sessions) {
    return null;
  }

  const recoveryEventsNested = await Promise.all(
    runs.map(async (run) => (await repositories.runEventRepo.listByRun(run.id)).filter(isProviderSessionEvent))
  );
  const providerSessionEvents = recoveryEventsNested.flat().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const lifecycleEvents = providerSessionEvents.filter(isProviderSessionLifecycleEvent);
  const recoveryEvents = providerSessionEvents.filter(isProviderSessionRecoveryEvent);
  const sourceRunIds = new Set(providerSessionEvents.map((event) => event.runId));
  const strategyCounts: Record<string, number> = {};
  for (const event of recoveryEvents) {
    const strategy = readRecoveryStrategy(event.payload);
    if (strategy) {
      strategyCounts[strategy] = (strategyCounts[strategy] ?? 0) + 1;
    }
  }

  return {
    schemaVersion: 1,
    threadId: thread.id,
    providerManifests: PROVIDER_RECOVERY_MANIFESTS,
    sessions: sessions.map(toProviderSessionSnapshotDto),
    lifecycleEvents: lifecycleEvents.map(toCloudRunEventDto),
    recoveryEvents: recoveryEvents.map(toCloudRunEventDto),
    sourceRuns: runs.filter((run) => sourceRunIds.has(run.id)).map(toRunDto),
    strategyCounts
  };
}

async function appendProviderSessionLifecycleEvent(input: {
  action: ProviderSessionLifecycleAction;
  actorId: string;
  binding: ProviderSessionBinding;
  reason: string | null;
  replayPlan: ProviderTranscriptReplayPlan;
  transcriptSummary: ProviderTranscriptSummary;
}): Promise<void> {
  const runId = input.binding.runId ?? (await findLatestRunId(input.binding.threadId));
  if (!runId) {
    return;
  }

  await appendCloudRunEvent({
    threadId: input.binding.threadId,
    runId,
    type: 'provider_session_lifecycle',
    payload: {
      schemaVersion: 1,
      type: 'provider_session_lifecycle',
      workspaceId: input.binding.workspaceId,
      threadId: input.binding.threadId,
      runId,
      provider: input.binding.provider,
      providerSessionId: input.binding.providerSessionId,
      providerProjectKey: input.binding.providerProjectKey ?? null,
      action: input.action,
      bindingStatus: input.binding.status,
      reason: input.reason,
      actorId: input.actorId,
      replayAvailable: input.replayPlan.available,
      transcriptEntryCount: input.transcriptSummary.entryCount
    }
  });
}

async function findLatestRunId(threadId: string): Promise<string | null> {
  const repositories = await getCloudAgentRepositories();
  return (await repositories.runRepo.listByThread(threadId, { limit: 1 }))[0]?.id ?? null;
}

function toProviderSessionSnapshotDto(snapshot: ProviderSessionSnapshot): ProviderSessionSnapshotDto {
  return {
    binding: toProviderSessionBindingDto(snapshot.binding),
    replayPlan: snapshot.replayPlan satisfies ProviderTranscriptReplayPlanDto,
    recommendedActions: buildRecommendedActions(snapshot),
    transcriptSummary: snapshot.transcriptSummary satisfies ProviderTranscriptSummaryDto
  };
}

function buildRecommendedActions(snapshot: ProviderSessionSnapshot): ProviderSessionRecommendedActionDto[] {
  const manifest = PROVIDER_RECOVERY_MANIFESTS.find((entry) => entry.provider === snapshot.binding.provider);
  const strategy = (action: ProviderSessionRecommendedActionDto['action']) =>
    manifest?.strategies.find((candidate) => candidate.action === action);
  const actions: ProviderSessionRecommendedActionDto[] = [];

  if (snapshot.binding.status === 'active') {
    actions.push({
      action: 'resume',
      reason: 'Active provider session binding is available.',
      status: strategy('resume')?.status ?? 'planned'
    });
    if (snapshot.replayPlan.available) {
      actions.push({
        action: 'replay_transcript',
        reason: 'Provider transcript entries are available as a durable replay source if resume fails.',
        status: strategy('replay_transcript')?.status ?? 'planned'
      });
      actions.push({
        action: 'compact',
        reason: 'Provider transcript entries can be compacted into provider-neutral continuity metadata.',
        status: strategy('compact')?.status ?? 'planned'
      });
    }
    actions.push({
      action: 'archive_and_restart',
      reason: 'Fallback can archive this binding and restart from product messages/workspace state.',
      status: strategy('archive_and_restart')?.status ?? 'planned'
    });
    return actions;
  }

  if (snapshot.binding.status === 'forked') {
    actions.push({
      action: 'fork',
      reason: 'Binding is already marked forked; follow-up execution still needs provider-specific fork support.',
      status: strategy('fork')?.status ?? 'manual'
    });
  }

  if (snapshot.binding.status === 'archived') {
    actions.push({
      action: 'archive_and_restart',
      reason: 'Binding is archived; future runs should restart without this provider session.',
      status: strategy('archive_and_restart')?.status ?? 'planned'
    });
  }

  if (snapshot.replayPlan.available) {
    actions.push({
      action: 'replay_transcript',
      reason: 'Archived/forked binding still has transcript entries that can guide a provider-specific replay implementation.',
      status: strategy('replay_transcript')?.status ?? 'planned'
    });
  }

  return actions;
}

function toProviderSessionBindingDto(binding: ProviderSessionBinding): ProviderSessionBindingDto {
  return {
    id: binding.id,
    workspaceId: binding.workspaceId,
    threadId: binding.threadId,
    runId: binding.runId,
    provider: binding.provider,
    providerSessionId: binding.providerSessionId,
    providerProjectKey: binding.providerProjectKey,
    status: binding.status,
    metadata: binding.metadata,
    createdAt: binding.createdAt.toISOString(),
    updatedAt: binding.updatedAt.toISOString(),
    archivedAt: toIsoDate(binding.archivedAt)
  };
}

function toCloudRunEventDto(event: RunEvent): CloudRunEventDto {
  return {
    id: event.id,
    threadId: event.threadId,
    runId: event.runId,
    seq: event.seq,
    type: event.type as CloudRunEventPayloadV1['type'],
    payload: event.payload as unknown as CloudRunEventPayloadV1,
    createdAt: event.createdAt.toISOString()
  };
}

function toRunDto(run: Run): RunDto {
  return {
    id: run.id,
    threadId: run.threadId,
    triggerMessageId: run.triggerMessageId,
    provider: run.provider,
    model: run.model,
    status: run.status,
    usage: run.usage,
    error: run.error,
    startedAt: toIsoDate(run.startedAt),
    finishedAt: toIsoDate(run.finishedAt),
    createdAt: run.createdAt.toISOString()
  };
}

function isProviderSessionEvent(event: RunEvent): boolean {
  return event.type === 'provider_session_lifecycle' || event.type === 'provider_session_recovery';
}

function isProviderSessionLifecycleEvent(event: RunEvent): boolean {
  return event.type === 'provider_session_lifecycle';
}

function isProviderSessionRecoveryEvent(event: RunEvent): boolean {
  return event.type === 'provider_session_recovery';
}

function readRecoveryStrategy(payload: Record<string, unknown> | null): string | null {
  return payload && typeof payload.strategy === 'string' ? payload.strategy : null;
}

function toIsoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}
