'use client';

import type { RunDto, RunTimelineResponseDto } from '@agent-infra/contracts';
import { useReducer } from 'react';

import type { RunInspectorState } from '../types/state';

type Updater<T> = T | ((current: T) => T);
type RunInspectorAction = Partial<RunInspectorState> | ((current: RunInspectorState) => RunInspectorState);

function resolveNext<T>(current: T, next: Updater<T>) {
  return typeof next === 'function' ? (next as (value: T) => T)(current) : next;
}

function runInspectorReducer(state: RunInspectorState, action: RunInspectorAction) {
  if (typeof action === 'function') {
    return action(state);
  }

  return {
    ...state,
    ...action
  };
}

function createInitialRunInspectorState(): RunInspectorState {
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

export function useRunInspectorController() {
  const [state, dispatch] = useReducer(runInspectorReducer, undefined, createInitialRunInspectorState);

  return {
    state,
    updateInspector: (action: RunInspectorAction) => dispatch(action),
    setLogOpen: (next: Updater<boolean>) => {
      dispatch((current) => ({ ...current, logOpen: resolveNext(current.logOpen, next) }));
    },
    setSelectedRunId: (next: Updater<string | null>) => {
      dispatch((current) => ({ ...current, selectedRunId: resolveNext(current.selectedRunId, next) }));
    },
    setRecentRuns: (next: Updater<RunDto[]>) => {
      dispatch((current) => ({ ...current, recentRuns: resolveNext(current.recentRuns, next) }));
    },
    setRecentRunsLoading: (next: Updater<boolean>) => {
      dispatch((current) => ({ ...current, recentRunsLoading: resolveNext(current.recentRunsLoading, next) }));
    },
    setRecentRunsError: (next: Updater<string | null>) => {
      dispatch((current) => ({ ...current, recentRunsError: resolveNext(current.recentRunsError, next) }));
    },
    setTimeline: (next: Updater<RunTimelineResponseDto | null>) => {
      dispatch((current) => ({ ...current, timeline: resolveNext(current.timeline, next) }));
    },
    setTimelineLoading: (next: Updater<boolean>) => {
      dispatch((current) => ({ ...current, timelineLoading: resolveNext(current.timelineLoading, next) }));
    },
    setTimelineError: (next: Updater<string | null>) => {
      dispatch((current) => ({ ...current, timelineError: resolveNext(current.timelineError, next) }));
    }
  };
}
