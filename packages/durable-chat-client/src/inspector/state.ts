import type { RunDto, RunTimelineResponseDto } from '@agent-infra/contracts';

export type RunInspectorState = {
  logOpen: boolean;
  selectedRunId: string | null;
  recentRuns: RunDto[];
  recentRunsLoading: boolean;
  recentRunsError: string | null;
  timeline: RunTimelineResponseDto | null;
  timelineLoading: boolean;
  timelineError: string | null;
};

export function createInitialRunInspectorState(): RunInspectorState {
  return {
    logOpen: false,
    selectedRunId: null,
    recentRuns: [],
    recentRunsLoading: false,
    recentRunsError: null,
    timeline: null,
    timelineLoading: false,
    timelineError: null
  };
}
