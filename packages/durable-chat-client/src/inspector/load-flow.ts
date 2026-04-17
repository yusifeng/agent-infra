import type { MessageDto, RunDto, RunTimelineResponseDto } from '@agent-infra/contracts';

import { fetchRunTimelineResponse, fetchThreadRunsResponse } from '../repo/chat-api.js';
import { chooseInitialRunId, compareRunsByCreatedAt, includeSelectedRun, RECENT_RUNS_LIMIT } from '../service/chat-runtime.js';

type Updater<T> = T | ((current: T) => T);
type Setter<T> = (next: Updater<T>) => void;
type RefLike<T> = { current: T };

type ResetLogInspectorStateArgs = {
  options?: { clearSelectedRun?: boolean };
  refs: {
    logInspectorAbortControllerRef: RefLike<AbortController | null>;
    logInspectorRequestIdRef: RefLike<number>;
    timelineAbortControllerRef: RefLike<AbortController | null>;
    timelineRequestIdRef: RefLike<number>;
  };
  actions: {
    setRecentRuns: Setter<RunDto[]>;
    setRecentRunsError: Setter<string | null>;
    setRecentRunsLoading: Setter<boolean>;
    setSelectedRunId: Setter<string | null>;
    setTimeline: Setter<RunTimelineResponseDto | null>;
    setTimelineError: Setter<string | null>;
    setTimelineLoading: Setter<boolean>;
  };
};

type LoadRunTimelineArgs = {
  runId: string | null;
  options?: { preserveExisting?: boolean };
  refs: {
    selectedRunIdRef: RefLike<string | null>;
    timelineAbortControllerRef: RefLike<AbortController | null>;
    timelineRequestIdRef: RefLike<number>;
  };
  actions: {
    setSelectedRunId: Setter<string | null>;
    setTimeline: Setter<RunTimelineResponseDto | null>;
    setTimelineError: Setter<string | null>;
    setTimelineLoading: Setter<boolean>;
  };
};

type LoadLogInspectorFlowArgs = {
  threadId: string;
  messagesSnapshot: MessageDto[];
  options?: { preferredRunId?: string | null; preserveExistingTimeline?: boolean };
  refs: {
    activeThreadIdRef: RefLike<string | null>;
    logInspectorAbortControllerRef: RefLike<AbortController | null>;
    logInspectorRequestIdRef: RefLike<number>;
  };
  actions: {
    setRecentRuns: Setter<RunDto[]>;
    setRecentRunsError: Setter<string | null>;
    setRecentRunsLoading: Setter<boolean>;
    setSelectedRunId: Setter<string | null>;
    setTimeline: Setter<RunTimelineResponseDto | null>;
    setTimelineError: Setter<string | null>;
    setTimelineLoading: Setter<boolean>;
  };
  operations: {
    loadRunTimeline: (runId: string | null, options?: { preserveExisting?: boolean }) => Promise<void>;
  };
};

async function hydrateRecentRuns(threadId: string, signal: AbortSignal) {
  const result = await fetchThreadRunsResponse(threadId, RECENT_RUNS_LIMIT, signal);
  if (!result.ok) {
    throw new Error(result.error ?? `Failed to load thread runs (${result.status})`);
  }

  return result.data.runs.slice().sort(compareRunsByCreatedAt);
}

async function tryResolvePreferredRun(threadId: string, runId: string, signal: AbortSignal) {
  try {
    const result = await fetchRunTimelineResponse(runId, signal);
    if (!result.ok || !result.data.run || result.data.run.threadId !== threadId) {
      return null;
    }

    return result.data.run;
  } catch {
    return null;
  }
}

async function resolveSelectedRun(
  threadId: string,
  preferredRunId: string | null | undefined,
  messages: MessageDto[],
  runs: RunDto[],
  signal: AbortSignal
) {
  let nextRuns = runs;
  let preferredResolvedRun: RunDto | null = null;

  if (preferredRunId && !nextRuns.some((run) => run.id === preferredRunId)) {
    preferredResolvedRun = await tryResolvePreferredRun(threadId, preferredRunId, signal);
    nextRuns = includeSelectedRun(nextRuns, preferredResolvedRun);
  }

  return {
    nextRuns,
    nextSelectedRunId: chooseInitialRunId(messages, nextRuns, preferredResolvedRun?.id ?? preferredRunId ?? null)
  };
}

export function runResetLogInspectorState({ options, refs, actions }: ResetLogInspectorStateArgs) {
  refs.logInspectorRequestIdRef.current += 1;
  refs.logInspectorAbortControllerRef.current?.abort();
  refs.timelineRequestIdRef.current += 1;
  refs.timelineAbortControllerRef.current?.abort();
  actions.setRecentRuns([]);
  if (options?.clearSelectedRun !== false) {
    actions.setSelectedRunId(null);
  }
  actions.setTimeline(null);
  actions.setTimelineError(null);
  actions.setTimelineLoading(false);
  actions.setRecentRunsLoading(false);
  actions.setRecentRunsError(null);
}

export async function runLoadRunTimeline({ runId, options, refs, actions }: LoadRunTimelineArgs) {
  refs.timelineRequestIdRef.current += 1;
  const requestId = refs.timelineRequestIdRef.current;
  refs.timelineAbortControllerRef.current?.abort();
  const previousSelectedRunId = refs.selectedRunIdRef.current;
  actions.setSelectedRunId(runId);

  if (!runId) {
    refs.selectedRunIdRef.current = runId;
    refs.timelineAbortControllerRef.current = null;
    actions.setTimeline(null);
    actions.setTimelineError(null);
    actions.setTimelineLoading(false);
    return;
  }

  const controller = new AbortController();
  refs.timelineAbortControllerRef.current = controller;
  if (!options?.preserveExisting || previousSelectedRunId !== runId) {
    actions.setTimeline(null);
  }
  refs.selectedRunIdRef.current = runId;
  actions.setTimelineLoading(true);
  actions.setTimelineError(null);

  try {
    const result = await fetchRunTimelineResponse(runId, controller.signal);
    if (!result.ok) {
      throw new Error(result.error ?? `Failed to load run timeline (${result.status})`);
    }

    if (requestId !== refs.timelineRequestIdRef.current) {
      return;
    }

    actions.setTimeline(result.data);
  } catch (loadError) {
    if (controller.signal.aborted || requestId !== refs.timelineRequestIdRef.current) {
      return;
    }

    actions.setTimeline(null);
    actions.setTimelineError(loadError instanceof Error ? loadError.message : 'Failed to load run timeline');
  } finally {
    if (requestId === refs.timelineRequestIdRef.current) {
      refs.timelineAbortControllerRef.current = null;
      actions.setTimelineLoading(false);
    }
  }
}

export async function runLoadLogInspectorFlow({
  threadId,
  messagesSnapshot,
  options,
  refs,
  actions,
  operations
}: LoadLogInspectorFlowArgs) {
  refs.logInspectorRequestIdRef.current += 1;
  const requestId = refs.logInspectorRequestIdRef.current;
  refs.logInspectorAbortControllerRef.current?.abort();
  const controller = new AbortController();
  refs.logInspectorAbortControllerRef.current = controller;
  actions.setRecentRunsLoading(true);
  actions.setRecentRunsError(null);

  try {
    const nextRuns = await hydrateRecentRuns(threadId, controller.signal);
    if (
      controller.signal.aborted ||
      requestId !== refs.logInspectorRequestIdRef.current ||
      refs.activeThreadIdRef.current !== threadId
    ) {
      return null;
    }

    const resolved = await resolveSelectedRun(threadId, options?.preferredRunId, messagesSnapshot, nextRuns, controller.signal);
    if (
      controller.signal.aborted ||
      requestId !== refs.logInspectorRequestIdRef.current ||
      refs.activeThreadIdRef.current !== threadId
    ) {
      return null;
    }

    actions.setRecentRuns(resolved.nextRuns);
    actions.setSelectedRunId(resolved.nextSelectedRunId);
    actions.setRecentRunsError(null);

    await operations.loadRunTimeline(resolved.nextSelectedRunId, {
      preserveExisting: options?.preserveExistingTimeline === true
    });
    return resolved.nextSelectedRunId;
  } catch (loadError) {
    if (
      controller.signal.aborted ||
      requestId !== refs.logInspectorRequestIdRef.current ||
      refs.activeThreadIdRef.current !== threadId
    ) {
      return null;
    }

    actions.setRecentRuns([]);
    actions.setRecentRunsError(loadError instanceof Error ? loadError.message : 'Failed to load thread runs');
    actions.setTimeline(null);
    actions.setTimelineError(null);
    actions.setTimelineLoading(false);
    return null;
  } finally {
    if (requestId === refs.logInspectorRequestIdRef.current) {
      refs.logInspectorAbortControllerRef.current = null;
      actions.setRecentRunsLoading(false);
    }
  }
}
