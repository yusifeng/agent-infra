// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn()
}));

const api = vi.hoisted(() => ({
  fetchDatasetExampleResponse: vi.fn(),
  fetchDatasetExamplesResponse: vi.fn(),
  fetchDatasetsResponse: vi.fn(),
  updateDatasetExampleExpectedOutputResponse: vi.fn(),
  updateDatasetExampleReviewResponse: vi.fn()
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/observability/datasets',
  useRouter: () => ({
    push: navigation.push,
    replace: navigation.replace
  }),
  useSearchParams: () => new URLSearchParams()
}));

vi.mock('@/components/chat-shell/use-playground-logout', () => ({
  usePlaygroundLogout: () => vi.fn()
}));

vi.mock('@/features/durable-chat/repo/chat-api', () => ({
  fetchDatasetExampleResponse: api.fetchDatasetExampleResponse,
  fetchDatasetExamplesResponse: api.fetchDatasetExamplesResponse,
  fetchDatasetsResponse: api.fetchDatasetsResponse,
  updateDatasetExampleExpectedOutputResponse: api.updateDatasetExampleExpectedOutputResponse,
  updateDatasetExampleReviewResponse: api.updateDatasetExampleReviewResponse
}));

import { DatasetReviewConsole } from './dataset-review-console';

function dataset() {
  return {
    id: 'dataset-1',
    appId: 'playground-runtime-pi',
    name: 'Regression',
    description: null,
    visibility: 'private' as const,
    metadata: null,
    createdByActorId: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
}

function example(overrides: Record<string, unknown> = {}) {
  return {
    id: 'example-1',
    datasetId: 'dataset-1',
    sourceRunId: 'run-1',
    sourceThreadId: 'thread-1',
    triggerMessageId: 'message-1',
    inputJson: { schemaVersion: 1, kind: 'chat_turn' },
    baselineOutputJson: { text: 'baseline' },
    expectedOutputJson: null,
    expectedOutput: { state: 'missing' as const, expectedOutput: null },
    metadataJson: { capture: { kind: 'normal_example' } },
    review: {
      status: 'unreviewed' as const,
      evalEligibility: 'default' as const,
      exclusionReason: null,
      reviewerNote: null,
      reviewedByActorId: null,
      reviewedAt: null
    },
    effectiveEligibility: { eligible: false, reason: 'ineligible_unreviewed' as const },
    contextSnapshotJson: { status: 'completed' },
    toolInvocationsSnapshotJson: { toolInvocations: [] },
    createdByActorId: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('DatasetReviewConsole', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    navigation.push.mockReset();
    navigation.replace.mockReset();
    api.fetchDatasetExampleResponse.mockReset();
    api.fetchDatasetExamplesResponse.mockReset();
    api.fetchDatasetsResponse.mockReset();
    api.updateDatasetExampleExpectedOutputResponse.mockReset();
    api.updateDatasetExampleReviewResponse.mockReset();

    api.fetchDatasetsResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { datasets: [dataset()] }
    });
    api.fetchDatasetExamplesResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { examples: [example()] }
    });
    api.fetchDatasetExampleResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { example: example() }
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = '';
  });

  it('loads datasets, examples, and the selected example detail independently of run query state', async () => {
    await act(async () => {
      root.render(<DatasetReviewConsole currentUser={{ id: 'user-1', email: 'user@example.com' }} />);
    });
    await flush();
    await flush();

    expect(document.body.textContent).toContain('Datasets');
    expect(document.body.textContent).toContain('Regression');
    expect(document.body.textContent).toContain('Source Run');
    expect(document.body.textContent).toContain('Example');
    expect(document.body.textContent).toContain('normal_example');
    expect(document.body.textContent).toContain('run run-1');
    expect(document.body.textContent).toContain('thread thread-1');
    expect(document.body.textContent).toContain('Tool Snapshot');
    expect(api.fetchDatasetExamplesResponse).toHaveBeenCalledWith('dataset-1', expect.any(AbortSignal));
    expect(api.fetchDatasetExampleResponse).toHaveBeenCalledWith('dataset-1', 'example-1', expect.any(AbortSignal));
    expect(navigation.replace).toHaveBeenCalledWith('/observability/datasets?datasetId=dataset-1&exampleId=example-1', { scroll: false });
  });

  it('saves expected output and review without caller-assigned review fields', async () => {
    api.updateDatasetExampleExpectedOutputResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        example: example({
          expectedOutputJson: { schemaVersion: 1, kind: 'assistant_text', text: 'Expected answer', notes: null },
          expectedOutput: {
            state: 'valid',
            expectedOutput: { schemaVersion: 1, kind: 'assistant_text', text: 'Expected answer', notes: null }
          }
        })
      }
    });
    api.updateDatasetExampleReviewResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        example: example({
          review: {
            status: 'approved',
            evalEligibility: 'default',
            exclusionReason: null,
            reviewerNote: 'Looks good',
            reviewedByActorId: 'user-1',
            reviewedAt: '2026-01-01T00:00:00.000Z'
          }
        })
      }
    });

    await act(async () => {
      root.render(<DatasetReviewConsole currentUser={{ id: 'user-1', email: 'user@example.com' }} />);
    });
    await flush();
    await flush();

    const textareas = [...document.body.querySelectorAll('textarea')];
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    await act(async () => {
      valueSetter?.call(textareas[0], ' Expected answer ');
      textareas[0]?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const saveButton = [...document.body.querySelectorAll('button')].find((button) => button.textContent === 'Save');
    await act(async () => {
      saveButton?.click();
    });
    await flush();

    expect(api.updateDatasetExampleExpectedOutputResponse).toHaveBeenCalledWith('dataset-1', 'example-1', {
      expectedOutputJson: { schemaVersion: 1, kind: 'assistant_text', text: 'Expected answer', notes: null }
    });

    const updatedTextareas = [...document.body.querySelectorAll('textarea')];
    await act(async () => {
      valueSetter?.call(updatedTextareas[0], '   ');
      updatedTextareas[0]?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      saveButton?.click();
    });
    await flush();

    expect(api.updateDatasetExampleExpectedOutputResponse).toHaveBeenLastCalledWith('dataset-1', 'example-1', {
      expectedOutputJson: null
    });

    const statusSelect = document.body.querySelector('select');
    await act(async () => {
      statusSelect!.value = 'approved';
      statusSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const applyButton = [...document.body.querySelectorAll('button')].find((button) => button.textContent === 'Apply');
    await act(async () => {
      applyButton?.click();
    });
    await flush();

    expect(api.updateDatasetExampleReviewResponse).toHaveBeenCalledWith('dataset-1', 'example-1', {
      status: 'approved',
      evalEligibility: 'default',
      exclusionReason: null,
      reviewerNote: null
    });
  });

  it('renders source unavailable without blocking snapshot review', async () => {
    const sourceUnavailable = example({ sourceRunId: null, sourceThreadId: null });
    api.fetchDatasetExamplesResponse.mockResolvedValueOnce({
      ok: true,
      status: 200,
      error: null,
      data: { examples: [sourceUnavailable] }
    });
    api.fetchDatasetExampleResponse.mockResolvedValueOnce({
      ok: true,
      status: 200,
      error: null,
      data: { example: sourceUnavailable }
    });

    await act(async () => {
      root.render(<DatasetReviewConsole currentUser={{ id: 'user-1', email: 'user@example.com' }} />);
    });
    await flush();
    await flush();

    expect(document.body.textContent).toContain('Source unavailable');
    expect(document.body.textContent).toContain('Source Run');
    expect(document.body.textContent).toContain('Input');
    expect(document.body.textContent).toContain('Baseline Output');
  });
});
