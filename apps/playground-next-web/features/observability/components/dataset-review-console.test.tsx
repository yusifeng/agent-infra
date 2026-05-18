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

const toast = vi.hoisted(() => ({
  error: vi.fn()
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

vi.mock('sonner', () => ({
  toast
}));

vi.mock('@/components/chat-shell/markdown-renderer', () => ({
  MarkdownRenderer: ({ text, cacheKey }: { text: string; cacheKey?: string }) => (
    <div data-markdown-cache-key={cacheKey}>{text}</div>
  )
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
    inputJson: {
      schemaVersion: 1,
      kind: 'chat_turn',
      triggerMessageId: 'message-1',
      triggerMessage: {
        id: 'message-1',
        role: 'user',
        parts: [{ type: 'text', textValue: 'Browser QA smoke prompt' }]
      },
      messages: []
    },
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
    toast.error.mockReset();

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

    expect(document.body.textContent).toContain('数据集');
    expect(document.body.textContent).toContain('Regression');
    expect(document.body.textContent).toContain('来源 Run');
    expect(document.body.textContent).toContain('样本');
    expect(document.body.textContent).toContain('Browser QA smoke prompt');
    expect(document.body.textContent).toContain('输出对照');
    expect(document.body.textContent).toContain('原始 Run 回复');
    expect(document.body.textContent).toContain('baseline');
    expect(document.body.textContent).toContain('期望助手回复');
    expect(document.body.textContent).toContain('常规样本');
    expect(document.body.textContent).toContain('run-1');
    expect(document.body.textContent).toContain('工具调用');
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

    const saveButton = [...document.body.querySelectorAll('button')].find((button) => button.textContent === '保存');
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
    const applyButton = [...document.body.querySelectorAll('button')].find((button) => button.textContent === '应用');
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

  it('shows mutation errors as toast notifications instead of inline page errors', async () => {
    api.updateDatasetExampleReviewResponse.mockResolvedValue({
      ok: false,
      status: 400,
      error: 'approved examples require valid expected output',
      data: {}
    });

    await act(async () => {
      root.render(<DatasetReviewConsole currentUser={{ id: 'user-1', email: 'user@example.com' }} />);
    });
    await flush();
    await flush();

    const applyButton = [...document.body.querySelectorAll('button')].find((button) => button.textContent === '应用');
    await act(async () => {
      applyButton?.click();
    });
    await flush();

    expect(toast.error).toHaveBeenCalledWith('保存失败', {
      description: 'approved examples require valid expected output'
    });
    expect(document.body.textContent).not.toContain('approved examples require valid expected output');
  });

  it('renders baseline assistant text through the shared markdown renderer', async () => {
    const markdownExample = example({
      baselineOutputJson: {
        schemaVersion: 1,
        kind: 'run_output',
        assistantMessages: [
          {
            id: 'assistant-1',
            parts: [{ type: 'text', textValue: '**核心结论：** 可以做到。' }]
          }
        ]
      }
    });
    api.fetchDatasetExamplesResponse.mockResolvedValueOnce({
      ok: true,
      status: 200,
      error: null,
      data: { examples: [markdownExample] }
    });
    api.fetchDatasetExampleResponse.mockResolvedValueOnce({
      ok: true,
      status: 200,
      error: null,
      data: { example: markdownExample }
    });

    await act(async () => {
      root.render(<DatasetReviewConsole currentUser={{ id: 'user-1', email: 'user@example.com' }} />);
    });
    await flush();
    await flush();

    const renderedMarkdown = document.body.querySelector('[data-markdown-cache-key="dataset-baseline:example-1:0"]');
    expect(renderedMarkdown?.textContent).toBe('**核心结论：** 可以做到。');
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

    expect(document.body.textContent).toContain('来源 Run 不可用');
    expect(document.body.textContent).toContain('来源 Run');
    expect(document.body.textContent).toContain('输入');
    expect(document.body.textContent).toContain('原始 Run 回复 JSON');
  });
});
