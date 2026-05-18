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
  ScrollText,
  SplitSquareHorizontal
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

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
import { ObjectContextTrail } from './object-context-trail';
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
  match: 'text match',
  mismatch: 'text differs',
  not_comparable: 'not comparable'
};

const COMPARISON_OUTCOME_CLASSES: Record<EvalResultComparisonOutcomeV1, string> = {
  match: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  mismatch: 'border-amber-200 bg-amber-50 text-amber-800',
  not_comparable: 'border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] text-[var(--chat-muted)]'
};

function formatComparisonLabel(value: string) {
  return value.replaceAll('_', ' ');
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
    return <div className="text-sm text-[var(--chat-muted)]">Diff is unavailable for this result.</div>;
  }

  const expectedTokens = splitComparisonTokens(expectedText);
  const actualTokens = splitComparisonTokens(actualText);
  const maxLength = Math.max(expectedTokens.length, actualTokens.length);

  return (
    <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3">
      <div className="mb-2 text-xs font-medium text-[var(--chat-muted)]">Actual text diff</div>
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
        <div className="text-sm text-[var(--chat-muted)]">No text available.</div>
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
          <h3 className="text-sm font-semibold text-[var(--chat-text)]">Comparison Assist</h3>
        </div>
        <ComparisonBadge outcome={comparison.outcome} />
      </div>

      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--chat-muted)]">
        <span>Assist only; manual Result Review is the review truth.</span>
        <span>reason {formatComparisonLabel(comparison.reason)}</span>
        <span>result {result.status}</span>
        <span>{readEvalResultUsage(result)}</span>
        <span>{readEvalResultDuration(result)}</span>
      </div>

      {comparison.diagnostics.length > 0 ? (
        <div className="mb-3 rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] px-3 py-2 text-xs leading-5 text-[var(--chat-muted)]">
          Diagnostics: {comparison.diagnostics.map(formatComparisonLabel).join(', ')}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <TextBlock label="Expected assistant text" text={comparison.expectedText} />
        <TextBlock label="Actual assistant text" text={comparison.actualText} />
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
      <div className="mb-2 text-xs font-medium text-[var(--chat-muted)]">Actual assistant messages</div>
      <div className="grid gap-2">
        {comparison.actualTextBlocks.map((block, index) => (
          <div key={`${block.messageId}-${index}`} className="rounded-md border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] p-2">
            <div className="mb-1 text-[11px] text-[var(--chat-muted)]">
              Actual Message {index + 1} · {block.seq == null ? 'seq n/a' : `seq ${block.seq}`} · {formatShortId(block.messageId, 10)}
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
            <span className="text-xs font-medium uppercase tracking-normal text-[var(--chat-muted)]">Dataset context</span>
            {datasetsLoading ? <Loader2 className="size-3.5 animate-spin text-[var(--chat-muted)]" /> : null}
          </div>
          <select
            aria-label="Eval dataset"
            className="h-9 w-full rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-3 text-sm text-[var(--chat-text)] outline-none focus:border-[color:var(--chat-border-strong)]"
            value={selectedDataset?.id ?? ''}
            disabled={datasetsLoading || datasets.length === 0}
            onChange={(event) => onSelectDataset(event.target.value)}
          >
            {selectedDataset ? null : <option value="">Select dataset</option>}
            {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}
          </select>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--chat-muted)]">
            {selectedDataset ? (
              <>
                <span>{selectedDataset.visibility}</span>
                <span>updated {formatDateTime(selectedDataset.updatedAt)}</span>
              </>
            ) : (
              <span>{datasetsError ?? 'Select a dataset to review eval runs.'}</span>
            )}
          </div>
        </div>
        <Button
          size="sm"
          aria-label="Create eval run"
          onClick={onCreateEvalRun}
          disabled={!selectedDataset || creatingEvalRun}
        >
          {creatingEvalRun ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          Create eval run
        </Button>
      </div>
      {datasetsError ? (
        <div className="mt-2 rounded-md bg-[var(--chat-error-bg)] px-3 py-2 text-xs text-[var(--chat-error-text)]">{datasetsError}</div>
      ) : null}
    </section>
  );
}

function EvalRunRow({ evalRun, selected, onSelect }: { evalRun: EvalRunDto; selected: boolean; onSelect: (evalRunId: string) => void }) {
  return (
    <button
      type="button"
      className={`w-full border-b border-[color:var(--chat-border)] px-4 py-3 text-left transition-colors ${
        selected ? 'bg-[var(--chat-brand-accent-soft)]' : 'hover:bg-[var(--chat-surface-muted)]'
      }`}
      onClick={() => onSelect(evalRun.id)}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0 truncate font-mono text-xs font-medium text-[var(--chat-text)]">{formatShortId(evalRun.id, 16)}</div>
        <span className="shrink-0 rounded-md border border-[color:var(--chat-border)] px-2 py-0.5 text-[11px] text-[var(--chat-muted)]">
          {evalRun.status}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-[var(--chat-muted)]">
        <span className="truncate">total {readEvalRunTotal(evalRun)}</span>
        <span className="truncate">done {readEvalRunCompleted(evalRun)}</span>
        <span className="truncate">failed {readEvalRunFailed(evalRun)}</span>
      </div>
      <div className="mt-1 truncate text-xs text-[var(--chat-muted)]">created {formatDateTime(evalRun.createdAt)}</div>
    </button>
  );
}

function ResultRow({ result, selected, onSelect }: { result: EvalExampleResultDto; selected: boolean; onSelect: (resultId: string) => void }) {
  return (
    <button
      type="button"
      className={`w-full border-b border-[color:var(--chat-border)] px-4 py-3 text-left transition-colors ${
        selected ? 'bg-[var(--chat-brand-accent-soft)]' : 'hover:bg-[var(--chat-surface-muted)]'
      }`}
      onClick={() => onSelect(result.id)}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0 truncate font-mono text-xs font-medium text-[var(--chat-text)]">
          #{result.exampleOrdinal} {formatShortId(result.datasetExampleId, 10)}
        </div>
        <span className="shrink-0 rounded-md border border-[color:var(--chat-border)] px-2 py-0.5 text-[11px] text-[var(--chat-muted)]">
          {result.status}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[var(--chat-muted)]">
        <span className="truncate">review {result.review?.status ?? 'unreviewed'}</span>
        <span className="truncate">actual {result.actualOutputJson ? 'yes' : 'no'}</span>
        <span className="truncate">{readEvalResultUsage(result)}</span>
        <span className="truncate">{readEvalResultDuration(result)}</span>
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
          <h3 className="text-sm font-semibold text-[var(--chat-text)]">Review Queue</h3>
        </div>
        <span className="text-xs text-[var(--chat-muted)]">
          Showing {visibleCount} of {totalCount}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-[var(--chat-muted)]">
        <label className="block">
          Result
          <select
            aria-label="Result status filter"
            className="mt-1 h-8 w-full rounded-md border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-2 text-xs text-[var(--chat-text)]"
            value={filters.resultStatus}
            onChange={(event) => setFilter('resultStatus', event.target.value as ResultStatusFilter)}
          >
            <option value="all">all</option>
            {RESULT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>

        <label className="block">
          Review
          <select
            aria-label="Review status filter"
            className="mt-1 h-8 w-full rounded-md border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-2 text-xs text-[var(--chat-text)]"
            value={filters.reviewStatus}
            onChange={(event) => setFilter('reviewStatus', event.target.value as ReviewStatusFilter)}
          >
            <option value="all">all</option>
            {RESULT_REVIEW_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>

        <label className="block">
          Comparison
          <select
            aria-label="Comparison outcome filter"
            className="mt-1 h-8 w-full rounded-md border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-2 text-xs text-[var(--chat-text)]"
            value={filters.comparisonOutcome}
            onChange={(event) => setFilter('comparisonOutcome', event.target.value as ComparisonOutcomeFilter)}
          >
            <option value="all">all</option>
            <option value="match">text match</option>
            <option value="mismatch">text differs</option>
            <option value="not_comparable">not comparable</option>
          </select>
        </label>

        <label className="flex items-center gap-2 rounded-md border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-2 py-1.5 text-xs text-[var(--chat-text)]">
          <input
            type="checkbox"
            className="size-3.5"
            checked={filters.errorOnly}
            onChange={(event) => setFilter('errorOnly', event.target.checked)}
          />
          Errors only
        </label>

        <label className="flex items-center gap-2 rounded-md border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-2 py-1.5 text-xs text-[var(--chat-text)]">
          <input
            type="checkbox"
            className="size-3.5"
            checked={filters.missingActualOnly}
            onChange={(event) => setFilter('missingActualOnly', event.target.checked)}
          />
          Missing actual
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...DEFAULT_RESULT_FILTERS, reviewStatus: 'unreviewed' })}
        >
          Unreviewed {queueCounts.unreviewed}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...DEFAULT_RESULT_FILTERS, resultStatus: 'failed' })}
        >
          Failed {queueCounts.failed}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...DEFAULT_RESULT_FILTERS, comparisonOutcome: 'match' })}
        >
          Text Match {queueCounts.match}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...DEFAULT_RESULT_FILTERS, reviewStatus: 'unreviewed', comparisonOutcome: 'mismatch' })}
        >
          Mismatch {queueCounts.mismatch}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...DEFAULT_RESULT_FILTERS, reviewStatus: 'unreviewed', comparisonOutcome: 'not_comparable' })}
        >
          Not Comparable {queueCounts.notComparable}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...DEFAULT_RESULT_FILTERS, errorOnly: true })}
        >
          Errors {queueCounts.error}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...DEFAULT_RESULT_FILTERS, missingActualOnly: true })}
        >
          Missing Actual {queueCounts.missingActual}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange(DEFAULT_RESULT_FILTERS)}>
          Clear
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
        <h3 className="text-sm font-semibold text-[var(--chat-text)]">Result Review</h3>
        <Button size="sm" onClick={() => onSave({ status, reviewerNote })} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-[240px_minmax(0,1fr)]">
        <label className="block text-xs font-medium text-[var(--chat-muted)]">
          Status
          <select
            aria-label="Review decision"
            className="mt-1 h-9 w-full rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-2 text-sm text-[var(--chat-text)]"
            value={status}
            onChange={(event) => setStatus(event.target.value as EvalExampleResultReviewStatusDto)}
          >
            {RESULT_REVIEW_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="block text-xs font-medium text-[var(--chat-muted)]">
          Reviewer Note
          <input
            aria-label="Reviewer Note"
            className="mt-1 h-9 w-full rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-3 text-sm text-[var(--chat-text)] outline-none focus:border-[color:var(--chat-border-strong)]"
            value={reviewerNote}
            onChange={(event) => setReviewerNote(event.target.value)}
          />
        </label>
      </div>
      <div className="mt-2 text-xs text-[var(--chat-muted)]">
        Last review: {result.review?.reviewedAt ? `${formatDateTime(result.review.reviewedAt)} by ${result.review.reviewedByActorId ?? 'unknown'}` : 'not reviewed'}
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
        <div className="min-w-0">
          <ObjectContextTrail
            items={[
              { label: 'Dataset', value: dataset?.name ?? formatShortId(evalRun.datasetId, 12) },
              { label: 'EvalRun', value: formatShortId(evalRun.id, 16) }
            ]}
          />
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="truncate font-mono text-sm font-semibold text-[var(--chat-text)]">{formatShortId(evalRun.id, 16)}</h3>
            <span className="rounded-md border border-[color:var(--chat-border)] px-2 py-0.5 text-xs text-[var(--chat-muted)]">{evalRun.status}</span>
          </div>
        </div>
        <Button size="sm" aria-label="Run eval" onClick={onRun} disabled={running || evalRun.status !== 'queued'}>
          {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          Run eval
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3">
          <div className="text-xs text-[var(--chat-muted)]">Status</div>
          <div className="mt-1 text-sm font-semibold text-[var(--chat-text)]">{evalRun.status}</div>
        </div>
        <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3">
          <div className="text-xs text-[var(--chat-muted)]">Selected</div>
          <div className="mt-1 text-sm font-semibold text-[var(--chat-text)]">{readEvalRunTotal(evalRun)}</div>
        </div>
        <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3">
          <div className="text-xs text-[var(--chat-muted)]">Completed</div>
          <div className="mt-1 text-sm font-semibold text-[var(--chat-text)]">{readEvalRunCompleted(evalRun)}</div>
        </div>
        <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3">
          <div className="text-xs text-[var(--chat-muted)]">Failed</div>
          <div className="mt-1 text-sm font-semibold text-[var(--chat-text)]">{readEvalRunFailed(evalRun)}</div>
        </div>
      </div>
      <div className="mt-3 text-xs leading-5 text-[var(--chat-muted)]">
        Result status: {formatCountMap(evalRun.summary?.results.statusCounts)} · Review status: {formatCountMap(evalRun.summary?.results.reviewStatusCounts)}
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
  mutationError,
  hiddenByFilter,
  onSaveReview
}: {
  evalRun: EvalRunDto | null;
  result: EvalExampleResultDto | null;
  sourceExample: ReturnType<typeof useEvalConsole>['sourceExample'];
  sourceExampleLoading: boolean;
  sourceExampleError: string | null;
  savingReview: boolean;
  mutationError: string | null;
  hiddenByFilter: boolean;
  onSaveReview: (draft: EvalResultReviewDraft) => void;
}) {
  if (!evalRun) {
    return <ConsolePanelState title="Select an eval run" />;
  }
  if (!result) {
    return <ConsolePanelState title="Select a result" description="Choose a result from the selected eval run to inspect output and save a review." />;
  }

  const sourceHref = buildDatasetExampleHref({ datasetId: evalRun.datasetId, exampleId: result.datasetExampleId });
  const outputHref = buildOutputRunHref(result);

  return (
    <div className="min-h-0 overflow-auto px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <ObjectContextTrail
            items={[
              { label: 'DatasetExample', value: formatShortId(result.datasetExampleId, 12), href: sourceHref },
              { label: 'EvalRun', value: formatShortId(evalRun.id, 12) },
              { label: 'Result', value: `#${result.exampleOrdinal}` },
              { label: 'Eval output run', value: formatShortId(result.outputRunId, 12), href: outputHref },
              { label: 'Review', value: result.review?.status ?? 'unreviewed' }
            ]}
          />
          <h2 className="truncate font-mono text-base font-semibold text-[var(--chat-text)]">{result.id}</h2>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--chat-muted)]">
            <span>example {formatShortId(result.datasetExampleId, 12)}</span>
            <span>status {result.status}</span>
            <span>review {result.review?.status ?? 'unreviewed'}</span>
            <span>{readEvalResultUsage(result)}</span>
            <span>{readEvalResultDuration(result)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {sourceHref ? (
            <Button asChild size="sm" variant="outline">
              <a href={sourceHref}>
                <Database className="size-4" />
                Example
              </a>
            </Button>
          ) : null}
          {outputHref ? (
            <Button asChild size="sm" variant="outline">
              <a href={outputHref}>
                <Link2 className="size-4" />
                Eval output run
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {outputHref ? (
        <div className="mt-3 rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] px-3 py-2 text-xs leading-5 text-[var(--chat-muted)]">
          Eval output run is an execution artifact for this eval run. It is linked for debugging and is not shown in normal chat threads.
        </div>
      ) : null}

      {result.error ? <div className="mt-4 rounded-lg bg-[var(--chat-error-bg)] px-3 py-2 text-sm text-[var(--chat-error-text)]">{result.error}</div> : null}
      {mutationError ? <div className="mt-4 rounded-lg bg-[var(--chat-error-bg)] px-3 py-2 text-sm text-[var(--chat-error-text)]">{mutationError}</div> : null}
      {hiddenByFilter ? (
        <div className="mt-4 rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] px-3 py-2 text-sm text-[var(--chat-muted)]">
          Selected result is hidden by the current filters.
        </div>
      ) : null}

      <ComparePanel result={result} />

      <ReviewEditor result={result} saving={savingReview} onSave={onSaveReview} />

      {sourceExampleLoading ? <div className="py-3 text-sm text-[var(--chat-muted)]">Loading source example</div> : null}
      {sourceExampleError ? <div className="py-3 text-sm text-[var(--chat-muted)]">{sourceExampleError}</div> : null}

      <JsonBlock title="Expected Output Snapshot" value={result.expectedOutputJson} />
      <JsonBlock title="Actual Output Snapshot" value={result.actualOutputJson} />
      <JsonBlock title="Baseline Output Snapshot" value={readBaselineOutput(sourceExample)} />
      <JsonBlock title="Input Snapshot" value={result.inputJson} />
      <JsonBlock title="Usage Snapshot" value={result.usageJson} />
      <JsonBlock title="Metadata Snapshot" value={result.metadataJson} />
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

  return (
    <ObservabilityConsoleShell
      activeSection="evals"
      currentUser={currentUser}
      title="Evals"
      subtitle="Dataset-backed regression runs and result review"
      icon={<ScrollText className="size-5" />}
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
          <aside className="min-h-0 border-r border-[color:var(--chat-border)] bg-[var(--chat-bg)]">
            <div className="flex h-12 items-center justify-between gap-2 border-b border-[color:var(--chat-border)] px-4">
              <h2 className="min-w-0 truncate text-sm font-semibold">Eval runs</h2>
              {state.evalRunsLoading ? <Loader2 className="size-4 animate-spin text-[var(--chat-muted)]" /> : null}
            </div>
            <div className="h-full overflow-auto pb-12">
              {state.evalRunsError ? <ConsolePanelState title={state.evalRunsError} /> : null}
              {!state.selectedDataset && !state.datasetsError ? (
                <ConsolePanelState title="Select a dataset" description="Choose a dataset above to load eval runs." />
              ) : null}
              {!state.evalRunsError && state.selectedDataset && state.evalRuns.length === 0 && !state.evalRunsLoading ? (
                <ConsolePanelState title="No eval runs" description="Create an eval run for the selected dataset." />
              ) : null}
              {state.evalRuns.map((evalRun) => (
                <EvalRunRow key={evalRun.id} evalRun={evalRun} selected={evalRun.id === state.selectedEvalRunId} onSelect={state.selectEvalRun} />
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
                <aside className="min-h-0 border-r border-[color:var(--chat-border)] bg-[var(--chat-bg)]">
                  <div className="flex h-12 items-center justify-between gap-2 border-b border-[color:var(--chat-border)] px-4">
                    <h2 className="text-sm font-semibold">Results</h2>
                  </div>
                  <div className="h-full overflow-auto pb-12">
                    {state.resultsError ? <ConsolePanelState title={state.resultsError} /> : null}
                    {!state.resultsError && state.results.length === 0 && !state.resultsLoading ? (
                      <ConsolePanelState title="No results" description="Run this eval run to generate result rows." />
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
                    {!state.resultsError && state.results.length > 0 && filteredResults.length === 0 ? (
                      <ConsolePanelState title="No results match filters" description="Clear or relax the local review filters." />
                    ) : null}
                    {filteredResults.map((result) => (
                      <ResultRow key={result.id} result={result} selected={result.id === state.selectedResultId} onSelect={state.selectResult} />
                    ))}
                  </div>
                </aside>

                <ResultDetailPanel
                  evalRun={state.selectedEvalRun}
                  result={state.selectedResult}
                  sourceExample={state.sourceExample}
                  sourceExampleLoading={state.sourceExampleLoading}
                  sourceExampleError={state.sourceExampleError}
                  savingReview={state.savingReview}
                  mutationError={state.mutationError}
                  hiddenByFilter={selectedResultHiddenByFilter}
                  onSaveReview={state.saveResultReview}
                />
              </div>
            ) : (
              <ConsolePanelState title="Select an eval run" description="Choose an eval run to review its summary, results, and result detail." />
            )}
          </section>
        </div>
      </div>
    </ObservabilityConsoleShell>
  );
}
