'use client';

import type { RunDto, RunTimelineResponseDto, RunTraceResponseDto, ThreadRunListItemDto } from '@agent-infra/contracts';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { PlaygroundThreadDto } from '@/features/durable-chat/repo/chat-api';
import {
  fetchPlaygroundThreads,
  fetchRunTimelineResponse,
  fetchRunTraceResponse,
  fetchThreadRunsResponse
} from '@/features/durable-chat/repo/chat-api';

import { buildObservabilityQuery, normalizeObservabilityQueryValue, resolveObservabilitySelection } from '../service/selection';

const RECENT_RUN_LIMIT = 20;

export type ObservabilityConsoleState = ReturnType<typeof useObservabilityConsole>;

export function useObservabilityConsole() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [refreshVersion, setRefreshVersion] = useState(0);

  const [threads, setThreads] = useState<PlaygroundThreadDto[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState<string | null>(null);

  const [runItems, setRunItems] = useState<ThreadRunListItemDto[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);

  const [timeline, setTimeline] = useState<RunTimelineResponseDto | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const [trace, setTrace] = useState<RunTraceResponseDto | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState<string | null>(null);

  const requestedThreadId = normalizeObservabilityQueryValue(searchParams.get('threadId'));
  const requestedRunId = normalizeObservabilityQueryValue(searchParams.get('runId'));
  const runs = useMemo(() => runItems.map((item) => item.run), [runItems]);

  const threadSelection = useMemo(
    () => resolveObservabilitySelection(threads, requestedThreadId),
    [requestedThreadId, threads]
  );
  const selectedThreadId = threadSelection.selectedId;

  const runSelection = useMemo(
    () => resolveObservabilitySelection(runs, selectedThreadId ? requestedRunId : null),
    [requestedRunId, runs, selectedThreadId]
  );
  const selectedRunId = runSelection.selectedId;

  useEffect(() => {
    const controller = new AbortController();
    setThreadsLoading(true);
    setThreadsError(null);

    fetchPlaygroundThreads(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        if (!result.ok) {
          throw new Error(result.error ?? `Failed to load threads (${result.status})`);
        }

        setThreads(result.data.threads);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setThreads([]);
        setThreadsError(error instanceof Error ? error.message : 'Failed to load threads');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setThreadsLoading(false);
        }
      });

    return () => controller.abort();
  }, [refreshVersion]);

  useEffect(() => {
    const controller = new AbortController();
    setRunItems([]);
    setRunsError(null);
    setTimeline(null);
    setTrace(null);

    if (!selectedThreadId) {
      setRunsLoading(false);
      return () => controller.abort();
    }

    setRunsLoading(true);
    fetchThreadRunsResponse(selectedThreadId, RECENT_RUN_LIMIT, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        if (!result.ok) {
          throw new Error(result.error ?? `Failed to load runs (${result.status})`);
        }

        setRunItems(result.data.items);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setRunItems([]);
        setRunsError(error instanceof Error ? error.message : 'Failed to load runs');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setRunsLoading(false);
        }
      });

    return () => controller.abort();
  }, [refreshVersion, selectedThreadId]);

  useEffect(() => {
    const nextQuery = buildObservabilityQuery({ threadId: selectedThreadId, runId: selectedRunId });
    const currentQuery = searchParams.toString();
    const nextPath = `${pathname}${nextQuery}`;
    const currentPath = `${pathname}${currentQuery ? `?${currentQuery}` : ''}`;

    if (selectedThreadId && nextPath !== currentPath) {
      router.replace(nextPath, { scroll: false });
    }
  }, [pathname, router, searchParams, selectedRunId, selectedThreadId]);

  useEffect(() => {
    const controller = new AbortController();
    setTimeline(null);
    setTimelineError(null);
    setTrace(null);
    setTraceError(null);

    if (!selectedRunId) {
      setTimelineLoading(false);
      setTraceLoading(false);
      return () => controller.abort();
    }

    setTimelineLoading(true);
    fetchRunTimelineResponse(selectedRunId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        if (!result.ok) {
          throw new Error(result.error ?? `Failed to load timeline (${result.status})`);
        }

        setTimeline(result.data);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setTimeline(null);
        setTimelineError(error instanceof Error ? error.message : 'Failed to load timeline');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setTimelineLoading(false);
        }
      });

    setTraceLoading(true);
    fetchRunTraceResponse(selectedRunId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        if (!result.ok) {
          throw new Error(result.error ?? `Failed to load trace (${result.status})`);
        }

        setTrace(result.data);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setTrace(null);
        setTraceError(error instanceof Error ? error.message : 'Failed to load trace');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setTraceLoading(false);
        }
      });

    return () => controller.abort();
  }, [refreshVersion, selectedRunId]);

  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? null;
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? timeline?.run ?? trace?.run ?? null;
  const selectedRunItem = runItems.find((item) => item.run.id === selectedRunId) ?? null;

  const selectThread = useCallback(
    (threadId: string) => {
      router.push(`${pathname}${buildObservabilityQuery({ threadId, runId: null })}`, { scroll: false });
    },
    [pathname, router]
  );

  const selectRun = useCallback(
    (runId: string) => {
      router.push(`${pathname}${buildObservabilityQuery({ threadId: selectedThreadId, runId })}`, { scroll: false });
    },
    [pathname, router, selectedThreadId]
  );

  return {
    threads,
    threadsLoading,
    threadsError,
    threadSelection,
    selectedThread,
    selectedThreadId,
    runs,
    runItems,
    runsLoading,
    runsError,
    runSelection,
    selectedRun,
    selectedRunItem,
    selectedRunId,
    timeline,
    timelineLoading,
    timelineError,
    trace,
    traceLoading,
    traceError,
    selectThread,
    selectRun,
    refresh: () => setRefreshVersion((current) => current + 1)
  };
}
