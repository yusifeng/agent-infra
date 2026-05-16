import type { MessageDto, RunDto, RunTimelineResponseDto } from '@agent-infra/contracts';

import {
  runLoadLogInspectorFlow,
  runLoadRunTimeline,
  runResetLogInspectorState
} from '@/features/durable-chat/runtime/load-log-inspector-flow';

type Updater<T> = T | ((current: T) => T);
type Setter<T> = (next: Updater<T>) => void;
type RefLike<T> = { current: T };

type InspectorActions = {
  setRecentRuns: Setter<RunDto[]>;
  setRecentRunsError: Setter<string | null>;
  setRecentRunsLoading: Setter<boolean>;
  setSelectedRunId: Setter<string | null>;
  setTimeline: Setter<RunTimelineResponseDto | null>;
  setTimelineError: Setter<string | null>;
  setTimelineLoading: Setter<boolean>;
};

type InspectorRefs = {
  activeThreadIdRef: RefLike<string | null>;
  logInspectorAbortControllerRef: RefLike<AbortController | null>;
  logInspectorRequestIdRef: RefLike<number>;
  selectedRunIdRef: RefLike<string | null>;
  timelineAbortControllerRef: RefLike<AbortController | null>;
  timelineRequestIdRef: RefLike<number>;
};

export function persistSelectedRunSelection(args: {
  activeThreadId: string | null;
  selectedRunId: string | null;
  refs: {
    logOpenRef: RefLike<boolean>;
    runSelectionPersistenceReadyRef: RefLike<boolean>;
  };
  operations: {
    persistSelectedRunId: (threadId: string | null, runId: string | null) => void;
  };
}) {
  if (!args.refs.runSelectionPersistenceReadyRef.current) {
    return false;
  }

  if (!args.refs.logOpenRef.current && args.selectedRunId === null) {
    return false;
  }

  args.operations.persistSelectedRunId(args.activeThreadId, args.selectedRunId);
  return true;
}

export function resetInspectorControllerState(args: {
  options?: { clearSelectedRun?: boolean };
  refs: Pick<
    InspectorRefs,
    | 'logInspectorAbortControllerRef'
    | 'logInspectorRequestIdRef'
    | 'timelineAbortControllerRef'
    | 'timelineRequestIdRef'
  >;
  actions: InspectorActions;
  operations?: {
    resetLogInspectorState?: typeof runResetLogInspectorState;
  };
}) {
  const resetLogInspectorState = args.operations?.resetLogInspectorState ?? runResetLogInspectorState;

  resetLogInspectorState({
    options: args.options,
    refs: args.refs,
    actions: args.actions
  });
}

export async function loadRunTimelineController(args: {
  runId: string | null;
  options?: { preserveExisting?: boolean };
  refs: Pick<
    InspectorRefs,
    'selectedRunIdRef' | 'timelineAbortControllerRef' | 'timelineRequestIdRef'
  >;
  actions: Pick<
    InspectorActions,
    'setSelectedRunId' | 'setTimeline' | 'setTimelineError' | 'setTimelineLoading'
  >;
  operations?: {
    loadRunTimeline?: typeof runLoadRunTimeline;
  };
}) {
  const loadRunTimeline = args.operations?.loadRunTimeline ?? runLoadRunTimeline;

  return loadRunTimeline({
    runId: args.runId,
    options: args.options,
    refs: args.refs,
    actions: args.actions
  });
}

export async function loadInspectorController(args: {
  threadId: string;
  messagesSnapshot: MessageDto[];
  options?: { preferredRunId?: string | null; preserveExistingTimeline?: boolean };
  refs: Pick<
    InspectorRefs,
    'activeThreadIdRef' | 'logInspectorAbortControllerRef' | 'logInspectorRequestIdRef'
  >;
  actions: InspectorActions;
  operations: {
    loadRunTimeline: (runId: string | null, options?: { preserveExisting?: boolean }) => Promise<void>;
    loadLogInspectorFlow?: typeof runLoadLogInspectorFlow;
  };
}) {
  const loadLogInspectorFlow = args.operations.loadLogInspectorFlow ?? runLoadLogInspectorFlow;

  return loadLogInspectorFlow({
    threadId: args.threadId,
    messagesSnapshot: args.messagesSnapshot,
    options: args.options,
    refs: args.refs,
    actions: args.actions,
    operations: {
      loadRunTimeline: args.operations.loadRunTimeline
    }
  });
}
