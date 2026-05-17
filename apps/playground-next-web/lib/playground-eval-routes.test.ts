import { RuntimeUnavailableError } from '@agent-infra/app';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const user = { id: 'user-1', email: 'user@example.com' };

function now() {
  return new Date('2026-01-01T00:00:00.000Z');
}

function createEvalRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'eval-run-1',
    appId: 'playground-runtime-pi',
    datasetId: 'dataset-1',
    status: 'queued' as const,
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
    createdByActorId: 'user-1',
    startedAt: null,
    finishedAt: null,
    createdAt: now(),
    updatedAt: now(),
    ...overrides
  };
}

function createEvalResult(overrides: Record<string, unknown> = {}) {
  return {
    id: 'result-1',
    evalRunId: 'eval-run-1',
    datasetExampleId: 'example-1',
    exampleOrdinal: 1,
    status: 'queued' as const,
    evalThreadId: null,
    outputRunId: null,
    expectedOutputJson: { schemaVersion: 1, kind: 'assistant_text', text: 'Expected answer' },
    actualOutputJson: null,
    inputJson: { schemaVersion: 1, kind: 'chat_turn' },
    usageJson: null,
    metadataJson: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: now(),
    updatedAt: now(),
    ...overrides
  };
}

function mockThreadAccess(overrides: { requirePlaygroundUser?: ReturnType<typeof vi.fn>; loadAccessibleRun?: ReturnType<typeof vi.fn> } = {}) {
  const requirePlaygroundUser = overrides.requirePlaygroundUser ?? vi.fn().mockResolvedValue({ user, response: null });
  const loadAccessibleRun = overrides.loadAccessibleRun ?? vi.fn().mockRejectedValue(new Error('source unavailable'));

  vi.doMock('@/lib/playground-thread-access', () => ({
    loadAccessibleRun,
    requirePlaygroundUser
  }));

  return {
    loadAccessibleRun,
    requirePlaygroundUser
  };
}

function mockEvalAppServices() {
  const evalRun = createEvalRun();
  const completedEvalRun = createEvalRun({ status: 'completed', finishedAt: now() });
  const result = createEvalResult();
  const reviewedResult = createEvalResult({
    metadataJson: {
      review: {
        status: 'pass',
        reviewerNote: 'ok',
        reviewedByActorId: 'user-1',
        reviewedAt: '2026-01-01T00:00:00.000Z'
      }
    }
  });
  const create = vi.fn().mockResolvedValue(evalRun);
  const get = vi.fn().mockResolvedValue(evalRun);
  const listByDataset = vi.fn().mockResolvedValue([evalRun]);
  const listResults = vi.fn().mockResolvedValue([result]);
  const run = vi.fn().mockResolvedValue(completedEvalRun);
  const updateResultReview = vi.fn().mockResolvedValue(reviewedResult);
  const services = {
    app: {
      evals: {
        create,
        get,
        listByDataset,
        listResults,
        run,
        updateResultReview
      }
    }
  };
  const getPlaygroundAppServices = vi.fn().mockResolvedValue(services);
  const getPlaygroundRuntimeServices = vi.fn().mockResolvedValue(services);

  vi.doMock('@/lib/playground-app-services', () => ({
    getPlaygroundAppServices
  }));
  vi.doMock('@/lib/playground-services', () => ({
    getPlaygroundRuntimeServices
  }));

  return {
    create,
    get,
    getPlaygroundAppServices,
    getPlaygroundRuntimeServices,
    listByDataset,
    listResults,
    run,
    updateResultReview
  };
}

describe('playground eval routes', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@/lib/playground-app-services');
    vi.doUnmock('@/lib/playground-services');
    vi.doUnmock('@/lib/playground-thread-access');
    vi.resetModules();
  });

  it('creates and lists eval runs through the app boundary', async () => {
    mockThreadAccess();
    const { create, listByDataset } = mockEvalAppServices();
    const route = await import('../app/api/datasets/[datasetId]/eval-runs/route');

    const listResponse = await route.GET(new Request('http://localhost/api/datasets/dataset-1/eval-runs'), {
      params: Promise.resolve({ datasetId: 'dataset-1' })
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      evalRuns: [{ id: 'eval-run-1', datasetId: 'dataset-1' }]
    });
    expect(listByDataset).toHaveBeenCalledWith({
      appId: 'playground-runtime-pi',
      datasetId: 'dataset-1',
      actorId: 'user-1'
    });

    const createResponse = await route.POST(new Request('http://localhost/api/datasets/dataset-1/eval-runs', {
      method: 'POST',
      body: JSON.stringify({
        name: ' nightly ',
        provider: ' openai ',
        model: ' gpt-4o-mini ',
        runtimeOptions: { webSearchEnabled: true }
      })
    }), {
      params: Promise.resolve({ datasetId: 'dataset-1' })
    });
    expect(createResponse.status).toBe(200);
    await expect(createResponse.json()).resolves.toMatchObject({
      evalRun: { id: 'eval-run-1', status: 'queued' }
    });
    expect(create).toHaveBeenCalledWith({
      appId: 'playground-runtime-pi',
      datasetId: 'dataset-1',
      actorId: 'user-1',
      createdByActorId: 'user-1',
      name: 'nightly',
      provider: 'openai',
      model: 'gpt-4o-mini',
      runtimeOptions: { webSearchEnabled: true }
    });
  });

  it('loads eval run detail and results without source-run access', async () => {
    const { loadAccessibleRun } = mockThreadAccess();
    const { get, listResults } = mockEvalAppServices();
    const detailRoute = await import('../app/api/eval-runs/[evalRunId]/route');
    const resultsRoute = await import('../app/api/eval-runs/[evalRunId]/results/route');

    const detailResponse = await detailRoute.GET(new Request('http://localhost/api/eval-runs/eval-run-1'), {
      params: Promise.resolve({ evalRunId: 'eval-run-1' })
    });
    const resultsResponse = await resultsRoute.GET(new Request('http://localhost/api/eval-runs/eval-run-1/results'), {
      params: Promise.resolve({ evalRunId: 'eval-run-1' })
    });

    expect(detailResponse.status).toBe(200);
    expect(resultsResponse.status).toBe(200);
    await expect(detailResponse.json()).resolves.toMatchObject({ evalRun: { id: 'eval-run-1' } });
    await expect(resultsResponse.json()).resolves.toMatchObject({ results: [{ id: 'result-1' }] });
    expect(get).toHaveBeenCalledWith({
      appId: 'playground-runtime-pi',
      evalRunId: 'eval-run-1',
      actorId: 'user-1'
    });
    expect(listResults).toHaveBeenCalledWith({
      appId: 'playground-runtime-pi',
      evalRunId: 'eval-run-1',
      actorId: 'user-1'
    });
    expect(loadAccessibleRun).not.toHaveBeenCalled();
  });

  it('executes eval runs only through configured runtime services', async () => {
    mockThreadAccess();
    const { getPlaygroundAppServices, getPlaygroundRuntimeServices, run } = mockEvalAppServices();
    const route = await import('../app/api/eval-runs/[evalRunId]/run/route');

    const response = await route.POST(new Request('http://localhost/api/eval-runs/eval-run-1/run', { method: 'POST' }), {
      params: Promise.resolve({ evalRunId: 'eval-run-1' })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      evalRun: { id: 'eval-run-1', status: 'completed' }
    });
    expect(getPlaygroundRuntimeServices).toHaveBeenCalledTimes(1);
    expect(getPlaygroundAppServices).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith({
      appId: 'playground-runtime-pi',
      evalRunId: 'eval-run-1',
      actorId: 'user-1'
    });
  });

  it('returns configured runtime errors from eval execution route', async () => {
    mockThreadAccess();
    const getPlaygroundRuntimeServices = vi.fn().mockRejectedValue(
      new RuntimeUnavailableError('runtime execution is not configured')
    );
    vi.doMock('@/lib/playground-app-services', () => ({
      getPlaygroundAppServices: vi.fn()
    }));
    vi.doMock('@/lib/playground-services', () => ({
      getPlaygroundRuntimeServices
    }));
    const route = await import('../app/api/eval-runs/[evalRunId]/run/route');

    const response = await route.POST(new Request('http://localhost/api/eval-runs/eval-run-1/run', { method: 'POST' }), {
      params: Promise.resolve({ evalRunId: 'eval-run-1' })
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'runtime execution is not configured' });
  });

  it('patches eval result review through the app boundary without caller assigned review fields', async () => {
    mockThreadAccess();
    const { updateResultReview } = mockEvalAppServices();
    const route = await import('../app/api/eval-runs/[evalRunId]/results/[resultId]/review/route');

    const response = await route.PATCH(new Request('http://localhost/api/eval-runs/eval-run-1/results/result-1/review', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'pass', reviewerNote: ' ok ' })
    }), {
      params: Promise.resolve({ evalRunId: 'eval-run-1', resultId: 'result-1' })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: {
        id: 'result-1',
        review: {
          status: 'pass',
          reviewerNote: 'ok',
          reviewedByActorId: 'user-1'
        }
      }
    });
    expect(updateResultReview).toHaveBeenCalledWith({
      appId: 'playground-runtime-pi',
      evalRunId: 'eval-run-1',
      resultId: 'result-1',
      actorId: 'user-1',
      review: { status: 'pass', reviewerNote: 'ok' }
    });

    const spoofResponse = await route.PATCH(new Request('http://localhost/api/eval-runs/eval-run-1/results/result-1/review', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'pass', reviewedByActorId: 'attacker' })
    }), {
      params: Promise.resolve({ evalRunId: 'eval-run-1', resultId: 'result-1' })
    });
    expect(spoofResponse.status).toBe(400);
    expect(updateResultReview).toHaveBeenCalledTimes(1);
  });

  it('passes eval run id and result id to app use case for cross-run review protection', async () => {
    mockThreadAccess();
    const { updateResultReview } = mockEvalAppServices();
    updateResultReview.mockRejectedValueOnce(new Error('eval example result result-other not found'));
    const route = await import('../app/api/eval-runs/[evalRunId]/results/[resultId]/review/route');

    const response = await route.PATCH(new Request('http://localhost/api/eval-runs/eval-run-1/results/result-other/review', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'fail' })
    }), {
      params: Promise.resolve({ evalRunId: 'eval-run-1', resultId: 'result-other' })
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'eval example result result-other not found' });
    expect(updateResultReview).toHaveBeenCalledWith({
      appId: 'playground-runtime-pi',
      evalRunId: 'eval-run-1',
      resultId: 'result-other',
      actorId: 'user-1',
      review: { status: 'fail' }
    });
  });

  it('short-circuits unauthenticated eval requests before loading services', async () => {
    mockThreadAccess({
      requirePlaygroundUser: vi.fn().mockResolvedValue({
        response: Response.json({ error: 'UNAUTHORIZED' }, { status: 401 })
      })
    });
    const { getPlaygroundAppServices, getPlaygroundRuntimeServices } = mockEvalAppServices();
    const listRoute = await import('../app/api/datasets/[datasetId]/eval-runs/route');
    const runRoute = await import('../app/api/eval-runs/[evalRunId]/run/route');

    const listResponse = await listRoute.GET(new Request('http://localhost/api/datasets/dataset-1/eval-runs'), {
      params: Promise.resolve({ datasetId: 'dataset-1' })
    });
    const runResponse = await runRoute.POST(new Request('http://localhost/api/eval-runs/eval-run-1/run', { method: 'POST' }), {
      params: Promise.resolve({ evalRunId: 'eval-run-1' })
    });

    expect(listResponse.status).toBe(401);
    expect(runResponse.status).toBe(401);
    expect(getPlaygroundAppServices).not.toHaveBeenCalled();
    expect(getPlaygroundRuntimeServices).not.toHaveBeenCalled();
  });
});
