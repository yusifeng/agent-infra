import type { RunDto } from '@agent-infra/contracts';

import type { LiveAssistantDraft } from '@/features/durable-chat/types/live-assistant-draft';
import type { ChatPhase } from '@/features/durable-chat/types/runtime';

export type ActiveRunAttachDecision =
  | { type: 'abort' }
  | { type: 'sync'; threadId: string; abortRunIds: string[]; attachRunIds: string[] }
  | { type: 'idle' };

export function resolveActiveRunAttachDecision(input: {
  activeThreadId: string | null;
  activeResponseRun?: RunDto | null;
  activeResponseRuns?: RunDto[];
  attachedRunIds: string[];
  sendInFlight: boolean;
}): ActiveRunAttachDecision {
  const activeRuns = (input.activeResponseRuns ?? (input.activeResponseRun ? [input.activeResponseRun] : []))
    .filter((run) => run.status === 'queued' || run.status === 'running');

  if (input.activeThreadId && activeRuns.some((run) => run.threadId !== input.activeThreadId)) {
    return { type: 'abort' };
  }

  if (!input.activeThreadId || activeRuns.length === 0) {
    return { type: 'abort' };
  }

  const activeRunIds = new Set(activeRuns.map((run) => run.id));
  const attachedRunIds = new Set(input.attachedRunIds);
  const abortRunIds = input.attachedRunIds.filter((runId) => !activeRunIds.has(runId));
  const attachRunIds = input.sendInFlight
    ? []
    : activeRuns.map((run) => run.id).filter((runId) => !attachedRunIds.has(runId));

  if (abortRunIds.length === 0 && attachRunIds.length === 0) {
    return { type: 'idle' };
  }

  return {
    type: 'sync',
    threadId: input.activeThreadId,
    abortRunIds,
    attachRunIds
  };
}

export type ThreadRouteDecision =
  | { type: 'initialize' }
  | { type: 'activate-thread'; threadId: string }
  | { type: 'reset-to-new' }
  | { type: 'idle' };

export function resolveThreadRouteDecision(input: {
  activeThreadId: string | null;
  chatPhase: ChatPhase;
  initialThreadId: string | null;
  liveAssistantDraft: LiveAssistantDraft | null;
  loadingThreadId: string | null;
  optimisticUserMessage: unknown | null;
  runtimeBootstrapped: boolean;
}): ThreadRouteDecision {
  if (!input.runtimeBootstrapped) {
    return { type: 'initialize' };
  }

  if (
    input.initialThreadId &&
    input.activeThreadId === input.initialThreadId &&
    (
      input.loadingThreadId === input.initialThreadId ||
      input.chatPhase !== 'idle' ||
      input.optimisticUserMessage !== null ||
      input.liveAssistantDraft !== null
    )
  ) {
    return { type: 'idle' };
  }

  if (input.initialThreadId) {
    return {
      type: 'activate-thread',
      threadId: input.initialThreadId
    };
  }

  return { type: 'reset-to-new' };
}

export type InspectorLoadDecision =
  | { type: 'load'; threadId: string }
  | { type: 'reset' }
  | { type: 'idle' };

export function resolveInspectorLoadDecision(input: {
  activeThreadId: string | null;
  loadingMessages: boolean;
  logOpen: boolean;
}): InspectorLoadDecision {
  if (!input.logOpen) {
    return { type: 'reset' };
  }

  if (!input.activeThreadId || input.loadingMessages) {
    return { type: 'idle' };
  }

  return {
    type: 'load',
    threadId: input.activeThreadId
  };
}
