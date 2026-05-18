// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn()
}));

const api = vi.hoisted(() => ({
  createEvalRunResponse: vi.fn(),
  fetchDatasetExampleResponse: vi.fn(),
  fetchDatasetEvalRunsResponse: vi.fn(),
  fetchDatasetsResponse: vi.fn(),
  fetchEvalExampleResultsResponse: vi.fn(),
  fetchEvalRunResponse: vi.fn(),
  fetchThreadRunsResponse: vi.fn(),
  runEvalRunResponse: vi.fn(),
  updateEvalExampleResultReviewResponse: vi.fn()
}));

const toast = vi.hoisted(() => ({
  error: vi.fn()
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/observability/evals',
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
  createEvalRunResponse: api.createEvalRunResponse,
  fetchDatasetExampleResponse: api.fetchDatasetExampleResponse,
  fetchDatasetEvalRunsResponse: api.fetchDatasetEvalRunsResponse,
  fetchDatasetsResponse: api.fetchDatasetsResponse,
  fetchEvalExampleResultsResponse: api.fetchEvalExampleResultsResponse,
  fetchEvalRunResponse: api.fetchEvalRunResponse,
  fetchThreadRunsResponse: api.fetchThreadRunsResponse,
  runEvalRunResponse: api.runEvalRunResponse,
  updateEvalExampleResultReviewResponse: api.updateEvalExampleResultReviewResponse
}));

vi.mock('sonner', () => ({
  toast
}));

import { EvalConsole } from './eval-console';

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

function evalRun(overrides: Record<string, unknown> = {}) {
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
    config: {
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
    summary: {
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function result(overrides: Record<string, unknown> = {}) {
  const actualOutput = {
    schemaVersion: 1,
    kind: 'eval_run_output',
    outputRunId: 'output-run-1',
    evalThreadId: 'eval-thread-1',
    status: 'completed',
    assistantMessages: [
      {
        id: 'assistant-1',
        threadId: 'eval-thread-1',
        runId: 'output-run-1',
        role: 'assistant',
        seq: 2,
        status: 'completed',
        metadata: null,
        createdAt: '2026-01-01T00:00:02.000Z',
        parts: [{ id: 'part-1', messageId: 'assistant-1', partIndex: 0, type: 'text', textValue: 'Actual answer', jsonValue: null, createdAt: '2026-01-01T00:00:02.000Z' }]
      }
    ]
  };

  return {
    id: 'result-1',
    evalRunId: 'eval-run-1',
    datasetExampleId: 'example-1',
    exampleOrdinal: 1,
    status: 'completed' as const,
    evalThreadId: 'eval-thread-1',
    outputRunId: 'output-run-1',
    expectedOutputJson: { schemaVersion: 1, kind: 'assistant_text', text: 'Expected answer' },
    actualOutputJson: actualOutput,
    actualOutput,
    inputJson: { schemaVersion: 1, kind: 'chat_turn' },
    usageJson: { totalTokens: 42 },
    metadataJson: null,
    review: {
      status: 'unreviewed' as const,
      reviewerNote: null,
      reviewedByActorId: null,
      reviewedAt: null
    },
    error: null,
    startedAt: '2026-01-01T00:00:01.000Z',
    finishedAt: '2026-01-01T00:00:02.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function sourceExample() {
  return {
    id: 'example-1',
    datasetId: 'dataset-1',
    sourceRunId: 'run-1',
    sourceThreadId: 'thread-1',
    triggerMessageId: 'message-1',
    inputJson: { schemaVersion: 1, kind: 'chat_turn' },
    baselineOutputJson: { schemaVersion: 1, kind: 'run_output', assistantMessages: [{ id: 'baseline-1' }] },
    expectedOutputJson: { schemaVersion: 1, kind: 'assistant_text', text: 'Expected answer' },
    metadataJson: null,
    contextSnapshotJson: null,
    toolInvocationsSnapshotJson: null,
    createdByActorId: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('EvalConsole', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    navigation.push.mockReset();
    navigation.replace.mockReset();
    for (const mock of Object.values(api)) {
      mock.mockReset();
    }
    toast.error.mockReset();

    api.fetchDatasetsResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { datasets: [dataset()] }
    });
    api.fetchDatasetEvalRunsResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { evalRuns: [evalRun()] }
    });
    api.fetchEvalExampleResultsResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { results: [result()] }
    });
    api.fetchEvalRunResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { evalRun: evalRun() }
    });
    api.fetchDatasetExampleResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { example: sourceExample() }
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = '';
  });

  it('opens eval run list and selected result detail without thread or run query state', async () => {
    await act(async () => {
      root.render(<EvalConsole currentUser={{ id: 'user-1', email: 'user@example.com' }} />);
    });
    await flush();
    await flush();

    expect(document.body.textContent).toContain('Evals');
    expect(document.body.textContent).toContain('Regression');
    expect(document.body.textContent).toContain('eval-run-1');
    expect(document.body.textContent).toContain('数据集');
    expect(document.body.textContent).toContain('评估运行 UUID');
    expect(document.body.textContent).toContain('样本 UUID');
    expect(document.body.textContent).toContain('输出 Run');
    expect(document.body.textContent).toContain('输出对照');
    expect(document.body.textContent).toContain('文本不同');
    expect(document.body.textContent).toContain('规范化文本不同');
    expect(document.body.textContent).toContain('期望回复');
    expect(document.body.textContent).toContain('Expected answer');
    expect(document.body.textContent).toContain('实际回复');
    expect(document.body.textContent).toContain('Actual answer');
    expect(document.body.textContent).toContain('期望输出');
    expect(document.body.textContent).toContain('实际输出');
    expect(document.body.textContent).toContain('原始输出');
    expect(document.body.textContent).toContain('42 tokens');
    expect(api.fetchDatasetEvalRunsResponse).toHaveBeenCalledWith('dataset-1', expect.any(AbortSignal));
    expect(api.fetchEvalExampleResultsResponse).toHaveBeenCalledWith('eval-run-1', expect.any(AbortSignal));
    expect(api.fetchDatasetExampleResponse).toHaveBeenCalledWith('dataset-1', 'example-1', expect.any(AbortSignal));
    expect(api.fetchThreadRunsResponse).not.toHaveBeenCalled();
    expect(navigation.replace).toHaveBeenCalledWith('/observability/evals?datasetId=dataset-1&evalRunId=eval-run-1&resultId=result-1', { scroll: false });
  });

  it('keeps dataset selection as eval context and updates only dataset query state', async () => {
    api.fetchDatasetsResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        datasets: [
          dataset(),
          {
            ...dataset(),
            id: 'dataset-2',
            name: 'Canary Regression',
            updatedAt: '2026-01-02T00:00:00.000Z'
          }
        ]
      }
    });

    await act(async () => {
      root.render(<EvalConsole currentUser={{ id: 'user-1', email: 'user@example.com' }} />);
    });
    await flush();
    await flush();

    expect(document.body.textContent).toContain('数据集');
    expect(document.body.textContent).toContain('评估运行');

    const selector = document.body.querySelector('select[aria-label="Eval dataset"]') as HTMLSelectElement;
    await act(async () => {
      selector.value = 'dataset-2';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(navigation.push).toHaveBeenCalledWith('/observability/evals?datasetId=dataset-2', { scroll: false });
  });

  it('starts an eval from the selected dataset and runs the queued eval', async () => {
    api.createEvalRunResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { evalRun: evalRun({ id: 'eval-run-2' }) }
    });
    api.runEvalRunResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { evalRun: evalRun({ status: 'completed' }) }
    });

    await act(async () => {
      root.render(<EvalConsole currentUser={{ id: 'user-1', email: 'user@example.com' }} />);
    });
    await flush();
    await flush();

    const createButton = document.body.querySelector('button[aria-label="Create eval run"]');
    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();

    expect(api.createEvalRunResponse).toHaveBeenCalledWith('dataset-1', {});
    expect(navigation.push).toHaveBeenCalledWith('/observability/evals?datasetId=dataset-1&evalRunId=eval-run-2', { scroll: false });

    const runButton = document.body.querySelector('button[aria-label="Run eval"]');
    await act(async () => {
      runButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();

    expect(api.runEvalRunResponse).toHaveBeenCalledWith('eval-run-2');
  });

  it('keeps run action available when results fail to load', async () => {
    api.fetchEvalExampleResultsResponse.mockResolvedValue({
      ok: false,
      status: 503,
      error: 'results unavailable',
      data: { results: [] }
    });
    api.runEvalRunResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: { evalRun: evalRun({ status: 'completed' }) }
    });

    await act(async () => {
      root.render(<EvalConsole currentUser={{ id: 'user-1', email: 'user@example.com' }} />);
    });
    await flush();
    await flush();

    expect(document.body.textContent).toContain('results unavailable');

    const runButton = document.body.querySelector('button[aria-label="Run eval"]');
    expect(runButton).toBeTruthy();
    await act(async () => {
      runButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();

    expect(api.runEvalRunResponse).toHaveBeenCalledWith('eval-run-1');
  });

  it('marks a result pass, fail, needs_review, and not_applicable through review controls', async () => {
    api.updateEvalExampleResultReviewResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        result: result({
          review: {
            status: 'pass',
            reviewerNote: 'ok',
            reviewedByActorId: 'user-1',
            reviewedAt: '2026-01-01T00:00:03.000Z'
          }
        })
      }
    });

    await act(async () => {
      root.render(<EvalConsole currentUser={{ id: 'user-1', email: 'user@example.com' }} />);
    });
    await flush();
    await flush();

    const select = document.body.querySelector('select[aria-label="Review decision"]') as HTMLSelectElement;
    const input = document.body.querySelector('input[aria-label="Reviewer Note"]') as HTMLInputElement;
    const saveButton = [...document.body.querySelectorAll('button')].find((button) => button.textContent === '保存');
    const inputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

    for (const status of ['pass', 'fail', 'needs_review', 'not_applicable'] as const) {
      await act(async () => {
        select.value = status;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        inputValueSetter?.call(input, ` ${status} note `);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        saveButton?.click();
      });
      await flush();

      expect(api.updateEvalExampleResultReviewResponse).toHaveBeenLastCalledWith('eval-run-1', 'result-1', {
        status,
        reviewerNote: `${status} note`
      });
    }

    expect(api.fetchEvalRunResponse).toHaveBeenCalledWith('eval-run-1');
  });

  it('does not auto-select pass when the comparison text matches', async () => {
    const matchingActualOutput = {
      schemaVersion: 1,
      kind: 'eval_run_output',
      outputRunId: 'output-run-1',
      evalThreadId: 'eval-thread-1',
      status: 'completed',
      assistantMessages: [
        {
          id: 'assistant-1',
          threadId: 'eval-thread-1',
          runId: 'output-run-1',
          role: 'assistant',
          seq: 2,
          status: 'completed',
          metadata: null,
          createdAt: '2026-01-01T00:00:02.000Z',
          parts: [{ id: 'part-1', messageId: 'assistant-1', partIndex: 0, type: 'text', textValue: 'Expected answer', jsonValue: null, createdAt: '2026-01-01T00:00:02.000Z' }]
        }
      ]
    };

    api.fetchEvalExampleResultsResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        results: [
          result({
            actualOutputJson: matchingActualOutput,
            actualOutput: matchingActualOutput
          })
        ]
      }
    });

    await act(async () => {
      root.render(<EvalConsole currentUser={{ id: 'user-1', email: 'user@example.com' }} />);
    });
    await flush();
    await flush();

    expect(document.body.textContent).toContain('文本一致');
    expect(document.body.textContent).toContain('规范化文本一致');

    const select = document.body.querySelector('select[aria-label="Review decision"]') as HTMLSelectElement;
    expect(select.value).toBe('unreviewed');
  });

  it('shows missing actual and failed result comparison states without auto-reviewing', async () => {
    api.fetchEvalExampleResultsResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        results: [
          result({
            status: 'failed',
            error: 'model timeout',
            actualOutputJson: null,
            actualOutput: null
          })
        ]
      }
    });

    await act(async () => {
      root.render(<EvalConsole currentUser={{ id: 'user-1', email: 'user@example.com' }} />);
    });
    await flush();
    await flush();

    expect(document.body.textContent).toContain('不可对比');
    expect(document.body.textContent).toContain('结果失败');
    expect(document.body.textContent).toContain('model timeout');
    expect(document.body.textContent).toContain('暂无文本。');

    const select = document.body.querySelector('select[aria-label="Review decision"]') as HTMLSelectElement;
    expect(select.value).toBe('unreviewed');
  });

  it('renders multiple actual assistant messages and diagnostics', async () => {
    const multiMessageActualOutput = {
      schemaVersion: 1,
      kind: 'eval_run_output',
      outputRunId: 'output-run-1',
      evalThreadId: 'eval-thread-1',
      status: 'completed',
      assistantMessages: [
        {
          id: 'assistant-2',
          threadId: 'eval-thread-1',
          runId: 'output-run-1',
          role: 'assistant',
          seq: 3,
          status: 'completed',
          metadata: null,
          createdAt: '2026-01-01T00:00:03.000Z',
          parts: [{ id: 'part-2', messageId: 'assistant-2', partIndex: 0, type: 'text', textValue: 'Second answer', jsonValue: null, createdAt: '2026-01-01T00:00:03.000Z' }]
        },
        {
          id: 'assistant-1',
          threadId: 'eval-thread-1',
          runId: 'output-run-1',
          role: 'assistant',
          seq: 2,
          status: 'completed',
          metadata: null,
          createdAt: '2026-01-01T00:00:02.000Z',
          parts: [
            { id: 'part-1', messageId: 'assistant-1', partIndex: 0, type: 'text', textValue: 'First answer', jsonValue: null, createdAt: '2026-01-01T00:00:02.000Z' },
            { id: 'part-1b', messageId: 'assistant-1', partIndex: 1, type: 'tool_result', textValue: null, jsonValue: { ok: true }, createdAt: '2026-01-01T00:00:02.000Z' }
          ]
        }
      ]
    };

    api.fetchEvalExampleResultsResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        results: [
          result({
            actualOutputJson: multiMessageActualOutput,
            actualOutput: multiMessageActualOutput
          })
        ]
      }
    });

    await act(async () => {
      root.render(<EvalConsole currentUser={{ id: 'user-1', email: 'user@example.com' }} />);
    });
    await flush();
    await flush();

    expect(document.body.textContent).toContain('诊断: 存在多条实际助手消息, 已省略非文本实际输出片段');
    expect(document.body.textContent).toContain('实际助手消息');
    expect(document.body.textContent).toContain('实际消息 1');
    expect(document.body.textContent).toContain('First answer');
    expect(document.body.textContent).toContain('实际消息 2');
    expect(document.body.textContent).toContain('Second answer');
  });

  it('filters results locally by status, review, comparison outcome, errors, and missing actual', async () => {
    const matchingActualOutput = {
      schemaVersion: 1,
      kind: 'eval_run_output',
      outputRunId: 'output-run-1',
      evalThreadId: 'eval-thread-1',
      status: 'completed',
      assistantMessages: [
        {
          id: 'assistant-1',
          threadId: 'eval-thread-1',
          runId: 'output-run-1',
          role: 'assistant',
          seq: 2,
          status: 'completed',
          metadata: null,
          createdAt: '2026-01-01T00:00:02.000Z',
          parts: [{ id: 'part-1', messageId: 'assistant-1', partIndex: 0, type: 'text', textValue: 'Expected answer', jsonValue: null, createdAt: '2026-01-01T00:00:02.000Z' }]
        }
      ]
    };

    api.fetchEvalExampleResultsResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        results: [
          result({ id: 'result-match', datasetExampleId: 'example-match', actualOutputJson: matchingActualOutput, actualOutput: matchingActualOutput }),
          result({
            id: 'result-failed',
            datasetExampleId: 'example-failed',
            status: 'failed',
            error: 'runtime failed',
            actualOutputJson: null,
            actualOutput: null
          }),
          result({
            id: 'result-reviewed',
            datasetExampleId: 'example-reviewed',
            review: {
              status: 'pass',
              reviewerNote: 'already reviewed',
              reviewedByActorId: 'user-1',
              reviewedAt: '2026-01-01T00:00:03.000Z'
            }
          })
        ]
      }
    });

    await act(async () => {
      root.render(<EvalConsole currentUser={{ id: 'user-1', email: 'user@example.com' }} />);
    });
    await flush();
    await flush();

    expect(document.body.textContent).toContain('显示 3/3');
    expect(document.body.textContent).toContain('样本 #1');
    expect(document.body.textContent).toContain('通过');

    await act(async () => {
      [...document.body.querySelectorAll('button')].find((button) => button.textContent === '失败 1')?.click();
    });
    await flush();

    expect(document.body.textContent).toContain('显示 1/3');
    expect(document.body.textContent).toContain('不可对比');
    expect(document.body.textContent).not.toContain('文本一致样本 #1');

    await act(async () => {
      [...document.body.querySelectorAll('button')].find((button) => button.textContent === '清除')?.click();
    });
    await flush();

    await act(async () => {
      [...document.body.querySelectorAll('button')].find((button) => button.textContent === '未审核 2')?.click();
    });
    await flush();

    expect(document.body.textContent).toContain('显示 2/3');
    expect(document.body.textContent).toContain('文本一致');
    expect(document.body.textContent).toContain('不可对比');

    await act(async () => {
      [...document.body.querySelectorAll('button')].find((button) => button.textContent === '文本一致 1')?.click();
    });
    await flush();

    expect(document.body.textContent).toContain('显示 1/3');
    expect(document.body.textContent).toContain('文本一致');

    await act(async () => {
      [...document.body.querySelectorAll('button')].find((button) => button.textContent === '错误 1')?.click();
    });
    await flush();

    expect(document.body.textContent).toContain('显示 1/3');
    expect(document.body.textContent).toContain('不可对比');

    await act(async () => {
      [...document.body.querySelectorAll('button')].find((button) => button.textContent === '缺少实际输出 1')?.click();
    });
    await flush();

    expect(document.body.textContent).toContain('显示 1/3');
    expect(document.body.textContent).toContain('不可对比');

    expect(navigation.replace).toHaveBeenLastCalledWith('/observability/evals?datasetId=dataset-1&evalRunId=eval-run-1&resultId=result-match', { scroll: false });
  });

  it('applies queue shortcuts and preserves selected detail when filters hide it', async () => {
    api.fetchEvalExampleResultsResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        results: [
          result({ id: 'result-selected', datasetExampleId: 'example-selected' }),
          result({
            id: 'result-failed',
            datasetExampleId: 'example-failed',
            status: 'failed',
            error: 'runtime failed',
            actualOutputJson: null,
            actualOutput: null
          })
        ]
      }
    });

    await act(async () => {
      root.render(<EvalConsole currentUser={{ id: 'user-1', email: 'user@example.com' }} />);
    });
    await flush();
    await flush();

    const notComparableButton = [...document.body.querySelectorAll('button')].find((button) => button.textContent === '不可对比 1');
    await act(async () => {
      notComparableButton?.click();
    });

    expect(document.body.textContent).toContain('显示 1/2');
    expect(document.body.textContent).toContain('当前结果被筛选条件隐藏。');
    expect(document.body.textContent).toContain('result-selected');
    expect(navigation.push).not.toHaveBeenCalledWith(expect.stringContaining('comparisonOutcome'), expect.anything());
    expect(navigation.replace).not.toHaveBeenCalledWith(expect.stringContaining('comparisonOutcome'), expect.anything());
  });

  it('refreshes eval run summary after saving a review', async () => {
    api.updateEvalExampleResultReviewResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        result: result({
          review: {
            status: 'pass',
            reviewerNote: 'ok',
            reviewedByActorId: 'user-1',
            reviewedAt: '2026-01-01T00:00:03.000Z'
          }
        })
      }
    });
    api.fetchEvalRunResponse.mockResolvedValue({
      ok: true,
      status: 200,
      error: null,
      data: {
        evalRun: evalRun({
          summaryJson: {
            schemaVersion: 1,
            kind: 'eval_run_summary',
            selection: { eligibleCount: 1, ineligibleCount: 0, ineligibleReasonCounts: {}, selectedCount: 1 },
            results: {
              statusCounts: { queued: 0, running: 0, completed: 1, failed: 0, skipped: 0 },
              reviewStatusCounts: { unreviewed: 0, pass: 1, fail: 0, needs_review: 0, not_applicable: 0 },
              aggregateUsage: null,
              durationMs: null
            }
          },
          summary: {
            schemaVersion: 1,
            kind: 'eval_run_summary',
            selection: { eligibleCount: 1, ineligibleCount: 0, ineligibleReasonCounts: {}, selectedCount: 1 },
            results: {
              statusCounts: { queued: 0, running: 0, completed: 1, failed: 0, skipped: 0 },
              reviewStatusCounts: { unreviewed: 0, pass: 1, fail: 0, needs_review: 0, not_applicable: 0 },
              aggregateUsage: null,
              durationMs: null
            }
          }
        })
      }
    });

    await act(async () => {
      root.render(<EvalConsole currentUser={{ id: 'user-1', email: 'user@example.com' }} />);
    });
    await flush();
    await flush();

    expect(document.body.textContent).toContain('审核状态: unreviewed: 1');

    const saveButton = [...document.body.querySelectorAll('button')].find((button) => button.textContent === '保存');
    const select = document.body.querySelector('select[aria-label="Review decision"]') as HTMLSelectElement;

    await act(async () => {
      select.value = 'pass';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      saveButton?.click();
    });
    await flush();

    expect(api.fetchEvalRunResponse).toHaveBeenCalledWith('eval-run-1');
    expect(document.body.textContent).toContain('审核状态: pass: 1');
  });

  it('shows mutation errors as toast notifications instead of inline page errors', async () => {
    api.updateEvalExampleResultReviewResponse.mockResolvedValue({
      ok: false,
      status: 400,
      error: 'review save failed',
      data: {}
    });

    await act(async () => {
      root.render(<EvalConsole currentUser={{ id: 'user-1', email: 'user@example.com' }} />);
    });
    await flush();
    await flush();

    const saveButton = [...document.body.querySelectorAll('button')].find((button) => button.textContent === '保存');
    await act(async () => {
      saveButton?.click();
    });
    await flush();

    expect(toast.error).toHaveBeenCalledWith('保存失败', {
      description: 'review save failed'
    });
    expect(document.body.textContent).not.toContain('review save failed');
  });
});
