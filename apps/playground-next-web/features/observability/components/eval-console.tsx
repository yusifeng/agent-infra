'use client';

import type {
  DatasetDto,
  EvalExampleResultDto,
  EvalExampleResultReviewStatusDto,
  EvalExampleResultStatusDto,
  EvalRunDto
} from '@agent-infra/contracts';
import {
  projectEvalExampleResultComparisonV1,
  type EvalResultComparisonOutcomeV1,
  type EvalResultComparisonProjectionV1
} from '@agent-infra/durable-chat-client';
import {
  CheckCircle2,
  Database,
  FileJson2,
  Filter,
  Link2,
  Loader2,
  Play,
  Save,
  SplitSquareHorizontal
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import type { AuthUserDto } from '@/features/auth/dto/project-auth-user-dto';
import { useEvalConsole, type EvalResultReviewDraft } from '@/features/observability/runtime/use-eval-console';

import {
  buildDatasetExampleHref,
  buildOutputRunHref,
  formatCountMap,
  readBaselineOutput,
  readEvalResultDuration,
  readEvalResultUsage,
  readEvalRunCompleted,
  readEvalRunFailed,
  readEvalRunTotal
} from '../service/eval-review';
import { formatDateTime, formatShortId } from '../service/format';
import { formatJsonPreview } from '../service/dataset-review';
import { ConsolePanelState } from './console-panel-state';
import { ObservabilityConsoleShell } from './observability-console-shell';

const RESULT_REVIEW_STATUSES: EvalExampleResultReviewStatusDto[] = ['unreviewed', 'pass', 'fail', 'needs_review', 'not_applicable'];
const RESULT_STATUSES: EvalExampleResultStatusDto[] = ['queued', 'running', 'completed', 'failed', 'skipped'];

type ResultStatusFilter = 'all' | EvalExampleResultStatusDto;
type ReviewStatusFilter = 'all' | EvalExampleResultReviewStatusDto;
type ComparisonOutcomeFilter = 'all' | EvalResultComparisonOutcomeV1;

type EvalResultFilters = {
  resultStatus: ResultStatusFilter;
  reviewStatus: ReviewStatusFilter;
  comparisonOutcome: ComparisonOutcomeFilter;
  errorOnly: boolean;
  missingActualOnly: boolean;
};

const DEFAULT_RESULT_FILTERS: EvalResultFilters = {
  resultStatus: 'all',
  reviewStatus: 'all',
  comparisonOutcome: 'all',
  errorOnly: false,
  missingActualOnly: false
};

const COMPARISON_OUTCOME_LABELS: Record<EvalResultComparisonOutcomeV1, string> = {
  match: '文本一致',
  mismatch: '文本不同',
  not_comparable: '不可对比'
};

const COMPARISON_OUTCOME_CLASSES: Record<EvalResultComparisonOutcomeV1, string> = {
  match: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  mismatch: 'border-amber-200 bg-amber-50 text-amber-800',
  not_comparable: 'border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] text-[var(--chat-muted)]'
};

const EVAL_COPY = {
  datasetContext: '数据集',
  selectDataset: '选择数据集',
  noDatasetSelected: '未选择数据集',
  createEvalRun: '新建评估',
  evalRuns: '评估运行',
  results: '结果',
  selectEvalRun: '选择一个评估运行',
  selectResult: '选择一个结果',
  noEvalRuns: '暂无评估运行',
  noResults: '暂无结果',
  noResultsMatchFilters: '没有符合筛选的结果',
  filter: '筛选',
  showCount: '显示',
  resultStatus: '结果状态',
  reviewStatus: '审核状态',
  comparison: '对比',
  errorOnly: '仅错误',
  missingActual: '缺少实际输出',
  clear: '清除',
  unreviewed: '未审核',
  failed: '失败',
  errors: '错误',
  outputComparison: '输出对照',
  expectedText: '期望回复',
  actualText: '实际回复',
  actualMessages: '实际助手消息',
  actualMessage: '实际消息',
  textDiff: '文本差异',
  diffUnavailable: '暂无可对比文本。',
  noText: '暂无文本。',
  diagnostics: '诊断',
  reason: '原因',
  result: '结果',
  review: '审核',
  reviewerNote: '审核备注',
  save: '保存',
  runEval: '运行评估',
  status: '状态',
  selected: '样本',
  completed: '完成',
  total: '总数',
  outputRun: '输出 Run',
  sourceExample: '来源样本',
  resultUuid: '结果 UUID',
  exampleUuid: '样本 UUID',
  evalRunUuid: '评估运行 UUID',
  datasetUuid: '数据集 UUID',
  usage: '用量',
  duration: '耗时',
  hiddenByFilter: '当前结果被筛选条件隐藏。',
  loadingSourceExample: '正在加载来源样本',
  saveFailed: '保存失败',
  expectedOutput: '期望输出',
  actualOutput: '实际输出',
  baselineOutput: '原始输出',
  input: '输入',
  metadata: '元数据',
  lastReview: '最近审核',
  notReviewed: '未审核',
  by: '由',
  unknown: '未知',
  evalRunFallback: '评估运行'
} as const;

const EVAL_RUN_STATUS_LABELS: Record<EvalRunDto['status'], string> = {
  queued: '排队中',
  running: '运行中',
  completed: '已完成',
  failed: '失败'
};

const RESULT_STATUS_LABELS: Record<EvalExampleResultStatusDto, string> = {
  queued: '排队中',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  skipped: '已跳过'
};

const RESULT_REVIEW_STATUS_LABELS: Record<EvalExampleResultReviewStatusDto, string> = {
  unreviewed: '未审核',
  pass: '通过',
  fail: '失败',
  needs_review: '需复核',
  not_applicable: '不适用'
};

const COMPARISON_REASON_LABELS: Record<string, string> = {
  normalized_text_equal: '规范化文本一致',
  normalized_text_different: '规范化文本不同',
  missing_expected_output: '缺少期望输出',
  missing_actual_output: '缺少实际输出',
  result_failed: '结果失败',
  unsupported_expected_output: '不支持的期望输出',
  unsupported_actual_output: '不支持的实际输出',
  no_assistant_text: '缺少助手文本'
};

const COMPARISON_DIAGNOSTIC_LABELS: Record<string, string> = {
  multiple_actual_assistant_messages: '存在多条实际助手消息',
  non_text_actual_parts_omitted: '已省略非文本实际输出片段',
  non_text_expected_parts_omitted: '已省略非文本期望片段'
};

function formatComparisonLabel(value: string) {
  return COMPARISON_REASON_LABELS[value] ?? COMPARISON_DIAGNOSTIC_LABELS[value] ?? value.replaceAll('_', ' ');
}

function formatEvalRunStatusLabel(status: EvalRunDto['status']) {
  return EVAL_RUN_STATUS_LABELS[status] ?? status;
}

function formatResultStatusLabel(status: EvalExampleResultStatusDto) {
  return RESULT_STATUS_LABELS[status] ?? status;
}

function formatReviewStatusLabel(status: EvalExampleResultReviewStatusDto) {
  return RESULT_REVIEW_STATUS_LABELS[status] ?? status;
}

function readResultReviewStatus(result: EvalExampleResultDto): EvalExampleResultReviewStatusDto {
  return result.review?.status ?? 'unreviewed';
}

function resultHasError(result: EvalExampleResultDto) {
  return Boolean(result.error || result.actualOutput?.error);
}

function resultIsMissingActual(result: EvalExampleResultDto, comparison: EvalResultComparisonProjectionV1) {
  return comparison.reason === 'missing_actual_output' || (!result.actualOutput && !result.actualOutputJson);
}

function resultMatchesFilters(result: EvalExampleResultDto, comparison: EvalResultComparisonProjectionV1, filters: EvalResultFilters) {
  if (filters.resultStatus !== 'all' && result.status !== filters.resultStatus) {
    return false;
  }
  if (filters.reviewStatus !== 'all' && readResultReviewStatus(result) !== filters.reviewStatus) {
    return false;
  }
  if (filters.comparisonOutcome !== 'all' && comparison.outcome !== filters.comparisonOutcome) {
    return false;
  }
  if (filters.errorOnly && !resultHasError(result)) {
    return false;
  }
  if (filters.missingActualOnly && !resultIsMissingActual(result, comparison)) {
    return false;
  }

  return true;
}

function countResults(
  results: EvalExampleResultDto[],
  comparisonByResultId: Map<string, EvalResultComparisonProjectionV1>,
  predicate: (result: EvalExampleResultDto, comparison: EvalResultComparisonProjectionV1) => boolean
) {
  return results.reduce((count, result) => {
    const comparison = comparisonByResultId.get(result.id);
    return comparison && predicate(result, comparison) ? count + 1 : count;
  }, 0);
}

function splitComparisonTokens(text: string) {
  return text.match(/\S+|\s+/g) ?? [];
}

function DiffText({ expectedText, actualText }: { expectedText: string | null | undefined; actualText: string | null | undefined }) {
  if (!expectedText || !actualText) {
    return <div className="text-sm text-[var(--chat-muted)]">{EVAL_COPY.diffUnavailable}</div>;
  }

  const expectedTokens = splitComparisonTokens(expectedText);
  const actualTokens = splitComparisonTokens(actualText);
  const maxLength = Math.max(expectedTokens.length, actualTokens.length);

  return (
    <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3">
      <div className="mb-2 text-xs font-medium text-[var(--chat-muted)]">{EVAL_COPY.textDiff}</div>
      <pre className="max-h-[240px] overflow-auto whitespace-pre-wrap break-words text-sm leading-6 text-[var(--chat-text)]">
        {Array.from({ length: maxLength }, (_, index) => {
          const actualToken = actualTokens[index] ?? '';
          const expectedToken = expectedTokens[index] ?? '';
          const differs = actualToken !== expectedToken;
          const whitespace = actualToken.trim().length === 0;

          if (!actualToken) {
            return (
              <span key={index} className="rounded bg-amber-100 px-0.5 text-amber-900">
                {expectedToken}
              </span>
            );
          }

          if (!differs || whitespace) {
            return actualToken;
          }

          return (
            <span key={index} className="rounded bg-amber-100 px-0.5 text-amber-900">
              {actualToken}
            </span>
          );
        })}
      </pre>
    </div>
  );
}

function ComparisonBadge({ outcome }: { outcome: EvalResultComparisonOutcomeV1 }) {
  return (
    <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${COMPARISON_OUTCOME_CLASSES[outcome]}`}>
      {COMPARISON_OUTCOME_LABELS[outcome]}
    </span>
  );
}

function TextBlock({ label, text }: { label: string; text: string | null | undefined }) {
  return (
    <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3">
      <div className="mb-2 text-xs font-medium text-[var(--chat-muted)]">{label}</div>
      {text ? (
        <pre className="max-h-[240px] overflow-auto whitespace-pre-wrap break-words text-sm leading-6 text-[var(--chat-text)]">{text}</pre>
      ) : (
        <div className="text-sm text-[var(--chat-muted)]">{EVAL_COPY.noText}</div>
      )}
    </div>
  );
}

function ComparePanel({ result }: { result: EvalExampleResultDto }) {
  const comparison = useMemo(() => projectEvalExampleResultComparisonV1(result), [result]);

  return (
    <section className="mt-4 border-t border-[color:var(--chat-border)] py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <SplitSquareHorizontal className="size-4 shrink-0 text-[var(--chat-muted)]" />
          <h3 className="text-sm font-semibold text-[var(--chat-text)]">{EVAL_COPY.outputComparison}</h3>
        </div>
        <ComparisonBadge outcome={comparison.outcome} />
      </div>

      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--chat-muted)]">
        <span>{EVAL_COPY.reason} {formatComparisonLabel(comparison.reason)}</span>
        <span>{EVAL_COPY.result} {formatResultStatusLabel(result.status)}</span>
        <span>{readEvalResultUsage(result)}</span>
        <span>{readEvalResultDuration(result)}</span>
      </div>

      {comparison.diagnostics.length > 0 ? (
        <div className="mb-3 rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] px-3 py-2 text-xs leading-5 text-[var(--chat-muted)]">
          {EVAL_COPY.diagnostics}: {comparison.diagnostics.map(formatComparisonLabel).join(', ')}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <TextBlock label={EVAL_COPY.expectedText} text={comparison.expectedText} />
        <TextBlock label={EVAL_COPY.actualText} text={comparison.actualText} />
      </div>

      {comparison.actualTextBlocks.length > 1 ? <ActualMessageBlocks comparison={comparison} /> : null}

      <div className="mt-3">
        <DiffText expectedText={comparison.expectedText} actualText={comparison.actualText} />
      </div>
    </section>
  );
}

function ActualMessageBlocks({ comparison }: { comparison: EvalResultComparisonProjectionV1 }) {
  return (
    <div className="mt-3 rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3">
      <div className="mb-2 text-xs font-medium text-[var(--chat-muted)]">{EVAL_COPY.actualMessages}</div>
      <div className="grid gap-2">
        {comparison.actualTextBlocks.map((block, index) => (
          <div key={`${block.messageId}-${index}`} className="rounded-md border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] p-2">
            <div className="mb-1 text-[11px] text-[var(--chat-muted)]">
              {EVAL_COPY.actualMessage} {index + 1} · {block.seq == null ? 'seq n/a' : `seq ${block.seq}`} · {formatShortId(block.messageId, 10)}
            </div>
            <pre className="max-h-[160px] overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-[var(--chat-text)]">{block.text}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

function JsonBlock({ title, value, open = false }: { title: string; value: Record<string, unknown> | null | undefined; open?: boolean }) {
  return (
    <details className="border-t border-[color:var(--chat-border)] py-3" open={open}>
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--chat-text)]">
        <FileJson2 className="size-4 text-[var(--chat-muted)]" />
        {title}
      </summary>
      <pre className="mt-3 max-h-[320px] overflow-auto rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] p-3 text-xs leading-5 text-[var(--chat-text)]">
        {formatJsonPreview(value)}
      </pre>
    </details>
  );
}

function DatasetContextHeader({
  datasets,
  selectedDataset,
  datasetsLoading,
  datasetsError,
  creatingEvalRun,
  onSelectDataset,
  onCreateEvalRun
}: {
  datasets: DatasetDto[];
  selectedDataset: DatasetDto | null;
  datasetsLoading: boolean;
  datasetsError: string | null;
  creatingEvalRun: boolean;
  onSelectDataset: (datasetId: string) => void;
  onCreateEvalRun: () => void;
}) {
  return (
    <section className="border-b border-[color:var(--chat-border)] bg-[var(--chat-surface)] px-4 py-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[240px] flex-1">
          <div className="mb-1 flex items-center gap-2">
            <Database className="size-4 text-[var(--chat-muted)]" />
            <span className="text-xs font-medium uppercase tracking-normal text-[var(--chat-muted)]">{EVAL_COPY.datasetContext}</span>
            {datasetsLoading ? <Loader2 className="size-3.5 animate-spin text-[var(--chat-muted)]" /> : null}
          </div>
          <select
            aria-label="Eval dataset"
            className="h-9 w-full rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-3 text-sm text-[var(--chat-text)] outline-none focus:border-[color:var(--chat-border-strong)]"
            value={selectedDataset?.id ?? ''}
            disabled={datasetsLoading || datasets.length === 0}
            onChange={(event) => onSelectDataset(event.target.value)}
          >
            {selectedDataset ? null : <option value="">{EVAL_COPY.selectDataset}</option>}
            {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}
          </select>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--chat-muted)]">
            {selectedDataset ? (
              <>
                <span>{selectedDataset.visibility}</span>
                <span>{formatDateTime(selectedDataset.updatedAt)}</span>
              </>
            ) : (
              <span>{datasetsError ?? EVAL_COPY.noDatasetSelected}</span>
            )}
          </div>
        </div>
        <Button
          size="sm"
          aria-label="Create eval run"
          onClick={onCreateEvalRun}
          disabled={!selectedDataset || creatingEvalRun}
          className="bg-blue-600 text-white hover:bg-blue-700"
        >
          {creatingEvalRun ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          {EVAL_COPY.createEvalRun}
        </Button>
      </div>
      {datasetsError ? (
        <div className="mt-2 rounded-md bg-[var(--chat-error-bg)] px-3 py-2 text-xs text-[var(--chat-error-text)]">{datasetsError}</div>
      ) : null}
    </section>
  );
}

function EvalRunRow({
  evalRun,
  index,
  selected,
  onSelect
}: {
  evalRun: EvalRunDto;
  index: number;
  selected: boolean;
  onSelect: (evalRunId: string) => void;
}) {
  const label = evalRun.name?.trim() || `${EVAL_COPY.evalRunFallback} ${index + 1}`;
  const showStatus = evalRun.status !== 'completed';

  return (
    <button
      type="button"
      className={`group flex h-12 w-full items-center justify-between rounded-[12px] px-3 text-left transition ${
        selected ? 'bg-[var(--chat-brand-accent-soft)] text-[var(--chat-text)]' : 'text-[var(--chat-text)] hover:bg-[var(--chat-hover)]'
      }`}
      onClick={() => onSelect(evalRun.id)}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm leading-[1.2]" title={label}>{label}</div>
        <div className="mt-1 truncate text-xs text-[var(--chat-muted)]">
          {EVAL_COPY.selected} {readEvalRunTotal(evalRun)} · {EVAL_COPY.completed} {readEvalRunCompleted(evalRun)} · {EVAL_COPY.failed} {readEvalRunFailed(evalRun)}
        </div>
      </div>
      {showStatus ? (
        <span className="ml-2 shrink-0 rounded-md border border-[color:var(--chat-border)] px-2 py-0.5 text-[11px] text-[var(--chat-muted)]">
          {formatEvalRunStatusLabel(evalRun.status)}
        </span>
      ) : null}
    </button>
  );
}

function ResultRow({
  result,
  comparison,
  selected,
  onSelect
}: {
  result: EvalExampleResultDto;
  comparison: EvalResultComparisonProjectionV1;
  selected: boolean;
  onSelect: (resultId: string) => void;
}) {
  const reviewStatus = readResultReviewStatus(result);
  const showReviewStatus = reviewStatus !== 'unreviewed';

  return (
    <button
      type="button"
      className={`group flex min-h-12 w-full items-center justify-between rounded-[12px] px-3 py-2 text-left transition ${
        selected ? 'bg-[var(--chat-brand-accent-soft)] text-[var(--chat-text)]' : 'text-[var(--chat-text)] hover:bg-[var(--chat-hover)]'
      }`}
      onClick={() => onSelect(result.id)}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm leading-[1.2]">{EVAL_COPY.selected} #{result.exampleOrdinal}</div>
        <div className="mt-1 truncate text-xs text-[var(--chat-muted)]">
          {formatResultStatusLabel(result.status)} · {readEvalResultUsage(result)} · {readEvalResultDuration(result)}
        </div>
      </div>
      <div className="ml-2 flex shrink-0 items-center gap-2">
        {showReviewStatus ? (
          <span className="rounded-md border border-[color:var(--chat-border)] px-2 py-0.5 text-[11px] text-[var(--chat-muted)]">
            {formatReviewStatusLabel(reviewStatus)}
          </span>
        ) : null}
        <ComparisonBadge outcome={comparison.outcome} />
      </div>
    </button>
  );
}

function ResultFiltersPanel({
  filters,
  totalCount,
  visibleCount,
  queueCounts,
  onChange
}: {
  filters: EvalResultFilters;
  totalCount: number;
  visibleCount: number;
  queueCounts: {
    unreviewed: number;
    mismatch: number;
    notComparable: number;
    failed: number;
    match: number;
    error: number;
    missingActual: number;
  };
  onChange: (filters: EvalResultFilters) => void;
}) {
  const setFilter = <TKey extends keyof EvalResultFilters>(key: TKey, value: EvalResultFilters[TKey]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <section className="border-b border-[color:var(--chat-border)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-[var(--chat-muted)]" />
          <h3 className="text-sm font-semibold text-[var(--chat-text)]">{EVAL_COPY.filter}</h3>
        </div>
        <span className="text-xs text-[var(--chat-muted)]">
          {EVAL_COPY.showCount} {visibleCount}/{totalCount}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-[var(--chat-muted)]">
        <label className="block">
          {EVAL_COPY.resultStatus}
          <select
            aria-label="Result status filter"
            className="mt-1 h-8 w-full rounded-md border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-2 text-xs text-[var(--chat-text)]"
            value={filters.resultStatus}
            onChange={(event) => setFilter('resultStatus', event.target.value as ResultStatusFilter)}
          >
            <option value="all">全部</option>
            {RESULT_STATUSES.map((status) => <option key={status} value={status}>{formatResultStatusLabel(status)}</option>)}
          </select>
        </label>

        <label className="block">
          {EVAL_COPY.reviewStatus}
          <select
            aria-label="Review status filter"
            className="mt-1 h-8 w-full rounded-md border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-2 text-xs text-[var(--chat-text)]"
            value={filters.reviewStatus}
            onChange={(event) => setFilter('reviewStatus', event.target.value as ReviewStatusFilter)}
          >
            <option value="all">全部</option>
            {RESULT_REVIEW_STATUSES.map((status) => <option key={status} value={status}>{formatReviewStatusLabel(status)}</option>)}
          </select>
        </label>

        <label className="block">
          {EVAL_COPY.comparison}
          <select
            aria-label="Comparison outcome filter"
            className="mt-1 h-8 w-full rounded-md border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-2 text-xs text-[var(--chat-text)]"
            value={filters.comparisonOutcome}
            onChange={(event) => setFilter('comparisonOutcome', event.target.value as ComparisonOutcomeFilter)}
          >
            <option value="all">全部</option>
            <option value="match">{COMPARISON_OUTCOME_LABELS.match}</option>
            <option value="mismatch">{COMPARISON_OUTCOME_LABELS.mismatch}</option>
            <option value="not_comparable">{COMPARISON_OUTCOME_LABELS.not_comparable}</option>
          </select>
        </label>

        <label className="flex items-center gap-2 rounded-md border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-2 py-1.5 text-xs text-[var(--chat-text)]">
          <input
            type="checkbox"
            className="size-3.5"
            checked={filters.errorOnly}
            onChange={(event) => setFilter('errorOnly', event.target.checked)}
          />
          {EVAL_COPY.errorOnly}
        </label>

        <label className="flex items-center gap-2 rounded-md border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-2 py-1.5 text-xs text-[var(--chat-text)]">
          <input
            type="checkbox"
            className="size-3.5"
            checked={filters.missingActualOnly}
            onChange={(event) => setFilter('missingActualOnly', event.target.checked)}
          />
          {EVAL_COPY.missingActual}
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...DEFAULT_RESULT_FILTERS, reviewStatus: 'unreviewed' })}
        >
          {EVAL_COPY.unreviewed} {queueCounts.unreviewed}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...DEFAULT_RESULT_FILTERS, resultStatus: 'failed' })}
        >
          {EVAL_COPY.failed} {queueCounts.failed}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...DEFAULT_RESULT_FILTERS, comparisonOutcome: 'match' })}
        >
          {COMPARISON_OUTCOME_LABELS.match} {queueCounts.match}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...DEFAULT_RESULT_FILTERS, reviewStatus: 'unreviewed', comparisonOutcome: 'mismatch' })}
        >
          {COMPARISON_OUTCOME_LABELS.mismatch} {queueCounts.mismatch}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...DEFAULT_RESULT_FILTERS, reviewStatus: 'unreviewed', comparisonOutcome: 'not_comparable' })}
        >
          {COMPARISON_OUTCOME_LABELS.not_comparable} {queueCounts.notComparable}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...DEFAULT_RESULT_FILTERS, errorOnly: true })}
        >
          {EVAL_COPY.errors} {queueCounts.error}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...DEFAULT_RESULT_FILTERS, missingActualOnly: true })}
        >
          {EVAL_COPY.missingActual} {queueCounts.missingActual}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange(DEFAULT_RESULT_FILTERS)}>
          {EVAL_COPY.clear}
        </Button>
      </div>
    </section>
  );
}

function ReviewEditor({
  result,
  saving,
  onSave
}: {
  result: EvalExampleResultDto;
  saving: boolean;
  onSave: (draft: EvalResultReviewDraft) => void;
}) {
  const [status, setStatus] = useState<EvalExampleResultReviewStatusDto>('unreviewed');
  const [reviewerNote, setReviewerNote] = useState('');

  useEffect(() => {
    setStatus(result.review?.status ?? 'unreviewed');
    setReviewerNote(result.review?.reviewerNote ?? '');
  }, [result.id, result.review]);

  return (
    <section className="border-t border-[color:var(--chat-border)] py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--chat-text)]">{EVAL_COPY.review}</h3>
        <Button size="sm" onClick={() => onSave({ status, reviewerNote })} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {EVAL_COPY.save}
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-[240px_minmax(0,1fr)]">
        <label className="block text-xs font-medium text-[var(--chat-muted)]">
          {EVAL_COPY.status}
          <select
            aria-label="Review decision"
            className="mt-1 h-9 w-full rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-2 text-sm text-[var(--chat-text)]"
            value={status}
            onChange={(event) => setStatus(event.target.value as EvalExampleResultReviewStatusDto)}
          >
            {RESULT_REVIEW_STATUSES.map((item) => <option key={item} value={item}>{formatReviewStatusLabel(item)}</option>)}
          </select>
        </label>
        <label className="block text-xs font-medium text-[var(--chat-muted)]">
          {EVAL_COPY.reviewerNote}
          <input
            aria-label="Reviewer Note"
            className="mt-1 h-9 w-full rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-3 text-sm text-[var(--chat-text)] outline-none focus:border-[color:var(--chat-border-strong)]"
            value={reviewerNote}
            onChange={(event) => setReviewerNote(event.target.value)}
          />
        </label>
      </div>
      <div className="mt-2 text-xs text-[var(--chat-muted)]">
        {EVAL_COPY.lastReview}: {result.review?.reviewedAt ? `${formatDateTime(result.review.reviewedAt)} ${EVAL_COPY.by} ${result.review.reviewedByActorId ?? EVAL_COPY.unknown}` : EVAL_COPY.notReviewed}
      </div>
    </section>
  );
}

function EvalSummary({
  evalRun,
  dataset,
  running,
  onRun
}: {
  evalRun: EvalRunDto;
  dataset: DatasetDto | null;
  running: boolean;
  onRun: () => void;
}) {
  return (
    <section className="border-b border-[color:var(--chat-border)] px-5 py-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-[var(--chat-text)]">{dataset?.name ?? formatShortId(evalRun.datasetId, 12)}</h3>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-[var(--chat-muted)]">
            <span>{EVAL_COPY.status} {formatEvalRunStatusLabel(evalRun.status)}</span>
            <span>{EVAL_COPY.evalRunUuid} {evalRun.id}</span>
          </div>
        </div>
        <Button
          size="sm"
          aria-label="Run eval"
          onClick={onRun}
          disabled={running || evalRun.status !== 'queued'}
          className="bg-blue-600 text-white hover:bg-blue-700"
        >
          {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          {EVAL_COPY.runEval}
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3">
          <div className="text-xs text-[var(--chat-muted)]">{EVAL_COPY.status}</div>
          <div className="mt-1 text-sm font-semibold text-[var(--chat-text)]">{formatEvalRunStatusLabel(evalRun.status)}</div>
        </div>
        <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3">
          <div className="text-xs text-[var(--chat-muted)]">{EVAL_COPY.selected}</div>
          <div className="mt-1 text-sm font-semibold text-[var(--chat-text)]">{readEvalRunTotal(evalRun)}</div>
        </div>
        <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3">
          <div className="text-xs text-[var(--chat-muted)]">{EVAL_COPY.completed}</div>
          <div className="mt-1 text-sm font-semibold text-[var(--chat-text)]">{readEvalRunCompleted(evalRun)}</div>
        </div>
        <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3">
          <div className="text-xs text-[var(--chat-muted)]">{EVAL_COPY.failed}</div>
          <div className="mt-1 text-sm font-semibold text-[var(--chat-text)]">{readEvalRunFailed(evalRun)}</div>
        </div>
      </div>
      <div className="mt-3 text-xs leading-5 text-[var(--chat-muted)]">
        {EVAL_COPY.resultStatus}: {formatCountMap(evalRun.summary?.results.statusCounts)} · {EVAL_COPY.reviewStatus}: {formatCountMap(evalRun.summary?.results.reviewStatusCounts)}
      </div>
    </section>
  );
}

function ResultDetailPanel({
  evalRun,
  result,
  sourceExample,
  sourceExampleLoading,
  sourceExampleError,
  savingReview,
  hiddenByFilter,
  onSaveReview
}: {
  evalRun: EvalRunDto | null;
  result: EvalExampleResultDto | null;
  sourceExample: ReturnType<typeof useEvalConsole>['sourceExample'];
  sourceExampleLoading: boolean;
  sourceExampleError: string | null;
  savingReview: boolean;
  hiddenByFilter: boolean;
  onSaveReview: (draft: EvalResultReviewDraft) => void;
}) {
  if (!evalRun) {
    return <ConsolePanelState title={EVAL_COPY.selectEvalRun} />;
  }
  if (!result) {
    return <ConsolePanelState title={EVAL_COPY.selectResult} />;
  }

  const sourceHref = buildDatasetExampleHref({ datasetId: evalRun.datasetId, exampleId: result.datasetExampleId });
  const outputHref = buildOutputRunHref(result);

  return (
    <div className="h-full min-h-0 overflow-auto px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--chat-border)] pb-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-[var(--chat-text)]">
            {EVAL_COPY.result} #{result.exampleOrdinal}
          </h2>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--chat-muted)]">
            <span>{EVAL_COPY.status} {formatResultStatusLabel(result.status)}</span>
            <span>{EVAL_COPY.review} {formatReviewStatusLabel(result.review?.status ?? 'unreviewed')}</span>
            <span>{readEvalResultUsage(result)}</span>
            <span>{readEvalResultDuration(result)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {sourceHref ? (
            <Button asChild size="sm" variant="outline">
              <a href={sourceHref}>
                <Database className="size-4" />
                {EVAL_COPY.sourceExample}
              </a>
            </Button>
          ) : null}
          {outputHref ? (
            <Button asChild size="sm" variant="outline">
              <a href={outputHref}>
                <Link2 className="size-4" />
                {EVAL_COPY.outputRun}
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 py-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3">
          <div className="text-xs text-[var(--chat-muted)]">{EVAL_COPY.resultUuid}</div>
          <div className="mt-1 break-all font-mono text-xs text-[var(--chat-text)]">{result.id}</div>
        </div>
        <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3">
          <div className="text-xs text-[var(--chat-muted)]">{EVAL_COPY.exampleUuid}</div>
          <div className="mt-1 break-all font-mono text-xs text-[var(--chat-text)]">{result.datasetExampleId}</div>
        </div>
        <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3">
          <div className="text-xs text-[var(--chat-muted)]">{EVAL_COPY.outputRun}</div>
          <div className="mt-1 break-all font-mono text-xs text-[var(--chat-text)]">{result.outputRunId ?? '-'}</div>
        </div>
        <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3">
          <div className="text-xs text-[var(--chat-muted)]">{EVAL_COPY.usage}</div>
          <div className="mt-1 text-sm font-semibold text-[var(--chat-text)]">{readEvalResultUsage(result)}</div>
          <div className="mt-1 text-xs text-[var(--chat-muted)]">{EVAL_COPY.duration} {readEvalResultDuration(result)}</div>
        </div>
      </div>

      {result.error ? <div className="mt-4 rounded-lg bg-[var(--chat-error-bg)] px-3 py-2 text-sm text-[var(--chat-error-text)]">{result.error}</div> : null}
      {hiddenByFilter ? (
        <div className="mt-4 rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] px-3 py-2 text-sm text-[var(--chat-muted)]">
          {EVAL_COPY.hiddenByFilter}
        </div>
      ) : null}

      <ComparePanel result={result} />

      <ReviewEditor result={result} saving={savingReview} onSave={onSaveReview} />

      {sourceExampleLoading ? <div className="py-3 text-sm text-[var(--chat-muted)]">{EVAL_COPY.loadingSourceExample}</div> : null}
      {sourceExampleError ? <div className="py-3 text-sm text-[var(--chat-muted)]">{sourceExampleError}</div> : null}

      <JsonBlock title={EVAL_COPY.expectedOutput} value={result.expectedOutputJson} />
      <JsonBlock title={EVAL_COPY.actualOutput} value={result.actualOutputJson} />
      <JsonBlock title={EVAL_COPY.baselineOutput} value={readBaselineOutput(sourceExample)} />
      <JsonBlock title={EVAL_COPY.input} value={result.inputJson} />
      <JsonBlock title={EVAL_COPY.usage} value={result.usageJson} />
      <JsonBlock title={EVAL_COPY.metadata} value={result.metadataJson} />
    </div>
  );
}

export function EvalConsole({ currentUser }: { currentUser: AuthUserDto }) {
  const state = useEvalConsole();
  const [resultFilters, setResultFilters] = useState<EvalResultFilters>(DEFAULT_RESULT_FILTERS);
  const comparisonByResultId = useMemo(() => {
    return new Map(state.results.map((result) => [result.id, projectEvalExampleResultComparisonV1(result)]));
  }, [state.results]);
  const filteredResults = useMemo(() => {
    return state.results.filter((result) => {
      const comparison = comparisonByResultId.get(result.id);
      return comparison ? resultMatchesFilters(result, comparison, resultFilters) : false;
    });
  }, [comparisonByResultId, resultFilters, state.results]);
  const selectedResultHiddenByFilter = Boolean(
    state.selectedResult && !filteredResults.some((result) => result.id === state.selectedResult?.id)
  );
  const queueCounts = useMemo(() => ({
    unreviewed: countResults(
      state.results,
      comparisonByResultId,
      (result) => readResultReviewStatus(result) === 'unreviewed'
    ),
    mismatch: countResults(
      state.results,
      comparisonByResultId,
      (result, comparison) => readResultReviewStatus(result) === 'unreviewed' && comparison.outcome === 'mismatch'
    ),
    notComparable: countResults(
      state.results,
      comparisonByResultId,
      (result, comparison) => readResultReviewStatus(result) === 'unreviewed' && comparison.outcome === 'not_comparable'
    ),
    failed: countResults(
      state.results,
      comparisonByResultId,
      (result) => result.status === 'failed'
    ),
    match: countResults(
      state.results,
      comparisonByResultId,
      (_result, comparison) => comparison.outcome === 'match'
    ),
    error: countResults(
      state.results,
      comparisonByResultId,
      (result) => resultHasError(result)
    ),
    missingActual: countResults(
      state.results,
      comparisonByResultId,
      (result, comparison) => resultIsMissingActual(result, comparison)
    )
  }), [comparisonByResultId, state.results]);

  useEffect(() => {
    if (state.mutationError) {
      toast.error(EVAL_COPY.saveFailed, {
        description: state.mutationError
      });
    }
  }, [state.mutationError]);

  return (
    <ObservabilityConsoleShell
      activeSection="evals"
      currentUser={currentUser}
      onRefresh={state.refresh}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <DatasetContextHeader
          datasets={state.datasets}
          selectedDataset={state.selectedDataset}
          datasetsLoading={state.datasetsLoading}
          datasetsError={state.datasetsError}
          creatingEvalRun={state.creatingEvalRun}
          onSelectDataset={state.selectDataset}
          onCreateEvalRun={state.createEvalRun}
        />

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r border-[color:var(--chat-border)] bg-[var(--chat-bg)]">
            <div className="flex h-12 items-center justify-between gap-2 border-b border-[color:var(--chat-border)] px-4">
              <h2 className="min-w-0 truncate text-sm font-semibold">{EVAL_COPY.evalRuns}</h2>
              {state.evalRunsLoading ? <Loader2 className="size-4 animate-spin text-[var(--chat-muted)]" /> : null}
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
              {state.evalRunsError ? <ConsolePanelState title={state.evalRunsError} /> : null}
              {!state.selectedDataset && !state.datasetsError ? <ConsolePanelState title={EVAL_COPY.selectDataset} /> : null}
              {!state.evalRunsError && state.selectedDataset && state.evalRuns.length === 0 && !state.evalRunsLoading ? (
                <ConsolePanelState title={EVAL_COPY.noEvalRuns} />
              ) : null}
              {state.evalRuns.map((evalRun, index) => (
                <EvalRunRow
                  key={evalRun.id}
                  evalRun={evalRun}
                  index={index}
                  selected={evalRun.id === state.selectedEvalRunId}
                  onSelect={state.selectEvalRun}
                />
              ))}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col bg-[var(--chat-surface)]">
            {state.selectedEvalRun ? (
              <EvalSummary
                evalRun={state.selectedEvalRun}
                dataset={state.selectedDataset}
                running={state.runningEvalRun}
                onRun={state.runSelectedEvalRun}
              />
            ) : null}
            {state.selectedEvalRun ? (
              <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
                <aside className="flex min-h-0 flex-col border-r border-[color:var(--chat-border)] bg-[var(--chat-bg)]">
                  <div className="flex h-12 items-center justify-between gap-2 border-b border-[color:var(--chat-border)] px-4">
                    <h2 className="text-sm font-semibold">{EVAL_COPY.results}</h2>
                    {state.resultsLoading ? <Loader2 className="size-4 animate-spin text-[var(--chat-muted)]" /> : null}
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
                    {state.resultsError ? <ConsolePanelState title={state.resultsError} /> : null}
                    {!state.resultsError && state.results.length === 0 && !state.resultsLoading ? (
                      <ConsolePanelState title={EVAL_COPY.noResults} />
                    ) : null}
                    {!state.resultsError && state.results.length > 0 ? (
                      <ResultFiltersPanel
                        filters={resultFilters}
                        totalCount={state.results.length}
                        visibleCount={filteredResults.length}
                        queueCounts={queueCounts}
                        onChange={setResultFilters}
                      />
                    ) : null}
                    {!state.resultsError && state.results.length > 0 && filteredResults.length === 0 ? <ConsolePanelState title={EVAL_COPY.noResultsMatchFilters} /> : null}
                    {filteredResults.map((result) => {
                      const comparison = comparisonByResultId.get(result.id);
                      return comparison ? (
                        <ResultRow
                          key={result.id}
                          result={result}
                          comparison={comparison}
                          selected={result.id === state.selectedResultId}
                          onSelect={state.selectResult}
                        />
                      ) : null;
                    })}
                  </div>
                </aside>

                <ResultDetailPanel
                  evalRun={state.selectedEvalRun}
                  result={state.selectedResult}
                  sourceExample={state.sourceExample}
                  sourceExampleLoading={state.sourceExampleLoading}
                  sourceExampleError={state.sourceExampleError}
                  savingReview={state.savingReview}
                  hiddenByFilter={selectedResultHiddenByFilter}
                  onSaveReview={state.saveResultReview}
                />
              </div>
            ) : (
              <ConsolePanelState title={EVAL_COPY.selectEvalRun} />
            )}
          </section>
        </div>
      </div>
    </ObservabilityConsoleShell>
  );
}
