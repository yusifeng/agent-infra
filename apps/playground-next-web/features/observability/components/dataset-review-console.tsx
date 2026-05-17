'use client';

import type {
  DatasetDto,
  DatasetExampleDto,
  DatasetExampleReviewEvalEligibilityDto,
  DatasetExampleReviewExclusionReasonDto,
  DatasetExampleReviewStatusDto
} from '@agent-infra/contracts';
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  FileJson2,
  Link2,
  Loader2,
  LogOut,
  RefreshCw,
  Save,
  ShieldAlert
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { usePlaygroundLogout } from '@/components/chat-shell/use-playground-logout';
import { Button } from '@/components/ui/button';
import type { AuthUserDto } from '@/features/auth/dto/project-auth-user-dto';
import { useDatasetReviewConsole, type ExpectedOutputDraft, type ReviewDraft } from '@/features/observability/runtime/use-dataset-review-console';

import {
  buildSourceRunHref,
  formatEligibilityLabel,
  formatExpectedOutputState,
  formatJsonPreview,
  hasOmittedToolSnapshot,
  readCaptureKind
} from '../service/dataset-review';
import { formatDateTime, formatShortId } from '../service/format';

const REVIEW_STATUSES: DatasetExampleReviewStatusDto[] = ['unreviewed', 'needs_expected_output', 'approved', 'excluded'];
const EVAL_ELIGIBILITIES: DatasetExampleReviewEvalEligibilityDto[] = ['default', 'include', 'exclude'];
const EXCLUSION_REASONS: DatasetExampleReviewExclusionReasonDto[] = [
  'failure_case',
  'debug_case',
  'missing_expected_output',
  'not_representative',
  'sensitive_or_unsafe',
  'other'
];

function JsonBlock({ title, value }: { title: string; value: Record<string, unknown> | null | undefined }) {
  return (
    <details className="border-t border-[color:var(--chat-border)] py-3" open={title === 'Input'}>
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--chat-text)]">
        <FileJson2 className="size-4 text-[var(--chat-muted)]" />
        {title}
      </summary>
      <pre className="mt-3 max-h-[280px] overflow-auto rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] p-3 text-xs leading-5 text-[var(--chat-text)]">
        {formatJsonPreview(value)}
      </pre>
    </details>
  );
}

function DatasetRow({
  dataset,
  selected,
  onSelect
}: {
  dataset: DatasetDto;
  selected: boolean;
  onSelect: (datasetId: string) => void;
}) {
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
      <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-xs text-[var(--chat-muted)]">
        <span className="truncate">{dataset.createdByActorId ?? 'unknown actor'}</span>
        <span className="shrink-0">created {formatDateTime(dataset.createdAt)}</span>
      </div>
      <div className="mt-1 text-xs text-[var(--chat-muted)]">
        updated {formatDateTime(dataset.updatedAt)}
      </div>
    </button>
  );
}

function ExampleRow({
  example,
  selected,
  onSelect
}: {
  example: DatasetExampleDto;
  selected: boolean;
  onSelect: (exampleId: string) => void;
}) {
  return (
    <button
      type="button"
      className={`w-full border-b border-[color:var(--chat-border)] px-4 py-3 text-left transition-colors ${
        selected ? 'bg-[var(--chat-brand-accent-soft)]' : 'hover:bg-[var(--chat-surface-muted)]'
      }`}
      onClick={() => onSelect(example.id)}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0 truncate font-mono text-xs font-medium text-[var(--chat-text)]">{formatShortId(example.id, 16)}</div>
        <span className="shrink-0 rounded-md border border-[color:var(--chat-border)] px-2 py-0.5 text-[11px] text-[var(--chat-muted)]">
          {example.review?.status ?? 'unreviewed'}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[var(--chat-muted)]">
        <span className="truncate">run {formatShortId(example.sourceRunId, 10)}</span>
        <span className="truncate">thread {formatShortId(example.sourceThreadId, 10)}</span>
        <span className="truncate">capture {readCaptureKind(example)}</span>
        <span className="truncate">expected {formatExpectedOutputState(example)}</span>
        <span className="truncate">{formatEligibilityLabel(example)}</span>
        <span className="truncate">{formatDateTime(example.createdAt)}</span>
      </div>
    </button>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[180px] items-center justify-center px-6 text-center text-sm text-[var(--chat-muted)]">
      {label}
    </div>
  );
}

function ExpectedOutputEditor({
  example,
  saving,
  onSave
}: {
  example: DatasetExampleDto;
  saving: boolean;
  onSave: (draft: ExpectedOutputDraft) => void;
}) {
  const [text, setText] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const expectedOutput = example.expectedOutput?.expectedOutput;
    setText(expectedOutput?.text ?? '');
    setNotes(expectedOutput?.notes ?? '');
  }, [example.id, example.expectedOutput]);

  return (
    <section className="border-t border-[color:var(--chat-border)] py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--chat-text)]">Expected Output</h3>
        <Button size="sm" onClick={() => onSave({ text, notes })} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save
        </Button>
      </div>
      <label className="block text-xs font-medium text-[var(--chat-muted)]">
        Assistant Text
        <textarea
          className="mt-1 min-h-[120px] w-full resize-y rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3 text-sm text-[var(--chat-text)] outline-none focus:border-[color:var(--chat-border-strong)]"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <label className="mt-3 block text-xs font-medium text-[var(--chat-muted)]">
        Notes
        <textarea
          className="mt-1 min-h-[72px] w-full resize-y rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3 text-sm text-[var(--chat-text)] outline-none focus:border-[color:var(--chat-border-strong)]"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
    </section>
  );
}

function ReviewEditor({
  example,
  saving,
  onSave
}: {
  example: DatasetExampleDto;
  saving: boolean;
  onSave: (draft: ReviewDraft) => void;
}) {
  const review = example.review;
  const [status, setStatus] = useState<DatasetExampleReviewStatusDto>('unreviewed');
  const [evalEligibility, setEvalEligibility] = useState<DatasetExampleReviewEvalEligibilityDto>('default');
  const [exclusionReason, setExclusionReason] = useState<DatasetExampleReviewExclusionReasonDto | ''>('');
  const [reviewerNote, setReviewerNote] = useState('');

  useEffect(() => {
    setStatus(review?.status ?? 'unreviewed');
    setEvalEligibility(review?.evalEligibility ?? 'default');
    setExclusionReason(review?.exclusionReason ?? '');
    setReviewerNote(review?.reviewerNote ?? '');
  }, [example.id, review]);

  return (
    <section className="border-t border-[color:var(--chat-border)] py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--chat-text)]">Review</h3>
        <Button size="sm" onClick={() => onSave({ status, evalEligibility, exclusionReason, reviewerNote })} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          Apply
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block text-xs font-medium text-[var(--chat-muted)]">
          Status
          <select
            className="mt-1 h-9 w-full rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-2 text-sm text-[var(--chat-text)]"
            value={status}
            onChange={(event) => setStatus(event.target.value as DatasetExampleReviewStatusDto)}
          >
            {REVIEW_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="block text-xs font-medium text-[var(--chat-muted)]">
          Eval
          <select
            className="mt-1 h-9 w-full rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-2 text-sm text-[var(--chat-text)]"
            value={evalEligibility}
            onChange={(event) => setEvalEligibility(event.target.value as DatasetExampleReviewEvalEligibilityDto)}
          >
            {EVAL_ELIGIBILITIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="block text-xs font-medium text-[var(--chat-muted)]">
          Reason
          <select
            className="mt-1 h-9 w-full rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-2 text-sm text-[var(--chat-text)]"
            value={exclusionReason}
            onChange={(event) => setExclusionReason(event.target.value as DatasetExampleReviewExclusionReasonDto | '')}
          >
            <option value="">none</option>
            {EXCLUSION_REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>
      <label className="mt-3 block text-xs font-medium text-[var(--chat-muted)]">
        Reviewer Note
        <textarea
          className="mt-1 min-h-[72px] w-full resize-y rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3 text-sm text-[var(--chat-text)] outline-none focus:border-[color:var(--chat-border-strong)]"
          value={reviewerNote}
          onChange={(event) => setReviewerNote(event.target.value)}
        />
      </label>
      <div className="mt-2 text-xs text-[var(--chat-muted)]">
        Last review: {review?.reviewedAt ? `${formatDateTime(review.reviewedAt)} by ${review.reviewedByActorId ?? 'unknown'}` : 'not reviewed'}
      </div>
    </section>
  );
}

function ExampleDetailPanel({
  example,
  loading,
  error,
  savingExpectedOutput,
  savingReview,
  mutationError,
  onSaveExpectedOutput,
  onSaveReview
}: {
  example: DatasetExampleDto | null;
  loading: boolean;
  error: string | null;
  savingExpectedOutput: boolean;
  savingReview: boolean;
  mutationError: string | null;
  onSaveExpectedOutput: (draft: ExpectedOutputDraft) => void;
  onSaveReview: (draft: ReviewDraft) => void;
}) {
  if (loading) {
    return <EmptyState label="Loading example" />;
  }
  if (error) {
    return <EmptyState label={error} />;
  }
  if (!example) {
    return <EmptyState label="Select an example" />;
  }

  const sourceHref = buildSourceRunHref(example);

  return (
    <div className="min-h-0 overflow-auto px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-mono text-base font-semibold text-[var(--chat-text)]">{example.id}</h2>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--chat-muted)]">
            <span>capture {readCaptureKind(example)}</span>
            <span>expected {formatExpectedOutputState(example)}</span>
            <span>{formatEligibilityLabel(example)}: {example.effectiveEligibility?.reason ?? 'unknown'}</span>
          </div>
        </div>
        {sourceHref ? (
          <Button asChild size="sm" variant="outline">
            <a href={sourceHref}>
              <Link2 className="size-4" />
              Source
            </a>
          </Button>
        ) : (
          <div className="rounded-lg border border-[color:var(--chat-border)] px-3 py-1.5 text-xs text-[var(--chat-muted)]">Source unavailable</div>
        )}
      </div>

      {mutationError ? <div className="mt-4 rounded-lg bg-[var(--chat-error-bg)] px-3 py-2 text-sm text-[var(--chat-error-text)]">{mutationError}</div> : null}

      <ExpectedOutputEditor example={example} saving={savingExpectedOutput} onSave={onSaveExpectedOutput} />
      <ReviewEditor example={example} saving={savingReview} onSave={onSaveReview} />

      <section className="border-t border-[color:var(--chat-border)] py-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--chat-text)]">
          <ShieldAlert className="size-4 text-[var(--chat-muted)]" />
          Tool Snapshot
        </div>
        <p className="text-xs leading-5 text-[var(--chat-muted)]">
          Captured tool input and output can contain sensitive data. Full payload copy, export, and download actions are intentionally absent in v1.
        </p>
        {hasOmittedToolSnapshot(example) ? (
          <div className="mt-2 rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] px-3 py-2 text-xs text-[var(--chat-muted)]">
            Tool invocation snapshot omitted by policy.
          </div>
        ) : null}
      </section>

      <JsonBlock title="Input" value={example.inputJson} />
      <JsonBlock title="Baseline Output" value={example.baselineOutputJson} />
      <JsonBlock title="Context Snapshot" value={example.contextSnapshotJson} />
      <JsonBlock title="Tool Invocations Snapshot" value={example.toolInvocationsSnapshotJson} />
      <JsonBlock title="Feedback Snapshot" value={example.metadataJson} />
    </div>
  );
}

export function DatasetReviewConsole({ currentUser }: { currentUser: AuthUserDto }) {
  const state = useDatasetReviewConsole();
  const logout = usePlaygroundLogout();

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[var(--chat-bg)] text-[var(--chat-text)]">
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-[color:var(--chat-border)] bg-[var(--chat-surface)] px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[color:var(--chat-border-strong)] bg-[var(--chat-surface-muted)] text-[var(--chat-accent)]">
            <Database className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-[var(--chat-text)]">Dataset Review</h1>
            <p className="truncate text-sm text-[var(--chat-muted)]">Captured examples, expected outputs, and eval readiness</p>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="/observability">
              <ArrowLeft className="size-4" />
              Runs
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

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[280px_360px_minmax(0,1fr)]">
        <aside className="min-h-0 border-r border-[color:var(--chat-border)] bg-[var(--chat-surface)]">
          <div className="flex h-12 items-center justify-between border-b border-[color:var(--chat-border)] px-4">
            <h2 className="text-sm font-semibold">Datasets</h2>
            {state.datasetsLoading ? <Loader2 className="size-4 animate-spin text-[var(--chat-muted)]" /> : null}
          </div>
          <div className="h-[calc(100dvh-120px)] overflow-auto">
            {state.datasetsError ? <EmptyState label={state.datasetsError} /> : null}
            {!state.datasetsError && state.datasets.length === 0 && !state.datasetsLoading ? <EmptyState label="No datasets" /> : null}
            {state.datasets.map((dataset) => (
              <DatasetRow
                key={dataset.id}
                dataset={dataset}
                selected={dataset.id === state.selectedDatasetId}
                onSelect={state.selectDataset}
              />
            ))}
          </div>
        </aside>

        <aside className="min-h-0 border-r border-[color:var(--chat-border)] bg-[var(--chat-bg)]">
          <div className="flex h-12 items-center justify-between border-b border-[color:var(--chat-border)] px-4">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">{state.selectedDataset?.name ?? 'Examples'}</h2>
            </div>
            {state.examplesLoading ? <Loader2 className="size-4 animate-spin text-[var(--chat-muted)]" /> : null}
          </div>
          <div className="h-[calc(100dvh-120px)] overflow-auto">
            {state.examplesError ? <EmptyState label={state.examplesError} /> : null}
            {!state.examplesError && state.examples.length === 0 && !state.examplesLoading ? <EmptyState label="No examples" /> : null}
            {state.examples.map((example) => (
              <ExampleRow
                key={example.id}
                example={example}
                selected={example.id === state.selectedExampleId}
                onSelect={state.selectExample}
              />
            ))}
          </div>
        </aside>

        <section className="min-h-0 bg-[var(--chat-surface)]">
          <ExampleDetailPanel
            example={state.selectedExample}
            loading={state.exampleDetailLoading}
            error={state.exampleDetailError}
            savingExpectedOutput={state.savingExpectedOutput}
            savingReview={state.savingReview}
            mutationError={state.mutationError}
            onSaveExpectedOutput={state.saveExpectedOutput}
            onSaveReview={state.saveReview}
          />
        </section>
      </div>
    </main>
  );
}
