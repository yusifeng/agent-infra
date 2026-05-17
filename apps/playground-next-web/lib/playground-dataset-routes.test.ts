import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const user = { id: 'user-1', email: 'user@example.com' };

function now() {
  return new Date('2026-01-01T00:00:00.000Z');
}

function createDataset(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dataset-1',
    appId: 'playground-runtime-pi',
    name: 'Regression',
    description: null,
    visibility: 'private' as const,
    metadata: null,
    createdByActorId: 'user-1',
    createdAt: now(),
    updatedAt: now(),
    ...overrides
  };
}

function createExample(overrides: Record<string, unknown> = {}) {
  return {
    id: 'example-1',
    datasetId: 'dataset-1',
    sourceRunId: 'run-1',
    sourceThreadId: 'thread-1',
    triggerMessageId: 'message-1',
    inputJson: { schemaVersion: 1, kind: 'chat_turn' },
    baselineOutputJson: { schemaVersion: 1, kind: 'run_output' },
    expectedOutputJson: null,
    metadataJson: null,
    contextSnapshotJson: null,
    toolInvocationsSnapshotJson: null,
    createdByActorId: 'user-1',
    createdAt: now(),
    updatedAt: now(),
    ...overrides
  };
}

function mockThreadAccess(overrides: { loadAccessibleRun?: ReturnType<typeof vi.fn>; requirePlaygroundUser?: ReturnType<typeof vi.fn> } = {}) {
  const requirePlaygroundUser = overrides.requirePlaygroundUser ?? vi.fn().mockResolvedValue({ user, response: null });
  const loadAccessibleRun = overrides.loadAccessibleRun ?? vi.fn().mockResolvedValue({ run: { id: 'run-1', threadId: 'thread-1' } });

  vi.doMock('@/lib/playground-thread-access', () => ({
    loadAccessibleRun,
    requirePlaygroundUser
  }));

  return {
    loadAccessibleRun,
    requirePlaygroundUser
  };
}

function mockAppServices() {
  const dataset = createDataset();
  const example = createExample();
  const list = vi.fn().mockResolvedValue([dataset]);
  const create = vi.fn().mockResolvedValue(dataset);
  const listExamples = vi.fn().mockResolvedValue([example]);
  const getExample = vi.fn().mockResolvedValue(example);
  const captureExampleFromRun = vi.fn().mockResolvedValue({ dataset, example });
  const updateExampleExpectedOutput = vi.fn().mockResolvedValue(
    createExample({ expectedOutputJson: { schemaVersion: 1, kind: 'assistant_text', text: 'Expected answer' } })
  );
  const updateExampleReview = vi.fn().mockResolvedValue(
    createExample({
      metadataJson: {
        capture: { kind: 'normal_example' },
        review: {
          status: 'approved',
          evalEligibility: 'default',
          exclusionReason: null,
          reviewerNote: 'Looks good',
          reviewedByActorId: 'user-1',
          reviewedAt: '2026-01-01T00:00:00.000Z'
        }
      }
    })
  );
  const listByRunIds = vi.fn().mockResolvedValue([
    {
      id: 'feedback-1',
      threadId: 'thread-1',
      triggerMessageId: 'message-1',
      runId: 'run-1',
      feedbackActorId: 'user-1',
      value: 'thumbs_down',
      createdAt: now(),
      updatedAt: now()
    }
  ]);
  const services = {
    dbConfig: { mode: 'sqlite', db: {} },
    repos: {
      runFeedbackRepo: {
        listByRunIds
      }
    },
    app: {
      datasets: {
        captureExampleFromRun,
        create,
        getExample,
        list,
        listExamples,
        updateExampleExpectedOutput,
        updateExampleReview
      }
    }
  };
  const getPlaygroundAppServices = vi.fn().mockResolvedValue(services);

  vi.doMock('@/lib/playground-app-services', () => ({
    getPlaygroundAppServices
  }));

  return {
    captureExampleFromRun,
    create,
    dataset,
    example,
    getExample,
    getPlaygroundAppServices,
    list,
    listByRunIds,
    listExamples,
    services,
    updateExampleExpectedOutput,
    updateExampleReview
  };
}

function mockFeedbackDetailsRepo() {
  const findByRunAndActor = vi.fn().mockResolvedValue({
    details: {
      reasonTags: ['not_helpful'],
      commentText: 'Needs a source.'
    }
  });
  const PlaygroundRunFeedbackDetailsRepo = vi.fn().mockImplementation(() => ({
    findByRunAndActor
  }));

  vi.doMock('@/features/run-feedback/repo/playground-run-feedback-details-repo', () => ({
    PlaygroundRunFeedbackDetailsRepo
  }));

  return {
    findByRunAndActor,
    PlaygroundRunFeedbackDetailsRepo
  };
}

describe('playground dataset routes', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('@/lib/playground-app-services');
    vi.doUnmock('@/lib/playground-thread-access');
    vi.doUnmock('@/features/run-feedback/repo/playground-run-feedback-details-repo');
    vi.resetModules();
  });

  it('lists and creates datasets through the app boundary', async () => {
    mockThreadAccess();
    const { create, list } = mockAppServices();
    const datasetsRoute = await import('../app/api/datasets/route');

    const listResponse = await datasetsRoute.GET(new Request('http://localhost/api/datasets'));
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      datasets: [{ id: 'dataset-1', createdByActorId: 'user-1' }]
    });
    expect(list).toHaveBeenCalledWith({
      appId: 'playground-runtime-pi',
      actorId: 'user-1'
    });

    const createResponse = await datasetsRoute.POST(new Request('http://localhost/api/datasets', {
      method: 'POST',
      body: JSON.stringify({ name: '  Regression  ', visibility: 'private', metadata: { source: 'manual' } })
    }));
    expect(createResponse.status).toBe(200);
    await expect(createResponse.json()).resolves.toMatchObject({
      dataset: { id: 'dataset-1', name: 'Regression' }
    });
    expect(create).toHaveBeenCalledWith({
      appId: 'playground-runtime-pi',
      name: 'Regression',
      description: undefined,
      visibility: 'private',
      metadata: { source: 'manual' },
      createdByActorId: 'user-1'
    });
  });

  it('lists dataset examples and patches expected output through the app boundary', async () => {
    mockThreadAccess();
    const { listExamples, updateExampleExpectedOutput } = mockAppServices();
    const examplesRoute = await import('../app/api/datasets/[datasetId]/examples/route');
    const expectedOutputRoute = await import('../app/api/datasets/[datasetId]/examples/[exampleId]/expected-output/route');

    const listResponse = await examplesRoute.GET(new Request('http://localhost/api/datasets/dataset-1/examples'), {
      params: Promise.resolve({ datasetId: 'dataset-1' })
    });
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      examples: [{ id: 'example-1', sourceRunId: 'run-1' }]
    });
    expect(listExamples).toHaveBeenCalledWith({
      appId: 'playground-runtime-pi',
      datasetId: 'dataset-1',
      actorId: 'user-1'
    });

    const patchResponse = await expectedOutputRoute.PATCH(new Request('http://localhost/api/datasets/dataset-1/examples/example-1/expected-output', {
      method: 'PATCH',
      body: JSON.stringify({ expectedOutputJson: { schemaVersion: 1, kind: 'assistant_text', text: ' Expected answer ' } })
    }), {
      params: Promise.resolve({ datasetId: 'dataset-1', exampleId: 'example-1' })
    });
    expect(patchResponse.status).toBe(200);
    await expect(patchResponse.json()).resolves.toMatchObject({
      example: { id: 'example-1', expectedOutputJson: { schemaVersion: 1, kind: 'assistant_text', text: 'Expected answer' } }
    });
    expect(updateExampleExpectedOutput).toHaveBeenCalledWith({
      appId: 'playground-runtime-pi',
      datasetId: 'dataset-1',
      exampleId: 'example-1',
      actorId: 'user-1',
      expectedOutputJson: { schemaVersion: 1, kind: 'assistant_text', text: 'Expected answer', notes: null }
    });

    const invalidPatchResponse = await expectedOutputRoute.PATCH(new Request('http://localhost/api/datasets/dataset-1/examples/example-1/expected-output', {
      method: 'PATCH',
      body: JSON.stringify({ expectedOutputJson: null, metadataJson: null })
    }), {
      params: Promise.resolve({ datasetId: 'dataset-1', exampleId: 'example-1' })
    });
    expect(invalidPatchResponse.status).toBe(400);
    expect(updateExampleExpectedOutput).toHaveBeenCalledTimes(1);
  });

  it('loads dataset example detail without source-run access', async () => {
    const { loadAccessibleRun } = mockThreadAccess({
      loadAccessibleRun: vi.fn().mockRejectedValue(new Error('source unavailable'))
    });
    const { getExample } = mockAppServices();
    const detailRoute = await import('../app/api/datasets/[datasetId]/examples/[exampleId]/route');

    const response = await detailRoute.GET(new Request('http://localhost/api/datasets/dataset-1/examples/example-1'), {
      params: Promise.resolve({ datasetId: 'dataset-1', exampleId: 'example-1' })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      example: { id: 'example-1', sourceRunId: 'run-1' }
    });
    expect(getExample).toHaveBeenCalledWith({
      appId: 'playground-runtime-pi',
      datasetId: 'dataset-1',
      exampleId: 'example-1',
      actorId: 'user-1'
    });
    expect(loadAccessibleRun).not.toHaveBeenCalled();
  });

  it('maps dataset example detail access failures without source-run lookup', async () => {
    const { loadAccessibleRun } = mockThreadAccess();
    const { getExample } = mockAppServices();
    getExample.mockRejectedValueOnce(new Error('dataset unavailable'));
    const detailRoute = await import('../app/api/datasets/[datasetId]/examples/[exampleId]/route');

    const response = await detailRoute.GET(new Request('http://localhost/api/datasets/dataset-1/examples/example-1'), {
      params: Promise.resolve({ datasetId: 'dataset-1', exampleId: 'example-1' })
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'dataset unavailable' });
    expect(loadAccessibleRun).not.toHaveBeenCalled();
  });

  it('patches dataset example review through the app boundary', async () => {
    mockThreadAccess();
    const { updateExampleReview } = mockAppServices();
    const reviewRoute = await import('../app/api/datasets/[datasetId]/examples/[exampleId]/review/route');

    const response = await reviewRoute.PATCH(new Request('http://localhost/api/datasets/dataset-1/examples/example-1/review', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved', evalEligibility: 'default', reviewerNote: ' Looks good ' })
    }), {
      params: Promise.resolve({ datasetId: 'dataset-1', exampleId: 'example-1' })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      example: {
        id: 'example-1',
        metadataJson: {
          review: {
            status: 'approved',
            reviewerNote: 'Looks good',
            reviewedByActorId: 'user-1'
          }
        }
      }
    });
    expect(updateExampleReview).toHaveBeenCalledWith({
      appId: 'playground-runtime-pi',
      datasetId: 'dataset-1',
      exampleId: 'example-1',
      actorId: 'user-1',
      review: { status: 'approved', evalEligibility: 'default', reviewerNote: 'Looks good' }
    });

    const spoofResponse = await reviewRoute.PATCH(new Request('http://localhost/api/datasets/dataset-1/examples/example-1/review', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved', reviewedByActorId: 'attacker' })
    }), {
      params: Promise.resolve({ datasetId: 'dataset-1', exampleId: 'example-1' })
    });
    expect(spoofResponse.status).toBe(400);
    expect(updateExampleReview).toHaveBeenCalledTimes(1);
  });

  it('captures accessible runs and copies feedback snapshots into metadata', async () => {
    const { loadAccessibleRun } = mockThreadAccess();
    const { captureExampleFromRun, listByRunIds } = mockAppServices();
    const { findByRunAndActor } = mockFeedbackDetailsRepo();
    const captureRoute = await import('../app/api/datasets/[datasetId]/examples/capture-run/route');

    const response = await captureRoute.POST(new Request('http://localhost/api/datasets/dataset-1/examples/capture-run', {
      method: 'POST',
      body: JSON.stringify({
        sourceRunId: 'run-1',
        metadataJson: {
          host: {
            note: 'caller'
          }
        }
      })
    }), {
      params: Promise.resolve({ datasetId: 'dataset-1' })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      dataset: { id: 'dataset-1' },
      example: { id: 'example-1' }
    });
    expect(loadAccessibleRun).toHaveBeenCalledWith(expect.anything(), 'run-1', 'user-1');
    expect(listByRunIds).toHaveBeenCalledWith(['run-1'], 'user-1');
    expect(findByRunAndActor).toHaveBeenCalledWith('run-1', 'user-1');
    expect(captureExampleFromRun).toHaveBeenCalledWith(expect.objectContaining({
      appId: 'playground-runtime-pi',
      datasetId: 'dataset-1',
      sourceRunId: 'run-1',
      actorId: 'user-1',
      capturedByActorId: 'user-1',
      metadataJson: expect.objectContaining({
        feedback: {
          sharedRunFeedback: expect.objectContaining({
            runId: 'run-1',
            feedbackActorId: 'user-1',
            value: 'thumbs_down'
          })
        },
        host: {
          note: 'caller',
          playground: {
            runFeedbackDetails: {
              reasonTags: ['not_helpful'],
              commentText: 'Needs a source.'
            }
          }
        }
      })
    }));
  });

  it('does not capture when source run access fails', async () => {
    mockThreadAccess({
      loadAccessibleRun: vi.fn().mockRejectedValue(new Error('not authorized'))
    });
    const { captureExampleFromRun } = mockAppServices();
    mockFeedbackDetailsRepo();
    const captureRoute = await import('../app/api/datasets/[datasetId]/examples/capture-run/route');

    const response = await captureRoute.POST(new Request('http://localhost/api/datasets/dataset-1/examples/capture-run', {
      method: 'POST',
      body: JSON.stringify({ sourceRunId: 'run-1' })
    }), {
      params: Promise.resolve({ datasetId: 'dataset-1' })
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'not authorized' });
    expect(captureExampleFromRun).not.toHaveBeenCalled();
  });

  it('short-circuits unauthenticated dataset requests', async () => {
    mockThreadAccess({
      requirePlaygroundUser: vi.fn().mockImplementation(async () => ({
        user: null,
        response: Response.json({ error: 'UNAUTHORIZED' }, { status: 401 })
      }))
    });
    const { getPlaygroundAppServices } = mockAppServices();
    const datasetsRoute = await import('../app/api/datasets/route');
    const detailRoute = await import('../app/api/datasets/[datasetId]/examples/[exampleId]/route');

    const response = await datasetsRoute.GET(new Request('http://localhost/api/datasets'));
    const detailResponse = await detailRoute.GET(new Request('http://localhost/api/datasets/dataset-1/examples/example-1'), {
      params: Promise.resolve({ datasetId: 'dataset-1', exampleId: 'example-1' })
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'UNAUTHORIZED' });
    expect(detailResponse.status).toBe(401);
    await expect(detailResponse.json()).resolves.toEqual({ error: 'UNAUTHORIZED' });
    expect(getPlaygroundAppServices).not.toHaveBeenCalled();
  });
});
