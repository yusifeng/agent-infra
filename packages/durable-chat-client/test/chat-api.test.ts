import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createEvalRunResponse,
  fetchDatasetEvalRunsResponse,
  fetchEvalExampleResultsResponse,
  fetchEvalRunResponse,
  runEvalRunResponse,
  updateEvalExampleResultReviewResponse
} from '../src/repo/chat-api';

describe('durable-chat-client chat api helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls eval endpoints and normalizes responses', async () => {
    const evalRun = {
      id: 'eval-run-1',
      appId: 'app-1',
      datasetId: 'dataset-1',
      status: 'queued',
      name: null,
      configJson: {
        schemaVersion: 1,
        kind: 'eval_run_config',
        selection: { policy: 'effective_eligible_v1' },
        execution: { mode: 'current_runtime', strategy: 'isolated_eval_thread', concurrency: 'serial' },
        runtime: null
      },
      summaryJson: {
        schemaVersion: 1,
        kind: 'eval_run_summary',
        selection: { eligibleCount: 1, ineligibleCount: 0, ineligibleReasonCounts: {}, selectedCount: 1 },
        results: {
          statusCounts: { queued: 1, running: 0, completed: 0, failed: 0, skipped: 0 },
          reviewStatusCounts: { unreviewed: 1, pass: 0, fail: 0, needs_review: 0, not_applicable: 0 },
          aggregateUsage: null,
          durationMs: null
        }
      },
      error: null,
      createdByActorId: 'actor-1',
      startedAt: null,
      finishedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };
    const result = {
      id: 'result-1',
      evalRunId: 'eval-run-1',
      datasetExampleId: 'example-1',
      exampleOrdinal: 0,
      status: 'queued',
      evalThreadId: null,
      outputRunId: null,
      expectedOutputJson: { schemaVersion: 1, kind: 'assistant_text', text: 'Expected answer' },
      actualOutputJson: null,
      inputJson: { schemaVersion: 1, kind: 'chat_turn' },
      usageJson: null,
      metadataJson: null,
      review: { status: 'unreviewed', reviewerNote: null, reviewedByActorId: null, reviewedAt: null },
      error: null,
      startedAt: null,
      finishedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const body = url.endsWith('/results')
        ? { results: [result] }
        : url.endsWith('/eval-runs')
          ? init?.method === 'POST'
            ? { evalRun }
            : { evalRuns: [evalRun] }
          : url.endsWith('/review')
            ? { result }
            : { evalRun };

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    expect((await fetchDatasetEvalRunsResponse('dataset-1')).data.evalRuns).toHaveLength(1);
    expect((await createEvalRunResponse('dataset-1', { name: 'nightly' })).data.evalRun?.id).toBe('eval-run-1');
    expect((await runEvalRunResponse('eval-run-1')).data.evalRun?.id).toBe('eval-run-1');
    expect((await fetchEvalRunResponse('eval-run-1')).data.evalRun?.id).toBe('eval-run-1');
    expect((await fetchEvalExampleResultsResponse('eval-run-1')).data.results).toHaveLength(1);
    expect((await updateEvalExampleResultReviewResponse('eval-run-1', 'result-1', { status: 'pass' })).data.result?.id).toBe('result-1');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/datasets/dataset-1/eval-runs', { signal: undefined });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/datasets/dataset-1/eval-runs',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'nightly' })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/eval-runs/eval-run-1/run', { method: 'POST', signal: undefined });
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/eval-runs/eval-run-1', { signal: undefined });
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/eval-runs/eval-run-1/results', { signal: undefined });
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      '/api/eval-runs/eval-run-1/results/result-1/review',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'pass' })
      })
    );
  });
});
