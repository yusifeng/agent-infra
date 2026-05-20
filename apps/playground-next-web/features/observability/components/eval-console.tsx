'use client';

import type {
  DatasetDto,
  EvalExampleResultDto,
  EvalExampleResultReviewStatusDto,
  EvalExampleResultStatusDto,
  EvalRunCompareTriageDto,
  EvalRunCompareTriageStatusV1Dto,
  EvalRunDto
} from '@agent-infra/contracts';
import {
  projectEvalExampleResultComparisonV1,
  type EvalRunCompareOutcomeV1,
  type EvalRunCompareProjectionV1,
  type EvalRunCompareRowV1,
  type EvalRunCompareSideV1,
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
import {
  useEvalConsole,
  type EvalConsoleMode,
  type EvalConsoleState,
  type EvalResultReviewDraft,
  type EvalRunCompareTriageDraft
} from '@/features/observability/runtime/use-eval-console';

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
type CompareOutcomeFilter = 'all' | EvalRunCompareOutcomeV1;
type CompareTriageFilter = 'all' | 'untriaged' | EvalRunCompareTriageStatusV1Dto;

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

const COMPARE_RUN_OUTCOMES: EvalRunCompareOutcomeV1[] = [
  'regression',
  'improvement',
  'same_pass',
  'same_fail',
  'changed_unresolved',
  'same_unresolved',
  'baseline_missing',
  'candidate_missing',
  'not_comparable'
];

const COMPARE_RUN_OUTCOME_LABELS: Record<EvalRunCompareOutcomeV1, string> = {
  same_pass: '同为通过',
  same_fail: '同为失败',
  regression: '退化',
  improvement: '改进',
  same_unresolved: '同为未定',
  changed_unresolved: '未定变化',
  baseline_missing: '缺少基线',
  candidate_missing: '缺少候选',
  not_comparable: '不可对比'
};

const COMPARE_RUN_OUTCOME_CLASSES: Record<EvalRunCompareOutcomeV1, string> = {
  same_pass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  same_fail: 'border-rose-200 bg-rose-50 text-rose-800',
  regression: 'border-red-200 bg-red-50 text-red-800',
  improvement: 'border-blue-200 bg-blue-50 text-blue-800',
  same_unresolved: 'border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] text-[var(--chat-muted)]',
  changed_unresolved: 'border-amber-200 bg-amber-50 text-amber-800',
  baseline_missing: 'border-purple-200 bg-purple-50 text-purple-800',
  candidate_missing: 'border-purple-200 bg-purple-50 text-purple-800',
  not_comparable: 'border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] text-[var(--chat-muted)]'
};

const COMPARE_TRIAGE_STATUSES: EvalRunCompareTriageStatusV1Dto[] = [
  'accepted',
  'regression',
  'expected_changed',
  'needs_review',
  'ignored'
];

const COMPARE_TRIAGE_LABELS: Record<EvalRunCompareTriageStatusV1Dto | 'untriaged', string> = {
  untriaged: '未标注',
  accepted: '可接受',
  regression: '需修复',
  expected_changed: '期望变化',
  needs_review: '需复核',
  ignored: '忽略'
};

const COMPARE_TRIAGE_CLASSES: Record<EvalRunCompareTriageStatusV1Dto | 'untriaged', string> = {
  untriaged: 'border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] text-[var(--chat-muted)]',
  accepted: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  regression: 'border-red-200 bg-red-50 text-red-800',
  expected_changed: 'border-blue-200 bg-blue-50 text-blue-800',
  needs_review: 'border-amber-200 bg-amber-50 text-amber-800',
  ignored: 'border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] text-[var(--chat-muted)]'
};

const COMPARE_REASON_LABELS: Record<string, string> = {
  manual_same_pass: '两侧人工审核均通过',
  manual_same_fail: '两侧人工审核均失败',
  manual_pass_to_fail: '人工审核从通过变为失败',
  manual_fail_to_pass: '人工审核从失败变为通过',
  unreviewed_text_same: '未审核文本信号一致',
  unreviewed_text_changed: '未审核文本信号变化',
  unresolved_signal_same: '未定信号一致',
  unresolved_signal_changed: '未定信号变化',
  both_review_not_applicable: '两侧均不适用',
  baseline_missing_result: '缺少基线结果',
  candidate_missing_result: '缺少候选结果',
  different_dataset: '数据集不同',
  baseline_duplicate_dataset_example_result: '基线样本结果重复',
  candidate_duplicate_dataset_example_result: '候选样本结果重复',
  both_duplicate_dataset_example_result: '两侧样本结果重复',
  baseline_result_eval_run_mismatch: '基线结果不属于该运行',
  candidate_result_eval_run_mismatch: '候选结果不属于该运行',
  baseline_needs_review_vs_candidate_pass: '基线需复核，候选通过',
  baseline_needs_review_vs_candidate_fail: '基线需复核，候选失败',
  candidate_needs_review_vs_baseline_pass: '候选需复核，基线通过',
  candidate_needs_review_vs_baseline_fail: '候选需复核，基线失败',
  baseline_not_applicable_vs_candidate_pass: '基线不适用，候选通过',
  baseline_not_applicable_vs_candidate_fail: '基线不适用，候选失败',
  candidate_not_applicable_vs_baseline_pass: '候选不适用，基线通过',
  candidate_not_applicable_vs_baseline_fail: '候选不适用，基线失败',
  baseline_unreviewed_vs_candidate_pass: '基线未审核，候选通过',
  baseline_unreviewed_vs_candidate_fail: '基线未审核，候选失败',
  candidate_unreviewed_vs_baseline_pass: '候选未审核，基线通过',
  candidate_unreviewed_vs_baseline_fail: '候选未审核，基线失败',
  baseline_result_unresolved_vs_candidate_pass: '基线结果未定，候选通过',
  baseline_result_unresolved_vs_candidate_fail: '基线结果未定，候选失败',
  candidate_result_unresolved_vs_baseline_pass: '候选结果未定，基线通过',
  candidate_result_unresolved_vs_baseline_fail: '候选结果未定，基线失败'
};

const COMPARE_SIGNAL_LABELS: Record<string, string> = {
  manual_pass: '人工通过',
  manual_fail: '人工失败',
  manual_needs_review: '人工需复核',
  manual_not_applicable: '人工不适用',
  unreviewed_text_match: '未审核文本一致',
  unreviewed_text_mismatch: '未审核文本不同',
  unreviewed_not_comparable: '未审核不可对比',
  result_failed_unreviewed: '结果失败未审核',
  result_not_completed_unreviewed: '结果未完成未审核',
  invalid_eval_run: '运行不匹配'
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
  mode: '模式',
  reviewMode: '审核运行',
  compareMode: '对比运行',
  baselineRun: '基线运行',
  candidateRun: '候选运行',
  compareRow: '对比样本',
  compareRows: '对比行',
  compareOutcome: '对比结果',
  triage: '标注',
  triageStatus: '标注状态',
  triageNote: '标注备注',
  saveTriage: '保存标注',
  clearTriage: '清除标注',
  staleTriage: '标注已过期',
  baselineResults: '基线结果',
  candidateResults: '候选结果',
  summary: '摘要',
  rowQueue: '样本队列',
  rowDetail: '样本详情',
  missingRows: '缺失',
  tokenDelta: 'Token 变化',
  durationDelta: '耗时变化',
  baseline: '基线',
  candidate: '候选',
  signal: '信号',
  outputText: '输出文本',
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

function formatCompareReason(value: string) {
  return COMPARE_REASON_LABELS[value] ?? value.replaceAll('_', ' ');
}

function formatCompareSignal(value: string) {
  return COMPARE_SIGNAL_LABELS[value] ?? value.replaceAll('_', ' ');
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

function sortedCompareEvalRuns(evalRuns: EvalRunDto[]) {
  return [...evalRuns].sort((left, right) => {
    if (left.status === 'completed' && right.status !== 'completed') {
      return -1;
    }
    if (left.status !== 'completed' && right.status === 'completed') {
      return 1;
    }

    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}

function formatRunOptionLabel(evalRun: EvalRunDto, index: number) {
  const label = evalRun.name?.trim() || `${EVAL_COPY.evalRunFallback} ${index + 1}`;
  return `${label} · ${formatEvalRunStatusLabel(evalRun.status)} · ${formatShortId(evalRun.id, 10)}`;
}

function formatOptionalNumber(value: number | null, suffix = '') {
  return value === null ? '-' : `${value}${suffix}`;
}

function formatSignedNumber(value: number | null, suffix = '') {
  if (value === null) {
    return '-';
  }

  return `${value > 0 ? '+' : ''}${value}${suffix}`;
}

function formatDurationMsValue(value: number | null) {
  return formatOptionalNumber(value, 'ms');
}

function formatSignedDurationMs(value: number | null) {
  return formatSignedNumber(value, 'ms');
}

function formatPercentDelta(value: number | null) {
  if (value === null) {
    return null;
  }

  const percent = value * 100;
  return `${percent > 0 ? '+' : ''}${percent.toFixed(1)}%`;
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

function CompareOutcomeBadge({ outcome }: { outcome: EvalRunCompareOutcomeV1 }) {
  return (
    <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${COMPARE_RUN_OUTCOME_CLASSES[outcome]}`}>
      {COMPARE_RUN_OUTCOME_LABELS[outcome]}
    </span>
  );
}

function CompareTriageBadge({ status, stale = false }: { status: EvalRunCompareTriageStatusV1Dto | 'untriaged'; stale?: boolean }) {
  return (
    <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${COMPARE_TRIAGE_CLASSES[status]}`}>
      {COMPARE_TRIAGE_LABELS[status]}{stale ? ` · ${EVAL_COPY.staleTriage}` : ''}
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

function EvalScopePanel({
  mode,
  datasets,
  selectedDataset,
  datasetsLoading,
  datasetsError,
  evalRuns,
  evalRunsLoading,
  evalRunsError,
  selectedEvalRun,
  selectedEvalRunId,
  creatingEvalRun,
  runningEvalRun,
  onSelectDataset,
  onSelectMode,
  onCreateEvalRun,
  onSelectEvalRun,
  onRunEval
}: {
  mode: EvalConsoleMode;
  datasets: DatasetDto[];
  selectedDataset: DatasetDto | null;
  datasetsLoading: boolean;
  datasetsError: string | null;
  evalRuns: EvalRunDto[];
  evalRunsLoading: boolean;
  evalRunsError: string | null;
  selectedEvalRun: EvalRunDto | null;
  selectedEvalRunId: string | null;
  creatingEvalRun: boolean;
  runningEvalRun: boolean;
  onSelectDataset: (datasetId: string) => void;
  onSelectMode: (mode: EvalConsoleMode) => void;
  onCreateEvalRun: () => void;
  onSelectEvalRun: (evalRunId: string) => void;
  onRunEval: () => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col border-r border-[color:var(--chat-border)] bg-[var(--chat-bg)]">
      <div className="border-b border-[color:var(--chat-border)] px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Database className="size-4 text-[var(--chat-muted)]" />
            <h2 className="truncate text-sm font-semibold text-[var(--chat-text)]">{EVAL_COPY.datasetContext}</h2>
            {datasetsLoading ? <Loader2 className="size-3.5 animate-spin text-[var(--chat-muted)]" /> : null}
          </div>
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

        <div className="mt-2 flex min-h-4 flex-wrap gap-2 text-xs text-[var(--chat-muted)]">
          {selectedDataset ? (
            <>
              <span>{selectedDataset.visibility}</span>
              <span>{formatDateTime(selectedDataset.updatedAt)}</span>
            </>
          ) : (
            <span>{datasetsError ?? EVAL_COPY.noDatasetSelected}</span>
          )}
        </div>

        {datasetsError ? (
          <div className="mt-2 rounded-md bg-[var(--chat-error-bg)] px-3 py-2 text-xs text-[var(--chat-error-text)]">{datasetsError}</div>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] p-1">
          <button
            type="button"
            className={`h-8 rounded-md text-xs font-medium transition ${
              mode === 'review' ? 'bg-[var(--chat-bg)] text-[var(--chat-text)] shadow-sm' : 'text-[var(--chat-muted)] hover:text-[var(--chat-text)]'
            }`}
            onClick={() => onSelectMode('review')}
          >
            {EVAL_COPY.reviewMode}
          </button>
          <button
            type="button"
            className={`h-8 rounded-md text-xs font-medium transition ${
              mode === 'compare' ? 'bg-[var(--chat-bg)] text-[var(--chat-text)] shadow-sm' : 'text-[var(--chat-muted)] hover:text-[var(--chat-text)]'
            }`}
            onClick={() => onSelectMode('compare')}
          >
            {EVAL_COPY.compareMode}
          </button>
        </div>

        <Button
          size="sm"
          aria-label="Create eval run"
          onClick={onCreateEvalRun}
          disabled={!selectedDataset || creatingEvalRun}
          className="mt-3 w-full bg-blue-600 text-white hover:bg-blue-700"
        >
          {creatingEvalRun ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          {EVAL_COPY.createEvalRun}
        </Button>
      </div>

      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[color:var(--chat-border)] px-4">
        <h3 className="min-w-0 truncate text-sm font-semibold text-[var(--chat-text)]">{EVAL_COPY.evalRuns}</h3>
        {evalRunsLoading ? <Loader2 className="size-4 animate-spin text-[var(--chat-muted)]" /> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        {evalRunsError ? <ConsolePanelState title={evalRunsError} /> : null}
        {!selectedDataset && !datasetsError ? <ConsolePanelState title={EVAL_COPY.selectDataset} /> : null}
        {!evalRunsError && selectedDataset && evalRuns.length === 0 && !evalRunsLoading ? (
          <ConsolePanelState title={EVAL_COPY.noEvalRuns} />
        ) : null}
        {evalRuns.map((evalRun, index) => (
          <EvalRunRow
            key={evalRun.id}
            evalRun={evalRun}
            index={index}
            selected={evalRun.id === selectedEvalRunId}
            onSelect={onSelectEvalRun}
          />
        ))}
      </div>

      {selectedEvalRun ? (
        <div className="shrink-0 border-t border-[color:var(--chat-border)] px-4 py-3">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[var(--chat-text)]">
                {selectedEvalRun.name?.trim() || EVAL_COPY.evalRunFallback}
              </div>
              <div className="mt-1 truncate text-[11px] text-[var(--chat-muted)]" title={selectedEvalRun.id}>
                {EVAL_COPY.evalRunUuid} <span className="font-mono">{formatShortId(selectedEvalRun.id, 14)}</span>
              </div>
            </div>
            <span className="shrink-0 rounded-md border border-[color:var(--chat-border)] px-2 py-0.5 text-[11px] text-[var(--chat-muted)]">
              {formatEvalRunStatusLabel(selectedEvalRun.status)}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-[var(--chat-muted)]">{EVAL_COPY.total}</div>
              <div className="mt-0.5 font-semibold text-[var(--chat-text)]">{readEvalRunTotal(selectedEvalRun)}</div>
            </div>
            <div>
              <div className="text-[var(--chat-muted)]">{EVAL_COPY.completed}</div>
              <div className="mt-0.5 font-semibold text-[var(--chat-text)]">{readEvalRunCompleted(selectedEvalRun)}</div>
            </div>
            <div>
              <div className="text-[var(--chat-muted)]">{EVAL_COPY.failed}</div>
              <div className="mt-0.5 font-semibold text-[var(--chat-text)]">{readEvalRunFailed(selectedEvalRun)}</div>
            </div>
          </div>

          <div className="mt-2 text-xs leading-5 text-[var(--chat-muted)]">
            {EVAL_COPY.resultStatus}: {formatCountMap(selectedEvalRun.summary?.results.statusCounts)}
            <br />
            {EVAL_COPY.reviewStatus}: {formatCountMap(selectedEvalRun.summary?.results.reviewStatusCounts)}
          </div>

          <Button
            size="sm"
            aria-label="Run eval"
            onClick={onRunEval}
            disabled={runningEvalRun || selectedEvalRun.status !== 'queued'}
            className="mt-3 w-full bg-blue-600 text-white hover:bg-blue-700"
          >
            {runningEvalRun ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {EVAL_COPY.runEval}
          </Button>
        </div>
      ) : null}
    </aside>
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
    <section className="mb-2 rounded-[12px] border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-[var(--chat-muted)]" />
          <h3 className="text-sm font-semibold text-[var(--chat-text)]">{EVAL_COPY.filter}</h3>
        </div>
        <span className="text-xs text-[var(--chat-muted)]">
          {EVAL_COPY.showCount} {visibleCount}/{totalCount}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
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

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-[var(--chat-muted)]">{EVAL_COPY.filter}</summary>
        <div className="mt-2 grid gap-2 text-xs text-[var(--chat-muted)]">
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
      </details>
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

      {result.error ? <div className="mt-4 rounded-lg bg-[var(--chat-error-bg)] px-3 py-2 text-sm text-[var(--chat-error-text)]">{result.error}</div> : null}
      {hiddenByFilter ? (
        <div className="mt-4 rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] px-3 py-2 text-sm text-[var(--chat-muted)]">
          {EVAL_COPY.hiddenByFilter}
        </div>
      ) : null}

      <ComparePanel result={result} />

      <ReviewEditor result={result} saving={savingReview} onSave={onSaveReview} />

      <div className="grid gap-3 border-t border-[color:var(--chat-border)] py-4 md:grid-cols-2 xl:grid-cols-4">
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

function ComparePanelView({
  state,
  outcomeFilter,
  onOutcomeFilterChange
}: {
  state: EvalConsoleState;
  outcomeFilter: CompareOutcomeFilter;
  onOutcomeFilterChange: (filter: CompareOutcomeFilter) => void;
}) {
  const loading = state.baselineCompareResultsLoading || state.candidateCompareResultsLoading;
  const error = state.baselineCompareResultsError ?? state.candidateCompareResultsError ?? state.compareTriageError;
  const [triageFilter, setTriageFilter] = useState<CompareTriageFilter>('all');
  const compareRuns = useMemo(() => sortedCompareEvalRuns(state.evalRuns), [state.evalRuns]);
  const rows = state.compareProjection?.rows ?? [];
  const triageByExampleId = useMemo(
    () => new Map(state.compareTriageRows.map((triage) => [triage.datasetExampleId, triage])),
    [state.compareTriageRows]
  );
  const triageCounts = useMemo(() => countCompareTriageRows(rows, triageByExampleId), [rows, triageByExampleId]);
  const filteredRows = rows
    .filter((row) => outcomeFilter === 'all' || row.outcome === outcomeFilter)
    .filter((row) => {
      if (triageFilter === 'all') {
        return true;
      }
      const triage = triageByExampleId.get(row.datasetExampleId) ?? null;
      return triageFilter === 'untriaged' ? !triage : triage?.triageStatus === triageFilter;
    })
    .sort((left, right) => compareRowQueuePriority(left, right, triageByExampleId));
  const selectedRowVisible = Boolean(
    state.selectedCompareRow && filteredRows.some((row) => row.datasetExampleId === state.selectedCompareRow?.datasetExampleId)
  );

  return (
    <section className="grid h-full min-h-0 grid-cols-1 overflow-hidden bg-[var(--chat-surface)] xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="min-h-0 overflow-auto border-r border-[color:var(--chat-border)] bg-[var(--chat-bg)]">
        <div className="border-b border-[color:var(--chat-border)] px-4 py-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-[var(--chat-muted)]">{EVAL_COPY.mode}</div>
              <h2 className="mt-1 text-sm font-semibold text-[var(--chat-text)]">{EVAL_COPY.compareMode}</h2>
            </div>
            {loading ? <Loader2 className="size-4 animate-spin text-[var(--chat-muted)]" /> : null}
          </div>

          <div className="grid gap-2">
            <label className="block">
              <div className="mb-1 text-xs text-[var(--chat-muted)]">{EVAL_COPY.baselineRun}</div>
              <select
                aria-label="Compare baseline eval run"
                className="h-9 w-full rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-3 text-sm text-[var(--chat-text)] outline-none focus:border-[color:var(--chat-border-strong)]"
                value={state.selectedBaselineEvalRunId ?? ''}
                disabled={compareRuns.length === 0}
                onChange={(event) => state.selectCompareEvalRun('baseline', event.target.value)}
              >
                {compareRuns.map((evalRun, index) => (
                  <option key={evalRun.id} value={evalRun.id}>
                    {formatRunOptionLabel(evalRun, index)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="mb-1 text-xs text-[var(--chat-muted)]">{EVAL_COPY.candidateRun}</div>
              <select
                aria-label="Compare candidate eval run"
                className="h-9 w-full rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-3 text-sm text-[var(--chat-text)] outline-none focus:border-[color:var(--chat-border-strong)]"
                value={state.selectedCandidateEvalRunId ?? ''}
                disabled={compareRuns.length === 0}
                onChange={(event) => {
                  if (event.target.value) {
                    state.selectCompareEvalRun('candidate', event.target.value);
                  }
                }}
              >
                {state.selectedCandidateEvalRunId ? null : <option value="">{EVAL_COPY.selectEvalRun}</option>}
                {compareRuns.map((evalRun, index) => (
                  <option key={evalRun.id} value={evalRun.id}>
                    {formatRunOptionLabel(evalRun, index)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? <div className="mt-3 rounded-lg bg-[var(--chat-error-bg)] px-3 py-2 text-sm text-[var(--chat-error-text)]">{error}</div> : null}
          {state.compareProjection?.error ? (
            <div className="mt-3 rounded-lg bg-[var(--chat-error-bg)] px-3 py-2 text-sm text-[var(--chat-error-text)]">
              {COMPARE_RUN_OUTCOME_LABELS[state.compareProjection.error.outcome]} · {formatCompareReason(state.compareProjection.error.reason)}
            </div>
          ) : null}
        </div>

        <CompareSummary projection={state.compareProjection} />

        <CompareRowQueue
          rows={filteredRows}
          totalRows={rows.length}
          selectedDatasetExampleId={state.selectedCompareDatasetExampleId}
          triageByExampleId={triageByExampleId}
          triageCounts={triageCounts}
          triageLoading={state.compareTriageLoading}
          outcomeFilter={outcomeFilter}
          onOutcomeFilterChange={onOutcomeFilterChange}
          triageFilter={triageFilter}
          onTriageFilterChange={setTriageFilter}
          onSelect={state.selectCompareDatasetExample}
        />
      </div>

      <div className="min-h-0 overflow-auto px-5 py-4">
        {!state.compareProjection && loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--chat-muted)]">
            <Loader2 className="size-4 animate-spin" />
            {EVAL_COPY.compareMode}
          </div>
        ) : null}
        {state.selectedCompareRow ? (
          <CompareRowDetail
            row={state.selectedCompareRow}
            projection={state.compareProjection}
            baselineRun={state.selectedBaselineEvalRun}
            candidateRun={state.selectedCandidateEvalRun}
            baselineResults={state.baselineCompareResults}
            candidateResults={state.candidateCompareResults}
            triage={triageByExampleId.get(state.selectedCompareRow.datasetExampleId) ?? null}
            savingTriage={state.compareTriageSaving}
            hiddenByFilter={!selectedRowVisible}
            onSaveTriage={state.saveCompareTriage}
            onClearTriage={state.clearCompareTriage}
          />
        ) : (
          <ConsolePanelState title={EVAL_COPY.selectResult} />
        )}
      </div>
    </section>
  );
}

function CompareSummary({ projection }: { projection: EvalRunCompareProjectionV1 | null }) {
  const summary = projection?.summary;
  const counts = summary?.outcomeCounts;
  const missing = (counts?.baseline_missing ?? 0) + (counts?.candidate_missing ?? 0);
  const percentTokens = formatPercentDelta(summary?.usageDelta.percentDelta ?? null);
  const percentDuration = formatPercentDelta(summary?.durationDelta.percentDelta ?? null);

  return (
    <section className="border-b border-[color:var(--chat-border)] px-4 py-3">
      <div className="mb-2 text-sm font-semibold text-[var(--chat-text)]">{EVAL_COPY.summary}</div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <CompareSummaryMetric label={COMPARE_RUN_OUTCOME_LABELS.regression} value={counts?.regression ?? 0} />
        <CompareSummaryMetric label={COMPARE_RUN_OUTCOME_LABELS.improvement} value={counts?.improvement ?? 0} />
        <CompareSummaryMetric label={COMPARE_RUN_OUTCOME_LABELS.same_pass} value={counts?.same_pass ?? 0} />
        <CompareSummaryMetric label={COMPARE_RUN_OUTCOME_LABELS.same_fail} value={counts?.same_fail ?? 0} />
        <CompareSummaryMetric label={COMPARE_RUN_OUTCOME_LABELS.changed_unresolved} value={counts?.changed_unresolved ?? 0} />
        <CompareSummaryMetric label={EVAL_COPY.missingRows} value={missing} />
        <CompareSummaryMetric label={COMPARE_RUN_OUTCOME_LABELS.not_comparable} value={counts?.not_comparable ?? 0} />
        <CompareSummaryMetric label={EVAL_COPY.compareRows} value={summary?.totalRows ?? '-'} />
      </div>
      <div className="mt-3 grid gap-2 text-xs">
        <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] p-2">
          <div className="text-[var(--chat-muted)]">{EVAL_COPY.tokenDelta}</div>
          <div className="mt-1 font-semibold text-[var(--chat-text)]">
            {formatOptionalNumber(summary?.usageDelta.candidate ?? null, ' tokens')}
          </div>
          <div className="mt-0.5 text-[var(--chat-muted)]">
            {formatSignedNumber(summary?.usageDelta.absoluteDelta ?? null, ' tokens')}{percentTokens ? ` · ${percentTokens}` : ''}
          </div>
        </div>
        <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] p-2">
          <div className="text-[var(--chat-muted)]">{EVAL_COPY.durationDelta}</div>
          <div className="mt-1 font-semibold text-[var(--chat-text)]">
            {formatDurationMsValue(summary?.durationDelta.candidate ?? null)}
          </div>
          <div className="mt-0.5 text-[var(--chat-muted)]">
            {formatSignedDurationMs(summary?.durationDelta.absoluteDelta ?? null)}{percentDuration ? ` · ${percentDuration}` : ''}
          </div>
        </div>
      </div>
    </section>
  );
}

function CompareSummaryMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] p-2">
      <div className="text-[var(--chat-muted)]">{label}</div>
      <div className="mt-1 text-lg font-semibold text-[var(--chat-text)]">{value}</div>
    </div>
  );
}

function countCompareTriageRows(rows: EvalRunCompareRowV1[], triageByExampleId: Map<string, EvalRunCompareTriageDto>) {
  const counts: Record<EvalRunCompareTriageStatusV1Dto | 'untriaged', number> = {
    untriaged: 0,
    accepted: 0,
    regression: 0,
    expected_changed: 0,
    needs_review: 0,
    ignored: 0
  };
  for (const row of rows) {
    const status = triageByExampleId.get(row.datasetExampleId)?.triageStatus ?? 'untriaged';
    counts[status] += 1;
  }
  return counts;
}

function compareRowQueuePriority(
  left: EvalRunCompareRowV1,
  right: EvalRunCompareRowV1,
  triageByExampleId: Map<string, EvalRunCompareTriageDto>
) {
  const triagePriority = (row: EvalRunCompareRowV1) => {
    const status = triageByExampleId.get(row.datasetExampleId)?.triageStatus ?? 'untriaged';
    if (status === 'untriaged' || status === 'needs_review' || status === 'regression' || status === 'expected_changed') {
      return 0;
    }
    return 1;
  };
  const outcomePriority = (row: EvalRunCompareRowV1) => {
    if (row.outcome === 'regression' || row.outcome === 'changed_unresolved' || row.outcome === 'not_comparable') {
      return 0;
    }
    if (row.outcome === 'baseline_missing' || row.outcome === 'candidate_missing' || row.outcome === 'same_fail') {
      return 1;
    }
    return 2;
  };
  return (
    triagePriority(left) - triagePriority(right) ||
    outcomePriority(left) - outcomePriority(right) ||
    (left.exampleOrdinal ?? Number.MAX_SAFE_INTEGER) - (right.exampleOrdinal ?? Number.MAX_SAFE_INTEGER) ||
    left.datasetExampleId.localeCompare(right.datasetExampleId)
  );
}

function CompareRowQueue({
  rows,
  totalRows,
  selectedDatasetExampleId,
  triageByExampleId,
  triageCounts,
  triageLoading,
  outcomeFilter,
  onOutcomeFilterChange,
  triageFilter,
  onTriageFilterChange,
  onSelect
}: {
  rows: EvalRunCompareRowV1[];
  totalRows: number;
  selectedDatasetExampleId: string | null;
  triageByExampleId: Map<string, EvalRunCompareTriageDto>;
  triageCounts: Record<EvalRunCompareTriageStatusV1Dto | 'untriaged', number>;
  triageLoading: boolean;
  outcomeFilter: CompareOutcomeFilter;
  onOutcomeFilterChange: (filter: CompareOutcomeFilter) => void;
  triageFilter: CompareTriageFilter;
  onTriageFilterChange: (filter: CompareTriageFilter) => void;
  onSelect: (datasetExampleId: string) => void;
}) {
  return (
    <section className="px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--chat-text)]">{EVAL_COPY.rowQueue}</h3>
          <div className="text-xs text-[var(--chat-muted)]">{EVAL_COPY.showCount} {rows.length}/{totalRows}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {triageLoading ? <Loader2 className="size-3 animate-spin text-[var(--chat-muted)]" /> : null}
          <select
            aria-label="Compare outcome filter"
            className="h-8 rounded-md border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-2 text-xs text-[var(--chat-text)]"
            value={outcomeFilter}
            onChange={(event) => onOutcomeFilterChange(event.target.value as CompareOutcomeFilter)}
          >
            <option value="all">全部结果</option>
            {COMPARE_RUN_OUTCOMES.map((outcome) => (
              <option key={outcome} value={outcome}>{COMPARE_RUN_OUTCOME_LABELS[outcome]}</option>
            ))}
          </select>
          <select
            aria-label="Compare triage filter"
            className="h-8 rounded-md border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-2 text-xs text-[var(--chat-text)]"
            value={triageFilter}
            onChange={(event) => onTriageFilterChange(event.target.value as CompareTriageFilter)}
          >
            <option value="all">全部标注</option>
            <option value="untriaged">{COMPARE_TRIAGE_LABELS.untriaged} {triageCounts.untriaged}</option>
            {COMPARE_TRIAGE_STATUSES.map((status) => (
              <option key={status} value={status}>{COMPARE_TRIAGE_LABELS[status]} {triageCounts[status]}</option>
            ))}
          </select>
        </div>
      </div>
      {rows.length === 0 ? <ConsolePanelState title={EVAL_COPY.noResultsMatchFilters} /> : null}
      <div className="grid gap-1">
        {rows.map((row) => {
          const triage = triageByExampleId.get(row.datasetExampleId) ?? null;
          return (
            <button
              key={row.datasetExampleId}
              type="button"
              className={`w-full rounded-[12px] px-3 py-2 text-left transition ${
                row.datasetExampleId === selectedDatasetExampleId ? 'bg-[var(--chat-brand-accent-soft)]' : 'hover:bg-[var(--chat-hover)]'
              }`}
              onClick={() => onSelect(row.datasetExampleId)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-sm font-medium text-[var(--chat-text)]">
                  {row.exampleOrdinal == null ? EVAL_COPY.selected : `${EVAL_COPY.selected} #${row.exampleOrdinal}`}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <CompareTriageBadge status={triage?.triageStatus ?? 'untriaged'} stale={triage?.stale ?? false} />
                  <CompareOutcomeBadge outcome={row.outcome} />
                </div>
              </div>
              <div className="mt-1 truncate text-xs text-[var(--chat-muted)]">
                {formatCompareReason(row.reason)} · {formatShortId(row.datasetExampleId, 14)}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CompareRowDetail({
  row,
  projection,
  baselineRun,
  candidateRun,
  baselineResults,
  candidateResults,
  triage,
  savingTriage,
  hiddenByFilter,
  onSaveTriage,
  onClearTriage
}: {
  row: EvalRunCompareRowV1;
  projection: EvalRunCompareProjectionV1 | null;
  baselineRun: EvalRunDto | null;
  candidateRun: EvalRunDto | null;
  baselineResults: EvalExampleResultDto[];
  candidateResults: EvalExampleResultDto[];
  triage: EvalRunCompareTriageDto | null;
  savingTriage: boolean;
  hiddenByFilter: boolean;
  onSaveTriage: (datasetExampleId: string, draft: EvalRunCompareTriageDraft) => void;
  onClearTriage: (datasetExampleId: string) => void;
}) {
  const baselineResult = row.baseline ? baselineResults.find((result) => result.id === row.baseline?.resultId) ?? null : null;
  const candidateResult = row.candidate ? candidateResults.find((result) => result.id === row.candidate?.resultId) ?? null : null;
  const sourceHref = buildDatasetExampleHref({ datasetId: projection?.datasetId, exampleId: row.datasetExampleId });

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--chat-border)] pb-4">
        <div className="min-w-0">
          <div className="text-xs text-[var(--chat-muted)]">{EVAL_COPY.rowDetail}</div>
          <h2 className="mt-1 truncate text-base font-semibold text-[var(--chat-text)]">
            {row.exampleOrdinal == null ? EVAL_COPY.compareRow : `${EVAL_COPY.selected} #${row.exampleOrdinal}`}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--chat-muted)]">
            <CompareOutcomeBadge outcome={row.outcome} />
            <span>{formatCompareReason(row.reason)}</span>
            <span className="font-mono">{formatShortId(row.datasetExampleId, 16)}</span>
          </div>
        </div>
        {sourceHref ? (
          <Button asChild size="sm" variant="outline">
            <a href={sourceHref}>
              <Database className="size-4" />
              {EVAL_COPY.sourceExample}
            </a>
          </Button>
        ) : null}
      </div>

      {hiddenByFilter ? (
        <div className="mb-4 rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] px-3 py-2 text-sm text-[var(--chat-muted)]">
          {EVAL_COPY.hiddenByFilter}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <CompareSideCard title={EVAL_COPY.baseline} run={baselineRun} side={row.baseline} result={baselineResult} />
        <CompareSideCard title={EVAL_COPY.candidate} run={candidateRun} side={row.candidate} result={candidateResult} />
      </div>

      <CompareTriageEditor
        datasetExampleId={row.datasetExampleId}
        triage={triage}
        saving={savingTriage}
        onSave={onSaveTriage}
        onClear={onClearTriage}
      />
    </section>
  );
}

function CompareTriageEditor({
  datasetExampleId,
  triage,
  saving,
  onSave,
  onClear
}: {
  datasetExampleId: string;
  triage: EvalRunCompareTriageDto | null;
  saving: boolean;
  onSave: (datasetExampleId: string, draft: EvalRunCompareTriageDraft) => void;
  onClear: (datasetExampleId: string) => void;
}) {
  const [status, setStatus] = useState<EvalRunCompareTriageStatusV1Dto>(triage?.triageStatus ?? 'needs_review');
  const [reviewerNote, setReviewerNote] = useState(triage?.reviewerNote ?? '');

  useEffect(() => {
    setStatus(triage?.triageStatus ?? 'needs_review');
    setReviewerNote(triage?.reviewerNote ?? '');
  }, [datasetExampleId, triage?.reviewerNote, triage?.triageStatus]);

  return (
    <section className="mt-4 rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--chat-text)]">{EVAL_COPY.triage}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--chat-muted)]">
            <CompareTriageBadge status={triage?.triageStatus ?? 'untriaged'} stale={triage?.stale ?? false} />
            {triage?.triagedByActorId ? <span>{EVAL_COPY.by} {triage.triagedByActorId}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {triage ? (
            <Button size="sm" variant="outline" disabled={saving} onClick={() => onClear(datasetExampleId)}>
              {EVAL_COPY.clearTriage}
            </Button>
          ) : null}
          <Button size="sm" disabled={saving} onClick={() => onSave(datasetExampleId, { status, reviewerNote })}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {EVAL_COPY.saveTriage}
          </Button>
        </div>
      </div>
      {triage?.stale ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {EVAL_COPY.staleTriage}
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
        <label className="block">
          <div className="mb-1 text-xs text-[var(--chat-muted)]">{EVAL_COPY.triageStatus}</div>
          <select
            className="h-9 w-full rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-3 text-sm text-[var(--chat-text)] outline-none focus:border-[color:var(--chat-border-strong)]"
            value={status}
            onChange={(event) => setStatus(event.target.value as EvalRunCompareTriageStatusV1Dto)}
          >
            {COMPARE_TRIAGE_STATUSES.map((item) => (
              <option key={item} value={item}>{COMPARE_TRIAGE_LABELS[item]}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="mb-1 text-xs text-[var(--chat-muted)]">{EVAL_COPY.triageNote}</div>
          <textarea
            className="min-h-[72px] w-full rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-3 py-2 text-sm leading-6 text-[var(--chat-text)] outline-none focus:border-[color:var(--chat-border-strong)]"
            value={reviewerNote}
            onChange={(event) => setReviewerNote(event.target.value)}
          />
        </label>
      </div>
    </section>
  );
}

function CompareSideCard({
  title,
  run,
  side,
  result
}: {
  title: string;
  run: EvalRunDto | null;
  side: EvalRunCompareSideV1 | null;
  result: EvalExampleResultDto | null;
}) {
  const outputHref = buildOutputRunHref(result);

  return (
    <section className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)]">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[color:var(--chat-border)] p-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--chat-text)]">{title}</h3>
          <div className="mt-1 truncate text-xs text-[var(--chat-muted)]" title={run?.id ?? undefined}>
            {run ? `${run.name?.trim() || EVAL_COPY.evalRunFallback} · ${formatShortId(run.id, 12)}` : '-'}
          </div>
        </div>
        {outputHref ? (
          <Button asChild size="sm" variant="outline">
            <a href={outputHref}>
              <Link2 className="size-4" />
              {EVAL_COPY.outputRun}
            </a>
          </Button>
        ) : null}
      </div>

      {side && result ? (
        <div className="grid gap-3 p-3">
          <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4 lg:grid-cols-2 2xl:grid-cols-4">
            <CompareSideMetric label={EVAL_COPY.status} value={formatResultStatusLabel(side.status)} />
            <CompareSideMetric label={EVAL_COPY.reviewStatus} value={formatReviewStatusLabel(side.reviewStatus)} />
            <CompareSideMetric label={EVAL_COPY.signal} value={formatCompareSignal(side.signal)} />
            <CompareSideMetric label={EVAL_COPY.usage} value={side.usage.totalTokens === null ? '-' : `${side.usage.totalTokens} tokens`} />
            <CompareSideMetric label={EVAL_COPY.duration} value={formatDurationMsValue(side.durationMs)} />
            <CompareSideMetric label={EVAL_COPY.resultUuid} value={formatShortId(side.resultId, 14)} />
          </div>
          {result.error ? <div className="rounded-lg bg-[var(--chat-error-bg)] px-3 py-2 text-sm text-[var(--chat-error-text)]">{result.error}</div> : null}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-xs font-medium text-[var(--chat-muted)]">{EVAL_COPY.outputComparison}</h4>
              <ComparisonBadge outcome={side.comparison.outcome} />
            </div>
            <div className="grid gap-2">
              <TextBlock label={EVAL_COPY.expectedText} text={side.comparison.expectedText} />
              <TextBlock label={EVAL_COPY.actualText} text={side.comparison.actualText} />
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3 text-sm text-[var(--chat-muted)]">{EVAL_COPY.noResults}</div>
      )}
    </section>
  );
}

function CompareSideMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] p-2">
      <div className="text-[var(--chat-muted)]">{label}</div>
      <div className="mt-1 truncate font-medium text-[var(--chat-text)]" title={value}>{value}</div>
    </div>
  );
}

export function EvalConsole({ currentUser }: { currentUser: AuthUserDto }) {
  const state = useEvalConsole();
  const [resultFilters, setResultFilters] = useState<EvalResultFilters>(DEFAULT_RESULT_FILTERS);
  const [compareOutcomeFilter, setCompareOutcomeFilter] = useState<CompareOutcomeFilter>('all');
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
      <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden xl:grid-cols-[320px_360px_minmax(0,1fr)]">
        <EvalScopePanel
          mode={state.mode}
          datasets={state.datasets}
          selectedDataset={state.selectedDataset}
          datasetsLoading={state.datasetsLoading}
          datasetsError={state.datasetsError}
          evalRuns={state.evalRuns}
          evalRunsLoading={state.evalRunsLoading}
          evalRunsError={state.evalRunsError}
          selectedEvalRun={state.selectedEvalRun}
          selectedEvalRunId={state.selectedEvalRunId}
          creatingEvalRun={state.creatingEvalRun}
          runningEvalRun={state.runningEvalRun}
          onSelectDataset={state.selectDataset}
          onSelectMode={state.selectMode}
          onCreateEvalRun={state.createEvalRun}
          onSelectEvalRun={state.selectEvalRun}
          onRunEval={state.runSelectedEvalRun}
        />

        {state.isCompareMode ? (
          <div className="min-h-0 xl:col-span-2">
            <ComparePanelView
              state={state}
              outcomeFilter={compareOutcomeFilter}
              onOutcomeFilterChange={setCompareOutcomeFilter}
            />
          </div>
        ) : (
        <>
        <section className="flex min-h-0 flex-col border-r border-[color:var(--chat-border)] bg-[var(--chat-bg)]">
          {state.selectedEvalRun ? (
            <>
            <div className="flex h-12 items-center justify-between gap-2 border-b border-[color:var(--chat-border)] px-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[var(--chat-text)]">{EVAL_COPY.results}</h2>
                <div className="text-xs text-[var(--chat-muted)]">
                  {EVAL_COPY.showCount} {filteredResults.length}/{state.results.length}
                </div>
              </div>
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
            </>
          ) : (
            <ConsolePanelState title={EVAL_COPY.selectEvalRun} />
          )}
        </section>

        <section className="min-h-0 bg-[var(--chat-surface)]">
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
        </section>
        </>
        )}
      </div>
    </ObservabilityConsoleShell>
  );
}
