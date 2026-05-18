'use client';

import type { DatasetDto, EvalExampleResultDto, EvalExampleResultReviewStatusDto, EvalRunDto } from '@agent-infra/contracts';
import {
  projectEvalExampleResultComparisonV1,
  type EvalResultComparisonOutcomeV1,
  type EvalResultComparisonProjectionV1
} from '@agent-infra/durable-chat-client';
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  FileJson2,
  Link2,
  Loader2,
  LogOut,
  Play,
  RefreshCw,
  Save,
  ScrollText,
  SplitSquareHorizontal
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { usePlaygroundLogout } from '@/components/chat-shell/use-playground-logout';
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

const RESULT_REVIEW_STATUSES: EvalExampleResultReviewStatusDto[] = ['unreviewed', 'pass', 'fail', 'needs_review', 'not_applicable'];

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

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center px-6 text-center text-sm text-[var(--chat-muted)]">
      {label}
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

function DatasetRow({ dataset, selected, onSelect }: { dataset: DatasetDto; selected: boolean; onSelect: (datasetId: string) => void }) {
  return (
    <button
      type="button"
      className={`w-full border-b border-[color:var(--chat-border)] px-4 py-3 text-left transition-colors ${
        selected ? 'bg-[var(--chat-brand-accent-soft)]' : 'hover:bg-[var(--chat-surface-muted)]'
      }`}
      onClick={() => onSelect(dataset.id)}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0 truncate text-sm font-medium text-[var(--chat-text)]">{dataset.name}</div>
        <span className="shrink-0 rounded-md border border-[color:var(--chat-border)] px-2 py-0.5 text-[11px] text-[var(--chat-muted)]">
          {dataset.visibility}
        </span>
      </div>
      <div className="mt-1 truncate text-xs text-[var(--chat-muted)]">updated {formatDateTime(dataset.updatedAt)}</div>
    </button>
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

function EvalSummary({ evalRun }: { evalRun: EvalRunDto }) {
  return (
    <section className="border-b border-[color:var(--chat-border)] px-5 py-4">
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
  onSaveReview
}: {
  evalRun: EvalRunDto | null;
  result: EvalExampleResultDto | null;
  sourceExample: ReturnType<typeof useEvalConsole>['sourceExample'];
  sourceExampleLoading: boolean;
  sourceExampleError: string | null;
  savingReview: boolean;
  mutationError: string | null;
  onSaveReview: (draft: EvalResultReviewDraft) => void;
}) {
  if (!evalRun) {
    return <EmptyState label="Select an eval run" />;
  }
  if (!result) {
    return <EmptyState label="Select a result" />;
  }

  const sourceHref = buildDatasetExampleHref({ datasetId: evalRun.datasetId, exampleId: result.datasetExampleId });
  const outputHref = buildOutputRunHref(result);

  return (
    <div className="min-h-0 overflow-auto px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
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
                Output Run
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {result.error ? <div className="mt-4 rounded-lg bg-[var(--chat-error-bg)] px-3 py-2 text-sm text-[var(--chat-error-text)]">{result.error}</div> : null}
      {mutationError ? <div className="mt-4 rounded-lg bg-[var(--chat-error-bg)] px-3 py-2 text-sm text-[var(--chat-error-text)]">{mutationError}</div> : null}

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
  const logout = usePlaygroundLogout();

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[var(--chat-bg)] text-[var(--chat-text)]">
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-[color:var(--chat-border)] bg-[var(--chat-surface)] px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[color:var(--chat-border-strong)] bg-[var(--chat-surface-muted)] text-[var(--chat-accent)]">
            <ScrollText className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-[var(--chat-text)]">Eval Runs</h1>
            <p className="truncate text-sm text-[var(--chat-muted)]">Dataset-backed regression runs and result review</p>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="/observability/datasets">
              <ArrowLeft className="size-4" />
              Datasets
            </a>
          </Button>
          <div className="hidden min-w-0 max-w-[260px] truncate rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] px-3 py-1.5 text-xs text-[var(--chat-muted)] md:block">
            {currentUser.email}
          </div>
          <Button variant="outline" size="sm" onClick={state.refresh}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Log out"
            onClick={() => {
              void logout();
            }}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[260px_320px_360px_minmax(0,1fr)]">
        <aside className="min-h-0 border-r border-[color:var(--chat-border)] bg-[var(--chat-surface)]">
          <div className="flex h-12 items-center justify-between border-b border-[color:var(--chat-border)] px-4">
            <h2 className="text-sm font-semibold">Datasets</h2>
            {state.datasetsLoading ? <Loader2 className="size-4 animate-spin text-[var(--chat-muted)]" /> : null}
          </div>
          <div className="h-[calc(100dvh-120px)] overflow-auto">
            {state.datasetsError ? <EmptyState label={state.datasetsError} /> : null}
            {!state.datasetsError && state.datasets.length === 0 && !state.datasetsLoading ? <EmptyState label="No datasets" /> : null}
            {state.datasets.map((dataset) => (
              <DatasetRow key={dataset.id} dataset={dataset} selected={dataset.id === state.selectedDatasetId} onSelect={state.selectDataset} />
            ))}
          </div>
        </aside>

        <aside className="min-h-0 border-r border-[color:var(--chat-border)] bg-[var(--chat-bg)]">
          <div className="flex h-12 items-center justify-between gap-2 border-b border-[color:var(--chat-border)] px-4">
            <h2 className="min-w-0 truncate text-sm font-semibold">{state.selectedDataset?.name ?? 'Eval Runs'}</h2>
            <Button size="icon-sm" aria-label="Create eval run" onClick={state.createEvalRun} disabled={!state.selectedDatasetId || state.creatingEvalRun}>
              {state.creatingEvalRun ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            </Button>
          </div>
          <div className="h-[calc(100dvh-120px)] overflow-auto">
            {state.evalRunsError ? <EmptyState label={state.evalRunsError} /> : null}
            {!state.evalRunsError && state.evalRuns.length === 0 && !state.evalRunsLoading ? <EmptyState label="No eval runs" /> : null}
            {state.evalRuns.map((evalRun) => (
              <EvalRunRow key={evalRun.id} evalRun={evalRun} selected={evalRun.id === state.selectedEvalRunId} onSelect={state.selectEvalRun} />
            ))}
          </div>
        </aside>

        <aside className="min-h-0 border-r border-[color:var(--chat-border)] bg-[var(--chat-bg)]">
          <div className="flex h-12 items-center justify-between gap-2 border-b border-[color:var(--chat-border)] px-4">
            <h2 className="text-sm font-semibold">Results</h2>
            <Button size="icon-sm" aria-label="Run eval" onClick={state.runSelectedEvalRun} disabled={!state.selectedEvalRunId || state.runningEvalRun || state.selectedEvalRun?.status !== 'queued'}>
              {state.runningEvalRun ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            </Button>
          </div>
          <div className="h-[calc(100dvh-120px)] overflow-auto">
            {state.resultsError ? <EmptyState label={state.resultsError} /> : null}
            {!state.resultsError && state.selectedEvalRun ? <EvalSummary evalRun={state.selectedEvalRun} /> : null}
            {!state.resultsError && state.results.length === 0 && !state.resultsLoading ? <EmptyState label="No results" /> : null}
            {state.results.map((result) => (
              <ResultRow key={result.id} result={result} selected={result.id === state.selectedResultId} onSelect={state.selectResult} />
            ))}
          </div>
        </aside>

        <section className="min-h-0 bg-[var(--chat-surface)]">
          <ResultDetailPanel
            evalRun={state.selectedEvalRun}
            result={state.selectedResult}
            sourceExample={state.sourceExample}
            sourceExampleLoading={state.sourceExampleLoading}
            sourceExampleError={state.sourceExampleError}
            savingReview={state.savingReview}
            mutationError={state.mutationError}
            onSaveReview={state.saveResultReview}
          />
        </section>
      </div>
    </main>
  );
}
