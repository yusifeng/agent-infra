// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  captureDatasetExampleFromRunResponse: vi.fn(),
  createDatasetResponse: vi.fn(),
  fetchDatasetsResponse: vi.fn()
}));

vi.mock('@/features/durable-chat/repo/chat-api', () => ({
  captureDatasetExampleFromRunResponse: api.captureDatasetExampleFromRunResponse,
  createDatasetResponse: api.createDatasetResponse,
  fetchDatasetsResponse: api.fetchDatasetsResponse
}));

import { DatasetCaptureDialog } from './dataset-capture-dialog';

function run() {
  return {
    id: 'run-1',
    threadId: 'thread-1',
    triggerMessageId: 'message-1',
    provider: 'openai',
    model: 'gpt-test',
    status: 'completed' as const,
    usage: null,
    error: null,
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:01.000Z',
    createdAt: '2026-01-01T00:00:00.000Z'
  };
}

function thread() {
  return {
    id: 'thread-1',
    appId: 'playground-runtime-pi',
    userId: null,
    title: 'Demo thread',
    status: 'active' as const,
    metadata: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null
  };
}

function dataset(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dataset-1',
    appId: 'playground-runtime-pi',
    name: 'Regression',
    description: null,
    visibility: 'private' as const,
    metadata: null,
    createdByActorId: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function example(overrides: Record<string, unknown> = {}) {
  return {
    id: 'example-1',
    datasetId: 'dataset-1',
    sourceRunId: 'run-1',
    sourceThreadId: 'thread-1',
    triggerMessageId: 'message-1',
    inputJson: {},
    baselineOutputJson: null,
    expectedOutputJson: null,
    metadataJson: null,
    contextSnapshotJson: null,
    toolInvocationsSnapshotJson: null,
    createdByActorId: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('DatasetCaptureDialog', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    api.captureDatasetExampleFromRunResponse.mockReset();
    api.createDatasetResponse.mockReset();
    api.fetchDatasetsResponse.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = '';
  });

  it('loads datasets and captures the selected run into an existing dataset', async () => {
    api.fetchDatasetsResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { datasets: [dataset()] }
    });
    api.captureDatasetExampleFromRunResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { dataset: dataset(), example: example() }
    });

    await act(async () => {
      root.render(<DatasetCaptureDialog open selectedRun={run()} selectedThread={thread()} onOpenChange={vi.fn()} />);
    });
    await flush();

    const captureButton = [...document.body.querySelectorAll('button')].find((button) => button.textContent === 'Capture');
    expect(captureButton).toBeTruthy();

    await act(async () => {
      captureButton?.click();
    });
    await flush();

    expect(api.captureDatasetExampleFromRunResponse).toHaveBeenCalledWith('dataset-1', { sourceRunId: 'run-1' });
    expect(document.body.textContent).toContain('Captured example');
  });

  it('creates a private dataset before capture when no dataset exists', async () => {
    api.fetchDatasetsResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { datasets: [] }
    });
    api.createDatasetResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { dataset: dataset() }
    });
    api.captureDatasetExampleFromRunResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { dataset: dataset(), example: example() }
    });

    await act(async () => {
      root.render(<DatasetCaptureDialog open selectedRun={run()} selectedThread={thread()} onOpenChange={vi.fn()} />);
    });
    await flush();

    const input = document.body.querySelector('input');
    expect(input).toBeTruthy();
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(input, '  Captures  ');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      input!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const captureButton = [...document.body.querySelectorAll('button')].find((button) => button.textContent === 'Capture');
    await act(async () => {
      captureButton?.click();
    });
    await flush();

    expect(api.createDatasetResponse).toHaveBeenCalledWith({
      name: 'Captures',
      visibility: 'private'
    });
    expect(api.captureDatasetExampleFromRunResponse).toHaveBeenCalledWith('dataset-1', { sourceRunId: 'run-1' });
  });

  it('resets stale selected dataset ids after reopening', async () => {
    api.fetchDatasetsResponse
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        error: null,
        data: { datasets: [dataset()] }
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        error: null,
        data: { datasets: [dataset({ id: 'dataset-2', name: 'New regression' })] }
      });
    api.captureDatasetExampleFromRunResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { dataset: dataset({ id: 'dataset-2', name: 'New regression' }), example: example({ datasetId: 'dataset-2' }) }
    });

    await act(async () => {
      root.render(<DatasetCaptureDialog open selectedRun={run()} selectedThread={thread()} onOpenChange={vi.fn()} />);
    });
    await flush();

    await act(async () => {
      root.render(<DatasetCaptureDialog open={false} selectedRun={run()} selectedThread={thread()} onOpenChange={vi.fn()} />);
    });
    await flush();
    await act(async () => {
      root.render(<DatasetCaptureDialog open selectedRun={run()} selectedThread={thread()} onOpenChange={vi.fn()} />);
    });
    await flush();

    const captureButton = [...document.body.querySelectorAll('button')].find((button) => button.textContent === 'Capture');
    await act(async () => {
      captureButton?.click();
    });
    await flush();

    expect(api.captureDatasetExampleFromRunResponse).toHaveBeenCalledWith('dataset-2', { sourceRunId: 'run-1' });
  });

  it('surfaces capture errors without closing the dialog', async () => {
    api.fetchDatasetsResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { datasets: [dataset()] }
    });
    api.captureDatasetExampleFromRunResponse.mockResolvedValue({
      ok: false,
      status: 403,
      error: 'not allowed',
      data: { error: 'not allowed' }
    });

    await act(async () => {
      root.render(<DatasetCaptureDialog open selectedRun={run()} selectedThread={thread()} onOpenChange={vi.fn()} />);
    });
    await flush();

    const captureButton = [...document.body.querySelectorAll('button')].find((button) => button.textContent === 'Capture');
    await act(async () => {
      captureButton?.click();
    });
    await flush();

    expect(document.body.textContent).toContain('not allowed');
    expect(document.body.textContent).toContain('Capture Run');
  });
});
