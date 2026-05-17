'use client';

import type {
  DatasetDto,
  DatasetExampleDto,
  DatasetExampleReviewEvalEligibilityDto,
  DatasetExampleReviewExclusionReasonDto,
  DatasetExampleReviewStatusDto
} from '@agent-infra/contracts';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  fetchDatasetExampleResponse,
  fetchDatasetExamplesResponse,
  fetchDatasetsResponse,
  updateDatasetExampleExpectedOutputResponse,
  updateDatasetExampleReviewResponse
} from '@/features/durable-chat/repo/chat-api';

import { normalizeObservabilityQueryValue, resolveObservabilitySelection } from '../service/selection';

function buildDatasetReviewQuery(input: { datasetId: string | null | undefined; exampleId: string | null | undefined }) {
  const params = new URLSearchParams();
  const datasetId = normalizeObservabilityQueryValue(input.datasetId);
  const exampleId = normalizeObservabilityQueryValue(input.exampleId);
  if (datasetId) {
    params.set('datasetId', datasetId);
  }
  if (exampleId) {
    params.set('exampleId', exampleId);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export type ExpectedOutputDraft = {
  text: string;
  notes: string;
};

export type ReviewDraft = {
  status: DatasetExampleReviewStatusDto;
  evalEligibility: DatasetExampleReviewEvalEligibilityDto;
  exclusionReason: DatasetExampleReviewExclusionReasonDto | '';
  reviewerNote: string;
};

export type DatasetReviewConsoleState = ReturnType<typeof useDatasetReviewConsole>;

export function useDatasetReviewConsole() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [refreshVersion, setRefreshVersion] = useState(0);

  const [datasets, setDatasets] = useState<DatasetDto[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(true);
  const [datasetsError, setDatasetsError] = useState<string | null>(null);

  const [examples, setExamples] = useState<DatasetExampleDto[]>([]);
  const [examplesLoading, setExamplesLoading] = useState(false);
  const [examplesError, setExamplesError] = useState<string | null>(null);

  const [exampleDetail, setExampleDetail] = useState<DatasetExampleDto | null>(null);
  const [exampleDetailLoading, setExampleDetailLoading] = useState(false);
  const [exampleDetailError, setExampleDetailError] = useState<string | null>(null);

  const [savingExpectedOutput, setSavingExpectedOutput] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const requestedDatasetId = normalizeObservabilityQueryValue(searchParams.get('datasetId'));
  const requestedExampleId = normalizeObservabilityQueryValue(searchParams.get('exampleId'));

  const datasetSelection = useMemo(
    () => resolveObservabilitySelection(datasets, requestedDatasetId),
    [datasets, requestedDatasetId]
  );
  const selectedDatasetId = datasetSelection.selectedId;

  const exampleSelection = useMemo(
    () => resolveObservabilitySelection(examples, selectedDatasetId ? requestedExampleId : null),
    [examples, requestedExampleId, selectedDatasetId]
  );
  const selectedExampleId = exampleSelection.selectedId;

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
    setExamples([]);
    setExamplesError(null);
    setExampleDetail(null);
    setExampleDetailError(null);

    if (!selectedDatasetId) {
      setExamplesLoading(false);
      return () => controller.abort();
    }

    setExamplesLoading(true);
    fetchDatasetExamplesResponse(selectedDatasetId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        if (!result.ok) {
          throw new Error(result.error ?? `Failed to load examples (${result.status})`);
        }
        setExamples(result.data.examples);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setExamples([]);
          setExamplesError(error instanceof Error ? error.message : 'Failed to load examples');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setExamplesLoading(false);
        }
      });

    return () => controller.abort();
  }, [refreshVersion, selectedDatasetId]);

  useEffect(() => {
    const nextQuery = buildDatasetReviewQuery({ datasetId: selectedDatasetId, exampleId: selectedExampleId });
    const currentQuery = searchParams.toString();
    const nextPath = `${pathname}${nextQuery}`;
    const currentPath = `${pathname}${currentQuery ? `?${currentQuery}` : ''}`;

    if (selectedDatasetId && nextPath !== currentPath) {
      router.replace(nextPath, { scroll: false });
    }
  }, [pathname, router, searchParams, selectedDatasetId, selectedExampleId]);

  useEffect(() => {
    const controller = new AbortController();
    setExampleDetail(null);
    setExampleDetailError(null);

    if (!selectedDatasetId || !selectedExampleId) {
      setExampleDetailLoading(false);
      return () => controller.abort();
    }

    setExampleDetailLoading(true);
    fetchDatasetExampleResponse(selectedDatasetId, selectedExampleId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        if (!result.ok || !result.data.example) {
          throw new Error(result.error ?? `Failed to load example (${result.status})`);
        }
        setExampleDetail(result.data.example);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setExampleDetail(null);
          setExampleDetailError(error instanceof Error ? error.message : 'Failed to load example');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setExampleDetailLoading(false);
        }
      });

    return () => controller.abort();
  }, [refreshVersion, selectedDatasetId, selectedExampleId]);

  const selectedDataset = datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null;
  const selectedExample = exampleDetail ?? examples.find((example) => example.id === selectedExampleId) ?? null;

  const replaceExample = useCallback((nextExample: DatasetExampleDto) => {
    setExampleDetail(nextExample);
    setExamples((current) => current.map((example) => example.id === nextExample.id ? nextExample : example));
  }, []);

  const selectDataset = useCallback(
    (datasetId: string) => {
      router.push(`${pathname}${buildDatasetReviewQuery({ datasetId, exampleId: null })}`, { scroll: false });
    },
    [pathname, router]
  );

  const selectExample = useCallback(
    (exampleId: string) => {
      router.push(`${pathname}${buildDatasetReviewQuery({ datasetId: selectedDatasetId, exampleId })}`, { scroll: false });
    },
    [pathname, router, selectedDatasetId]
  );

  const saveExpectedOutput = useCallback(
    async (draft: ExpectedOutputDraft) => {
      if (!selectedDatasetId || !selectedExampleId) {
        return;
      }

      setSavingExpectedOutput(true);
      setMutationError(null);
      try {
        const text = draft.text.trim();
        const notes = draft.notes.trim();
        const result = await updateDatasetExampleExpectedOutputResponse(selectedDatasetId, selectedExampleId, {
          expectedOutputJson: text
            ? {
                schemaVersion: 1,
                kind: 'assistant_text',
                text,
                notes: notes || null
              }
            : null
        });
        if (!result.ok || !result.data.example) {
          throw new Error(result.error ?? `Failed to save expected output (${result.status})`);
        }
        replaceExample(result.data.example);
      } catch (error: unknown) {
        setMutationError(error instanceof Error ? error.message : 'Failed to save expected output');
      } finally {
        setSavingExpectedOutput(false);
      }
    },
    [replaceExample, selectedDatasetId, selectedExampleId]
  );

  const saveReview = useCallback(
    async (draft: ReviewDraft) => {
      if (!selectedDatasetId || !selectedExampleId) {
        return;
      }

      setSavingReview(true);
      setMutationError(null);
      try {
        const result = await updateDatasetExampleReviewResponse(selectedDatasetId, selectedExampleId, {
          status: draft.status,
          evalEligibility: draft.evalEligibility,
          exclusionReason: draft.exclusionReason || null,
          reviewerNote: draft.reviewerNote.trim() || null
        });
        if (!result.ok || !result.data.example) {
          throw new Error(result.error ?? `Failed to save review (${result.status})`);
        }
        replaceExample(result.data.example);
      } catch (error: unknown) {
        setMutationError(error instanceof Error ? error.message : 'Failed to save review');
      } finally {
        setSavingReview(false);
      }
    },
    [replaceExample, selectedDatasetId, selectedExampleId]
  );

  return {
    datasets,
    datasetsLoading,
    datasetsError,
    datasetSelection,
    selectedDataset,
    selectedDatasetId,
    examples,
    examplesLoading,
    examplesError,
    exampleSelection,
    selectedExample,
    selectedExampleId,
    exampleDetailLoading,
    exampleDetailError,
    savingExpectedOutput,
    savingReview,
    mutationError,
    selectDataset,
    selectExample,
    saveExpectedOutput,
    saveReview,
    refresh: () => setRefreshVersion((current) => current + 1)
  };
}
