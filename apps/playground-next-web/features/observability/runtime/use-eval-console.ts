'use client';

import type {
  DatasetDto,
  DatasetExampleDto,
  EvalExampleResultDto,
  EvalExampleResultReviewStatusDto,
  EvalRunDto
} from '@agent-infra/contracts';
import { projectEvalRunCompareV1 } from '@agent-infra/durable-chat-client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  createEvalRunResponse,
  fetchDatasetExampleResponse,
  fetchDatasetEvalRunsResponse,
  fetchDatasetsResponse,
  fetchEvalExampleResultsResponse,
  fetchEvalRunResponse,
  runEvalRunResponse,
  updateEvalExampleResultReviewResponse
} from '@/features/durable-chat/repo/chat-api';

import { normalizeObservabilityQueryValue, resolveObservabilitySelection } from '../service/selection';

export type EvalConsoleMode = 'review' | 'compare';

function buildEvalQuery(input: {
  mode?: EvalConsoleMode;
  datasetId: string | null | undefined;
  evalRunId: string | null | undefined;
  resultId: string | null | undefined;
  baselineEvalRunId?: string | null | undefined;
  candidateEvalRunId?: string | null | undefined;
  compareDatasetExampleId?: string | null | undefined;
}) {
  const params = new URLSearchParams();
  const mode = input.mode === 'compare' ? 'compare' : 'review';
  const datasetId = normalizeObservabilityQueryValue(input.datasetId);
  const evalRunId = normalizeObservabilityQueryValue(input.evalRunId);
  const resultId = normalizeObservabilityQueryValue(input.resultId);
  const baselineEvalRunId = normalizeObservabilityQueryValue(input.baselineEvalRunId);
  const candidateEvalRunId = normalizeObservabilityQueryValue(input.candidateEvalRunId);
  const compareDatasetExampleId = normalizeObservabilityQueryValue(input.compareDatasetExampleId);
  if (mode === 'compare') {
    params.set('mode', mode);
  }
  if (datasetId) {
    params.set('datasetId', datasetId);
  }
  if (mode === 'compare') {
    if (baselineEvalRunId) {
      params.set('baselineEvalRunId', baselineEvalRunId);
    }
    if (candidateEvalRunId) {
      params.set('candidateEvalRunId', candidateEvalRunId);
    }
    if (compareDatasetExampleId) {
      params.set('compareDatasetExampleId', compareDatasetExampleId);
    }
  } else if (evalRunId) {
    params.set('evalRunId', evalRunId);
    if (resultId) {
      params.set('resultId', resultId);
    }
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

function normalizeEvalConsoleMode(value: string | null | undefined): EvalConsoleMode {
  return value === 'compare' ? 'compare' : 'review';
}

function resolveCompareCandidateEvalRunId(evalRuns: EvalRunDto[], baselineEvalRunId: string | null, requestedCandidateEvalRunId: string | null) {
  const normalizedRequestedId = normalizeObservabilityQueryValue(requestedCandidateEvalRunId);
  if (
    normalizedRequestedId &&
    normalizedRequestedId !== baselineEvalRunId &&
    evalRuns.some((evalRun) => evalRun.id === normalizedRequestedId)
  ) {
    return normalizedRequestedId;
  }

  return evalRuns.find((evalRun) => evalRun.id !== baselineEvalRunId)?.id ?? null;
}

export type EvalResultReviewDraft = {
  status: EvalExampleResultReviewStatusDto;
  reviewerNote: string;
};

export type EvalConsoleState = ReturnType<typeof useEvalConsole>;

export function useEvalConsole() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [refreshVersion, setRefreshVersion] = useState(0);

  const [datasets, setDatasets] = useState<DatasetDto[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(true);
  const [datasetsError, setDatasetsError] = useState<string | null>(null);

  const [evalRuns, setEvalRuns] = useState<EvalRunDto[]>([]);
  const [evalRunsLoading, setEvalRunsLoading] = useState(false);
  const [evalRunsError, setEvalRunsError] = useState<string | null>(null);

  const [results, setResults] = useState<EvalExampleResultDto[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);

  const [baselineCompareResults, setBaselineCompareResults] = useState<EvalExampleResultDto[]>([]);
  const [baselineCompareResultsLoaded, setBaselineCompareResultsLoaded] = useState(false);
  const [baselineCompareResultsLoading, setBaselineCompareResultsLoading] = useState(false);
  const [baselineCompareResultsError, setBaselineCompareResultsError] = useState<string | null>(null);
  const [candidateCompareResults, setCandidateCompareResults] = useState<EvalExampleResultDto[]>([]);
  const [candidateCompareResultsLoaded, setCandidateCompareResultsLoaded] = useState(false);
  const [candidateCompareResultsLoading, setCandidateCompareResultsLoading] = useState(false);
  const [candidateCompareResultsError, setCandidateCompareResultsError] = useState<string | null>(null);

  const [sourceExample, setSourceExample] = useState<DatasetExampleDto | null>(null);
  const [sourceExampleLoading, setSourceExampleLoading] = useState(false);
  const [sourceExampleError, setSourceExampleError] = useState<string | null>(null);

  const [creatingEvalRun, setCreatingEvalRun] = useState(false);
  const [runningEvalRun, setRunningEvalRun] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const mode = normalizeEvalConsoleMode(searchParams.get('mode'));
  const isCompareMode = mode === 'compare';
  const requestedDatasetId = normalizeObservabilityQueryValue(searchParams.get('datasetId'));
  const requestedEvalRunId = normalizeObservabilityQueryValue(searchParams.get('evalRunId'));
  const requestedResultId = normalizeObservabilityQueryValue(searchParams.get('resultId'));
  const requestedBaselineEvalRunId = normalizeObservabilityQueryValue(searchParams.get('baselineEvalRunId'));
  const requestedCandidateEvalRunId = normalizeObservabilityQueryValue(searchParams.get('candidateEvalRunId'));
  const requestedCompareDatasetExampleId = isCompareMode
    ? normalizeObservabilityQueryValue(searchParams.get('compareDatasetExampleId'))
    : null;

  const datasetSelection = useMemo(
    () => resolveObservabilitySelection(datasets, requestedDatasetId),
    [datasets, requestedDatasetId]
  );
  const selectedDatasetId = datasetSelection.selectedId;

  const evalRunSelection = useMemo(
    () => resolveObservabilitySelection(evalRuns, selectedDatasetId && !isCompareMode ? requestedEvalRunId : null),
    [evalRuns, isCompareMode, requestedEvalRunId, selectedDatasetId]
  );
  const selectedEvalRunId = evalRunSelection.selectedId;

  const baselineEvalRunSelection = useMemo(
    () => resolveObservabilitySelection(evalRuns, selectedDatasetId && isCompareMode ? requestedBaselineEvalRunId : null),
    [evalRuns, isCompareMode, requestedBaselineEvalRunId, selectedDatasetId]
  );
  const selectedBaselineEvalRunId = baselineEvalRunSelection.selectedId;
  const selectedCandidateEvalRunId = useMemo(
    () => selectedDatasetId && isCompareMode
      ? resolveCompareCandidateEvalRunId(evalRuns, selectedBaselineEvalRunId, requestedCandidateEvalRunId)
      : null,
    [evalRuns, isCompareMode, requestedCandidateEvalRunId, selectedBaselineEvalRunId, selectedDatasetId]
  );

  const resultSelection = useMemo(
    () => resolveObservabilitySelection(results, selectedEvalRunId ? requestedResultId : null),
    [requestedResultId, results, selectedEvalRunId]
  );
  const selectedResultId = resultSelection.selectedId;

  const selectedDataset = datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null;
  const selectedEvalRun = evalRuns.find((evalRun) => evalRun.id === selectedEvalRunId) ?? null;
  const selectedBaselineEvalRun = evalRuns.find((evalRun) => evalRun.id === selectedBaselineEvalRunId) ?? null;
  const selectedCandidateEvalRun = evalRuns.find((evalRun) => evalRun.id === selectedCandidateEvalRunId) ?? null;
  const selectedResult = results.find((result) => result.id === selectedResultId) ?? null;

  const compareProjection = useMemo(() => {
    if (
      !isCompareMode ||
      !selectedBaselineEvalRun ||
      !selectedCandidateEvalRun ||
      selectedBaselineEvalRun.datasetId !== selectedDatasetId ||
      selectedCandidateEvalRun.datasetId !== selectedDatasetId ||
      !baselineCompareResultsLoaded ||
      !candidateCompareResultsLoaded ||
      baselineCompareResultsError ||
      candidateCompareResultsError
    ) {
      return null;
    }

    return projectEvalRunCompareV1({
      baselineRun: selectedBaselineEvalRun,
      candidateRun: selectedCandidateEvalRun,
      baselineResults: baselineCompareResults,
      candidateResults: candidateCompareResults
    });
  }, [
    baselineCompareResults,
    baselineCompareResultsError,
    baselineCompareResultsLoaded,
    candidateCompareResults,
    candidateCompareResultsError,
    candidateCompareResultsLoaded,
    isCompareMode,
    selectedBaselineEvalRun,
    selectedCandidateEvalRun,
    selectedDatasetId
  ]);

  const selectedCompareRow = useMemo(() => {
    if (!compareProjection) {
      return null;
    }

    if (requestedCompareDatasetExampleId) {
      return compareProjection.rows.find((row) => row.datasetExampleId === requestedCompareDatasetExampleId) ?? compareProjection.rows[0] ?? null;
    }

    return compareProjection.rows[0] ?? null;
  }, [compareProjection, requestedCompareDatasetExampleId]);
  const selectedCompareDatasetExampleId = selectedCompareRow?.datasetExampleId ?? requestedCompareDatasetExampleId;

  useEffect(() => {
    const controller = new AbortController();
    setDatasetsLoading(true);
    setDatasetsError(null);

    fetchDatasetsResponse(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        if (!result.ok) {
          throw new Error(result.error ?? `Failed to load datasets (${result.status})`);
        }
        setDatasets(result.data.datasets);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setDatasets([]);
          setDatasetsError(error instanceof Error ? error.message : 'Failed to load datasets');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setDatasetsLoading(false);
        }
      });

    return () => controller.abort();
  }, [refreshVersion]);

  useEffect(() => {
    const controller = new AbortController();
    setEvalRuns([]);
    setEvalRunsError(null);
    setResults([]);
    setResultsError(null);
    setBaselineCompareResults([]);
    setBaselineCompareResultsLoaded(false);
    setBaselineCompareResultsError(null);
    setCandidateCompareResults([]);
    setCandidateCompareResultsLoaded(false);
    setCandidateCompareResultsError(null);
    setSourceExample(null);
    setSourceExampleError(null);

    if (!selectedDatasetId) {
      setEvalRunsLoading(false);
      return () => controller.abort();
    }

    setEvalRunsLoading(true);
    fetchDatasetEvalRunsResponse(selectedDatasetId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        if (!result.ok) {
          throw new Error(result.error ?? `Failed to load eval runs (${result.status})`);
        }
        setEvalRuns(result.data.evalRuns);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setEvalRuns([]);
          setEvalRunsError(error instanceof Error ? error.message : 'Failed to load eval runs');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setEvalRunsLoading(false);
        }
      });

    return () => controller.abort();
  }, [refreshVersion, selectedDatasetId]);

  useEffect(() => {
    const hasEvalRunsForSelectedDataset = evalRuns.some((evalRun) => evalRun.datasetId === selectedDatasetId);
    const baselineBelongsToSelectedDataset = selectedBaselineEvalRun?.datasetId === selectedDatasetId;
    const candidateBelongsToSelectedDataset = selectedCandidateEvalRun?.datasetId === selectedDatasetId;
    const nextBaselineEvalRunId = isCompareMode
      ? baselineBelongsToSelectedDataset
        ? selectedBaselineEvalRunId
        : hasEvalRunsForSelectedDataset
          ? null
          : requestedBaselineEvalRunId
      : null;
    const nextCandidateEvalRunId = isCompareMode
      ? candidateBelongsToSelectedDataset
        ? selectedCandidateEvalRunId
        : hasEvalRunsForSelectedDataset
          ? null
          : requestedCandidateEvalRunId
      : null;
    const nextQuery = buildEvalQuery({
      mode,
      datasetId: selectedDatasetId,
      evalRunId: selectedEvalRunId,
      resultId: selectedResultId,
      baselineEvalRunId: nextBaselineEvalRunId,
      candidateEvalRunId: nextCandidateEvalRunId,
      compareDatasetExampleId: selectedCompareDatasetExampleId
    });
    const currentQuery = searchParams.toString();
    const nextPath = `${pathname}${nextQuery}`;
    const currentPath = `${pathname}${currentQuery ? `?${currentQuery}` : ''}`;

    if (selectedDatasetId && nextPath !== currentPath) {
      router.replace(nextPath, { scroll: false });
    }
  }, [
    mode,
    isCompareMode,
    pathname,
    router,
    searchParams,
    requestedBaselineEvalRunId,
    requestedCandidateEvalRunId,
    evalRuns,
    selectedBaselineEvalRunId,
    selectedBaselineEvalRun?.datasetId,
    selectedCandidateEvalRunId,
    selectedCandidateEvalRun?.datasetId,
    selectedCompareDatasetExampleId,
    selectedDatasetId,
    selectedEvalRunId,
    selectedResultId
  ]);

  useEffect(() => {
    const controller = new AbortController();
    setResults([]);
    setResultsError(null);
    setSourceExample(null);
    setSourceExampleError(null);

    if (isCompareMode || !selectedEvalRunId || selectedEvalRun?.datasetId !== selectedDatasetId) {
      setResultsLoading(false);
      return () => controller.abort();
    }

    setResultsLoading(true);
    fetchEvalExampleResultsResponse(selectedEvalRunId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        if (!result.ok) {
          throw new Error(result.error ?? `Failed to load eval results (${result.status})`);
        }
        setResults(result.data.results);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setResults([]);
          setResultsError(error instanceof Error ? error.message : 'Failed to load eval results');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setResultsLoading(false);
        }
      });

    return () => controller.abort();
  }, [isCompareMode, refreshVersion, selectedDatasetId, selectedEvalRun?.datasetId, selectedEvalRunId]);

  useEffect(() => {
    const controller = new AbortController();
    setBaselineCompareResults([]);
    setBaselineCompareResultsLoaded(false);
    setBaselineCompareResultsError(null);

    if (!isCompareMode || !selectedBaselineEvalRunId || selectedBaselineEvalRun?.datasetId !== selectedDatasetId) {
      setBaselineCompareResultsLoading(false);
      return () => controller.abort();
    }

    setBaselineCompareResultsLoading(true);
    fetchEvalExampleResultsResponse(selectedBaselineEvalRunId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        if (!result.ok) {
          throw new Error(result.error ?? `Failed to load baseline eval results (${result.status})`);
        }
        setBaselineCompareResults(result.data.results);
        setBaselineCompareResultsLoaded(true);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setBaselineCompareResults([]);
          setBaselineCompareResultsLoaded(false);
          setBaselineCompareResultsError(error instanceof Error ? error.message : 'Failed to load baseline eval results');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setBaselineCompareResultsLoading(false);
        }
      });

    return () => controller.abort();
  }, [isCompareMode, refreshVersion, selectedBaselineEvalRun?.datasetId, selectedBaselineEvalRunId, selectedDatasetId]);

  useEffect(() => {
    const controller = new AbortController();
    setCandidateCompareResults([]);
    setCandidateCompareResultsLoaded(false);
    setCandidateCompareResultsError(null);

    if (!isCompareMode || !selectedCandidateEvalRunId || selectedCandidateEvalRun?.datasetId !== selectedDatasetId) {
      setCandidateCompareResultsLoading(false);
      return () => controller.abort();
    }

    setCandidateCompareResultsLoading(true);
    fetchEvalExampleResultsResponse(selectedCandidateEvalRunId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        if (!result.ok) {
          throw new Error(result.error ?? `Failed to load candidate eval results (${result.status})`);
        }
        setCandidateCompareResults(result.data.results);
        setCandidateCompareResultsLoaded(true);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setCandidateCompareResults([]);
          setCandidateCompareResultsLoaded(false);
          setCandidateCompareResultsError(error instanceof Error ? error.message : 'Failed to load candidate eval results');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCandidateCompareResultsLoading(false);
        }
      });

    return () => controller.abort();
  }, [isCompareMode, refreshVersion, selectedCandidateEvalRun?.datasetId, selectedCandidateEvalRunId, selectedDatasetId]);

  useEffect(() => {
    const controller = new AbortController();
    setSourceExample(null);
    setSourceExampleError(null);

    if (isCompareMode || !selectedEvalRun?.datasetId || !selectedResult?.datasetExampleId) {
      setSourceExampleLoading(false);
      return () => controller.abort();
    }

    setSourceExampleLoading(true);
    fetchDatasetExampleResponse(selectedEvalRun.datasetId, selectedResult.datasetExampleId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        if (!result.ok || !result.data.example) {
          throw new Error(result.error ?? `Failed to load source example (${result.status})`);
        }
        setSourceExample(result.data.example);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setSourceExample(null);
          setSourceExampleError(error instanceof Error ? error.message : 'Failed to load source example');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSourceExampleLoading(false);
        }
      });

    return () => controller.abort();
  }, [isCompareMode, selectedEvalRun?.datasetId, selectedResult?.datasetExampleId]);

  const selectMode = useCallback(
    (nextMode: EvalConsoleMode) => {
      const nextBaselineEvalRunId = selectedBaselineEvalRunId ?? selectedEvalRunId ?? evalRuns[0]?.id ?? null;
      const nextCandidateEvalRunId = selectedCandidateEvalRunId
        ?? evalRuns.find((evalRun) => evalRun.id !== nextBaselineEvalRunId)?.id
        ?? null;
      const nextReviewEvalRunId = nextMode === 'review'
        ? selectedBaselineEvalRunId ?? selectedCandidateEvalRunId ?? selectedEvalRunId
        : selectedEvalRunId;
      router.push(`${pathname}${buildEvalQuery({
        mode: nextMode,
        datasetId: selectedDatasetId,
        evalRunId: nextReviewEvalRunId,
        resultId: selectedResultId,
        baselineEvalRunId: nextBaselineEvalRunId,
        candidateEvalRunId: nextCandidateEvalRunId,
        compareDatasetExampleId: selectedCompareDatasetExampleId
      })}`, { scroll: false });
    },
    [
      evalRuns,
      pathname,
      router,
      selectedBaselineEvalRunId,
      selectedCandidateEvalRunId,
      selectedCompareDatasetExampleId,
      selectedDatasetId,
      selectedEvalRunId,
      selectedResultId
    ]
  );

  const selectDataset = useCallback(
    (datasetId: string) => {
      router.push(`${pathname}${buildEvalQuery({ mode, datasetId, evalRunId: null, resultId: null })}`, { scroll: false });
    },
    [mode, pathname, router]
  );

  const selectEvalRun = useCallback(
    (evalRunId: string) => {
      router.push(`${pathname}${buildEvalQuery({ datasetId: selectedDatasetId, evalRunId, resultId: null })}`, { scroll: false });
    },
    [pathname, router, selectedDatasetId]
  );

  const selectResult = useCallback(
    (resultId: string) => {
      router.push(`${pathname}${buildEvalQuery({ datasetId: selectedDatasetId, evalRunId: selectedEvalRunId, resultId })}`, { scroll: false });
    },
    [pathname, router, selectedDatasetId, selectedEvalRunId]
  );

  const selectCompareEvalRun = useCallback(
    (side: 'baseline' | 'candidate', evalRunId: string) => {
      router.push(`${pathname}${buildEvalQuery({
        mode: 'compare',
        datasetId: selectedDatasetId,
        evalRunId: null,
        resultId: null,
        baselineEvalRunId: side === 'baseline' ? evalRunId : selectedBaselineEvalRunId,
        candidateEvalRunId: side === 'candidate' ? evalRunId : selectedCandidateEvalRunId,
        compareDatasetExampleId: selectedCompareDatasetExampleId
      })}`, { scroll: false });
    },
    [pathname, router, selectedBaselineEvalRunId, selectedCandidateEvalRunId, selectedCompareDatasetExampleId, selectedDatasetId]
  );

  const selectCompareDatasetExample = useCallback(
    (datasetExampleId: string) => {
      router.push(`${pathname}${buildEvalQuery({
        mode: 'compare',
        datasetId: selectedDatasetId,
        evalRunId: null,
        resultId: null,
        baselineEvalRunId: selectedBaselineEvalRunId,
        candidateEvalRunId: selectedCandidateEvalRunId,
        compareDatasetExampleId: datasetExampleId
      })}`, { scroll: false });
    },
    [pathname, router, selectedBaselineEvalRunId, selectedCandidateEvalRunId, selectedDatasetId]
  );

  const createEvalRun = useCallback(async () => {
    if (!selectedDatasetId) {
      return;
    }

    setCreatingEvalRun(true);
    setMutationError(null);
    try {
      const result = await createEvalRunResponse(selectedDatasetId, {});
      if (!result.ok || !result.data.evalRun) {
        throw new Error(result.error ?? `Failed to create eval run (${result.status})`);
      }
      setEvalRuns((current) => [result.data.evalRun as EvalRunDto, ...current.filter((evalRun) => evalRun.id !== result.data.evalRun?.id)]);
      router.push(`${pathname}${buildEvalQuery({ datasetId: selectedDatasetId, evalRunId: result.data.evalRun.id, resultId: null })}`, { scroll: false });
    } catch (error: unknown) {
      setMutationError(error instanceof Error ? error.message : 'Failed to create eval run');
    } finally {
      setCreatingEvalRun(false);
    }
  }, [pathname, router, selectedDatasetId]);

  const runSelectedEvalRun = useCallback(async () => {
    if (!selectedEvalRunId) {
      return;
    }

    setRunningEvalRun(true);
    setMutationError(null);
    try {
      const result = await runEvalRunResponse(selectedEvalRunId);
      if (!result.ok || !result.data.evalRun) {
        throw new Error(result.error ?? `Failed to run eval (${result.status})`);
      }
      setEvalRuns((current) => current.map((evalRun) => evalRun.id === result.data.evalRun?.id ? result.data.evalRun : evalRun));
      setRefreshVersion((current) => current + 1);
    } catch (error: unknown) {
      setMutationError(error instanceof Error ? error.message : 'Failed to run eval');
    } finally {
      setRunningEvalRun(false);
    }
  }, [selectedEvalRunId]);

  const saveResultReview = useCallback(
    async (draft: EvalResultReviewDraft) => {
      if (!selectedEvalRunId || !selectedResultId) {
        return;
      }

      setSavingReview(true);
      setMutationError(null);
      try {
        const result = await updateEvalExampleResultReviewResponse(selectedEvalRunId, selectedResultId, {
          status: draft.status,
          reviewerNote: draft.reviewerNote.trim() || null
        });
        if (!result.ok || !result.data.result) {
          throw new Error(result.error ?? `Failed to save eval review (${result.status})`);
        }
        setResults((current) => current.map((item) => item.id === result.data.result?.id ? result.data.result : item));

        const evalRunResult = await fetchEvalRunResponse(selectedEvalRunId);
        if (evalRunResult.ok && evalRunResult.data.evalRun) {
          setEvalRuns((current) => current.map((item) => item.id === evalRunResult.data.evalRun?.id ? evalRunResult.data.evalRun : item));
        } else {
          setMutationError(evalRunResult.error ?? `Saved review but failed to refresh eval run (${evalRunResult.status})`);
        }
      } catch (error: unknown) {
        setMutationError(error instanceof Error ? error.message : 'Failed to save eval review');
      } finally {
        setSavingReview(false);
      }
    },
    [selectedEvalRunId, selectedResultId]
  );

  return {
    mode,
    isCompareMode,
    datasets,
    datasetsLoading,
    datasetsError,
    selectedDataset,
    selectedDatasetId,
    evalRuns,
    evalRunsLoading,
    evalRunsError,
    selectedEvalRun,
    selectedEvalRunId,
    selectedBaselineEvalRun,
    selectedBaselineEvalRunId,
    selectedCandidateEvalRun,
    selectedCandidateEvalRunId,
    selectedCompareDatasetExampleId,
    compareProjection,
    selectedCompareRow,
    baselineCompareResults,
    baselineCompareResultsLoaded,
    baselineCompareResultsLoading,
    baselineCompareResultsError,
    candidateCompareResults,
    candidateCompareResultsLoaded,
    candidateCompareResultsLoading,
    candidateCompareResultsError,
    results,
    resultsLoading,
    resultsError,
    selectedResult,
    selectedResultId,
    sourceExample,
    sourceExampleLoading,
    sourceExampleError,
    creatingEvalRun,
    runningEvalRun,
    savingReview,
    mutationError,
    selectMode,
    selectDataset,
    selectEvalRun,
    selectResult,
    selectCompareEvalRun,
    selectCompareDatasetExample,
    createEvalRun,
    runSelectedEvalRun,
    saveResultReview,
    refresh: () => setRefreshVersion((current) => current + 1)
  };
}
