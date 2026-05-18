'use client';

import type {
  DatasetDto,
  DatasetExampleDto,
  EvalExampleResultDto,
  EvalExampleResultReviewStatusDto,
  EvalRunDto
} from '@agent-infra/contracts';
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

function buildEvalQuery(input: {
  datasetId: string | null | undefined;
  evalRunId: string | null | undefined;
  resultId: string | null | undefined;
}) {
  const params = new URLSearchParams();
  const datasetId = normalizeObservabilityQueryValue(input.datasetId);
  const evalRunId = normalizeObservabilityQueryValue(input.evalRunId);
  const resultId = normalizeObservabilityQueryValue(input.resultId);
  if (datasetId) {
    params.set('datasetId', datasetId);
  }
  if (evalRunId) {
    params.set('evalRunId', evalRunId);
  }
  if (resultId) {
    params.set('resultId', resultId);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
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

  const [sourceExample, setSourceExample] = useState<DatasetExampleDto | null>(null);
  const [sourceExampleLoading, setSourceExampleLoading] = useState(false);
  const [sourceExampleError, setSourceExampleError] = useState<string | null>(null);

  const [creatingEvalRun, setCreatingEvalRun] = useState(false);
  const [runningEvalRun, setRunningEvalRun] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const requestedDatasetId = normalizeObservabilityQueryValue(searchParams.get('datasetId'));
  const requestedEvalRunId = normalizeObservabilityQueryValue(searchParams.get('evalRunId'));
  const requestedResultId = normalizeObservabilityQueryValue(searchParams.get('resultId'));

  const datasetSelection = useMemo(
    () => resolveObservabilitySelection(datasets, requestedDatasetId),
    [datasets, requestedDatasetId]
  );
  const selectedDatasetId = datasetSelection.selectedId;

  const evalRunSelection = useMemo(
    () => resolveObservabilitySelection(evalRuns, selectedDatasetId ? requestedEvalRunId : null),
    [evalRuns, requestedEvalRunId, selectedDatasetId]
  );
  const selectedEvalRunId = evalRunSelection.selectedId;

  const resultSelection = useMemo(
    () => resolveObservabilitySelection(results, selectedEvalRunId ? requestedResultId : null),
    [requestedResultId, results, selectedEvalRunId]
  );
  const selectedResultId = resultSelection.selectedId;

  const selectedDataset = datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null;
  const selectedEvalRun = evalRuns.find((evalRun) => evalRun.id === selectedEvalRunId) ?? null;
  const selectedResult = results.find((result) => result.id === selectedResultId) ?? null;

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
    const nextQuery = buildEvalQuery({ datasetId: selectedDatasetId, evalRunId: selectedEvalRunId, resultId: selectedResultId });
    const currentQuery = searchParams.toString();
    const nextPath = `${pathname}${nextQuery}`;
    const currentPath = `${pathname}${currentQuery ? `?${currentQuery}` : ''}`;

    if (selectedDatasetId && nextPath !== currentPath) {
      router.replace(nextPath, { scroll: false });
    }
  }, [pathname, router, searchParams, selectedDatasetId, selectedEvalRunId, selectedResultId]);

  useEffect(() => {
    const controller = new AbortController();
    setResults([]);
    setResultsError(null);
    setSourceExample(null);
    setSourceExampleError(null);

    if (!selectedEvalRunId) {
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
  }, [refreshVersion, selectedEvalRunId]);

  useEffect(() => {
    const controller = new AbortController();
    setSourceExample(null);
    setSourceExampleError(null);

    if (!selectedEvalRun?.datasetId || !selectedResult?.datasetExampleId) {
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
  }, [selectedEvalRun?.datasetId, selectedResult?.datasetExampleId]);

  const selectDataset = useCallback(
    (datasetId: string) => {
      router.push(`${pathname}${buildEvalQuery({ datasetId, evalRunId: null, resultId: null })}`, { scroll: false });
    },
    [pathname, router]
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
    selectDataset,
    selectEvalRun,
    selectResult,
    createEvalRun,
    runSelectedEvalRun,
    saveResultReview,
    refresh: () => setRefreshVersion((current) => current + 1)
  };
}
