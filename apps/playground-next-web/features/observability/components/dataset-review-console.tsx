'use client';

import type {
  DatasetDto,
  DatasetExampleEffectiveEligibilityReasonDto,
  DatasetExampleDto,
  DatasetExampleReviewEvalEligibilityDto,
  DatasetExampleReviewExclusionReasonDto,
  DatasetExampleReviewStatusDto
} from '@agent-infra/contracts';
import {
  CheckCircle2,
  FileJson2,
  Link2,
  Loader2,
  Save
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { MarkdownRenderer } from '@/components/chat-shell/markdown-renderer';
import { Button } from '@/components/ui/button';
import type { AuthUserDto } from '@/features/auth/dto/project-auth-user-dto';
import { useDatasetReviewConsole, type ExpectedOutputDraft, type ReviewDraft } from '@/features/observability/runtime/use-dataset-review-console';

import {
  buildSourceRunHref,
  formatExpectedOutputState,
  formatJsonPreview,
  hasOmittedToolSnapshot,
  readBaselineAssistantTexts,
  readCaptureKind
} from '../service/dataset-review';
import { formatDateTime, formatShortId } from '../service/format';
import { ConsolePanelState } from './console-panel-state';
import { ObservabilityConsoleShell } from './observability-console-shell';

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

const DATASET_REVIEW_COPY = {
  datasets: '数据集',
  examples: '样本',
  noDatasets: '暂无数据集',
  noExamples: '暂无样本',
  loadingExample: '正在加载样本',
  selectExample: '选择一个样本',
  sourceRun: '来源 Run',
  sourceRunUnavailable: '来源 Run 不可用。',
  sourceRunFallback: '来源 Run',
  exampleFallback: '样本',
  outputComparison: '输出对照',
  sourceRunOutput: '原始 Run 回复',
  sourceRunOutputMeta: 'baseline output / 只读',
  sourceRunOutputEmpty: '未捕获原始 Run 回复，可在下方 JSON 中查看原始快照。',
  expectedOutput: '期望输出',
  expectedOutputMeta: '保存后用于评估',
  assistantText: '期望助手回复',
  notes: '期望输出备注',
  save: '保存',
  review: '审核',
  apply: '应用',
  status: '状态',
  eval: '评估',
  reason: '原因',
  noReason: '无',
  reviewerNote: '审核备注',
  lastReview: '最近审核',
  notReviewed: '未审核',
  saveFailed: '保存失败',
  by: '由',
  unknown: '未知',
  normalExample: '常规样本',
  expectedPrefix: '期望输出',
  exampleUuid: '样本 UUID',
  datasetUuid: '数据集 UUID',
  toolSnapshotOmitted: '工具调用快照已按策略省略。',
  input: '输入',
  baselineOutput: '原始 Run 回复 JSON',
  context: '上下文',
  toolCalls: '工具调用',
  feedback: '反馈'
} as const;

const REVIEW_STATUS_LABELS: Record<DatasetExampleReviewStatusDto, string> = {
  unreviewed: '未审核',
  needs_expected_output: '需要期望输出',
  approved: '已通过',
  excluded: '已排除'
};

const EVAL_ELIGIBILITY_LABELS: Record<DatasetExampleReviewEvalEligibilityDto, string> = {
  default: '默认',
  include: '纳入',
  exclude: '排除'
};

const EXCLUSION_REASON_LABELS: Record<DatasetExampleReviewExclusionReasonDto, string> = {
  failure_case: '失败案例',
  debug_case: '调试案例',
  missing_expected_output: '缺少期望输出',
  not_representative: '不具代表性',
  sensitive_or_unsafe: '敏感或不安全',
  other: '其他'
};

const EXPECTED_OUTPUT_STATE_LABELS: Record<'missing' | 'valid' | 'invalid', string> = {
  missing: '未填写',
  valid: '有效',
  invalid: '无效'
};

const EFFECTIVE_ELIGIBILITY_REASON_LABELS: Record<DatasetExampleEffectiveEligibilityReasonDto, string> = {
  eligible_default: '默认可评估',
  eligible_included_by_review: '审核后纳入',
  ineligible_unreviewed: '尚未审核',
  ineligible_needs_expected_output: '需要期望输出',
  ineligible_missing_expected_output: '缺少期望输出',
  ineligible_invalid_expected_output: '期望输出无效',
  ineligible_excluded_by_review: '审核后排除',
  ineligible_capture_default: '采集默认不可评估',
  ineligible_contradictory_review_state: '审核状态冲突'
};

const DATASET_VISIBILITY_LABELS: Record<string, string> = {
  private: '私有',
  public: '公开'
};

const CAPTURE_KIND_LABELS: Record<string, string> = {
  normal_example: DATASET_REVIEW_COPY.normalExample
};

function formatReviewStatusLabel(status: DatasetExampleReviewStatusDto) {
  return REVIEW_STATUS_LABELS[status] ?? status;
}

function formatEvalEligibilityLabel(value: DatasetExampleReviewEvalEligibilityDto) {
  return EVAL_ELIGIBILITY_LABELS[value] ?? value;
}

function formatExclusionReasonLabel(value: DatasetExampleReviewExclusionReasonDto) {
  return EXCLUSION_REASON_LABELS[value] ?? value;
}

function formatDatasetVisibilityLabel(value: string) {
  return DATASET_VISIBILITY_LABELS[value] ?? value;
}

function formatCaptureKindLabel(example: DatasetExampleDto | null | undefined) {
  const kind = readCaptureKind(example);
  return CAPTURE_KIND_LABELS[kind] ?? kind;
}

function formatExpectedOutputStateLabel(example: DatasetExampleDto | null | undefined) {
  const state = formatExpectedOutputState(example);
  return EXPECTED_OUTPUT_STATE_LABELS[state] ?? state;
}

function formatEffectiveEligibilityLabel(example: DatasetExampleDto | null | undefined) {
  const eligibility = example?.effectiveEligibility;
  if (!eligibility) {
    return DATASET_REVIEW_COPY.unknown;
  }

  return eligibility.eligible ? '可评估' : '不可评估';
}

function formatEffectiveEligibilityReasonLabel(reason: DatasetExampleEffectiveEligibilityReasonDto | null | undefined) {
  return reason ? EFFECTIVE_ELIGIBILITY_REASON_LABELS[reason] ?? reason : DATASET_REVIEW_COPY.unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readDatasetMessagePartText(part: unknown) {
  if (!isRecord(part)) {
    return null;
  }

  const type = typeof part.type === 'string' ? part.type : null;
  if (type && type !== 'text') {
    return null;
  }

  const value = part.textValue ?? part.text;
  return typeof value === 'string' ? value : null;
}

function readDatasetMessagePreview(message: unknown) {
  if (!isRecord(message)) {
    return null;
  }

  const parts = Array.isArray(message.parts) ? message.parts : [];
  const text = parts
    .map(readDatasetMessagePartText)
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text ? text.slice(0, 96) : null;
}

function readExampleTriggerPreview(example: DatasetExampleDto) {
  const input = example.inputJson;
  const triggerMessageId = typeof input.triggerMessageId === 'string' ? input.triggerMessageId : example.triggerMessageId;
  const triggerMessagePreview = readDatasetMessagePreview(input.triggerMessage);
  if (triggerMessagePreview) {
    return triggerMessagePreview;
  }

  if (!triggerMessageId || !Array.isArray(input.messages)) {
    return null;
  }

  const triggerMessage = input.messages.find((message) => {
    if (!isRecord(message)) {
      return false;
    }

    return message.id === triggerMessageId && message.role === 'user';
  });

  return readDatasetMessagePreview(triggerMessage);
}

function formatExampleRowLabel(example: DatasetExampleDto, index: number) {
  return readExampleTriggerPreview(example)
    ?? (example.sourceRunId ? `${DATASET_REVIEW_COPY.sourceRunFallback} ${formatShortId(example.sourceRunId, 12)}` : `${DATASET_REVIEW_COPY.exampleFallback} ${index + 1}`);
}

function JsonBlock({ title, value }: { title: string; value: Record<string, unknown> | null | undefined }) {
  return (
    <details className="border-t border-[color:var(--chat-border)] py-3">
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
      className={`group flex h-10 w-full items-center justify-between rounded-[12px] px-3 text-left transition ${
        selected ? 'bg-[var(--chat-brand-accent-soft)] text-[var(--chat-text)]' : 'text-[var(--chat-text)] hover:bg-[var(--chat-hover)]'
      }`}
      onClick={() => onSelect(dataset.id)}
    >
      <span className="min-w-0 flex-1 truncate text-sm leading-[1.2]" title={dataset.name}>
        {dataset.name}
      </span>
      {dataset.visibility !== 'private' ? (
        <span className="ml-2 shrink-0 rounded-md border border-[color:var(--chat-border)] px-2 py-0.5 text-[11px] text-[var(--chat-muted)]">
          {formatDatasetVisibilityLabel(dataset.visibility)}
        </span>
      ) : null}
    </button>
  );
}

function ExampleRow({
  example,
  index,
  selected,
  onSelect
}: {
  example: DatasetExampleDto;
  index: number;
  selected: boolean;
  onSelect: (exampleId: string) => void;
}) {
  const reviewStatus = example.review?.status ?? 'unreviewed';
  const showStatus = reviewStatus !== 'approved';
  const label = formatExampleRowLabel(example, index);

  return (
    <button
      type="button"
      className={`group flex h-10 w-full items-center justify-between rounded-[12px] px-3 text-left transition ${
        selected ? 'bg-[var(--chat-brand-accent-soft)] text-[var(--chat-text)]' : 'text-[var(--chat-text)] hover:bg-[var(--chat-hover)]'
      }`}
      onClick={() => onSelect(example.id)}
    >
      <span className="min-w-0 flex-1 truncate text-sm leading-[1.2]" title={label}>
        {label}
      </span>
      {showStatus ? (
        <span className="ml-2 shrink-0 rounded-md border border-[color:var(--chat-border)] px-2 py-0.5 text-[11px] text-[var(--chat-muted)]">
          {formatReviewStatusLabel(reviewStatus)}
        </span>
      ) : null}
    </button>
  );
}

function BaselineOutputPanel({ example }: { example: DatasetExampleDto }) {
  const assistantTexts = readBaselineAssistantTexts(example);

  return (
    <div className="flex min-h-[240px] flex-col rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)]">
      <div className="border-b border-[color:var(--chat-border)] px-3 py-2">
        <div className="text-sm font-semibold text-[var(--chat-text)]">{DATASET_REVIEW_COPY.sourceRunOutput}</div>
        <div className="mt-0.5 text-xs text-[var(--chat-muted)]">{DATASET_REVIEW_COPY.sourceRunOutputMeta}</div>
      </div>
      <div className="max-h-[500px] min-h-0 flex-1 overflow-auto p-3">
        {assistantTexts.length > 0 ? (
          <div className="flex flex-col gap-3">
            {assistantTexts.map((text, index) => (
              <div
                key={`${index}-${text.slice(0, 24)}`}
                className="rounded-md border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] p-3"
              >
                <MarkdownRenderer
                  animateBlocks={false}
                  cacheKey={`dataset-baseline:${example.id}:${index}`}
                  className="text-sm leading-7 text-[var(--chat-text)]"
                  plainTextClassName="text-sm leading-7 text-[var(--chat-text)]"
                  text={text}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] p-3 text-sm leading-6 text-[var(--chat-muted)]">
            {DATASET_REVIEW_COPY.sourceRunOutputEmpty}
          </div>
        )}
      </div>
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
    <div className="flex min-h-[240px] flex-col rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)]">
      <div className="flex items-start justify-between gap-3 border-b border-[color:var(--chat-border)] px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-[var(--chat-text)]">{DATASET_REVIEW_COPY.expectedOutput}</div>
          <div className="mt-0.5 text-xs text-[var(--chat-muted)]">{DATASET_REVIEW_COPY.expectedOutputMeta}</div>
        </div>
        <Button
          size="sm"
          className="bg-[var(--chat-brand-accent)] text-white hover:bg-[var(--chat-brand-accent-hover)]"
          onClick={() => onSave({ text, notes })}
          disabled={saving}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {DATASET_REVIEW_COPY.save}
        </Button>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3">
        <label className="block flex-1 text-xs font-medium text-[var(--chat-muted)]">
          {DATASET_REVIEW_COPY.assistantText}
          <textarea
            className="mt-1 min-h-[150px] w-full resize-y rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3 text-sm text-[var(--chat-text)] outline-none focus:border-[color:var(--chat-border-strong)]"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <label className="block text-xs font-medium text-[var(--chat-muted)]">
          {DATASET_REVIEW_COPY.notes}
          <textarea
            className="mt-1 min-h-[72px] w-full resize-y rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3 text-sm text-[var(--chat-text)] outline-none focus:border-[color:var(--chat-border-strong)]"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
      </div>
    </div>
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
        <h3 className="text-sm font-semibold text-[var(--chat-text)]">{DATASET_REVIEW_COPY.review}</h3>
        <Button
          size="sm"
          className="bg-[var(--chat-brand-accent)] text-white hover:bg-[var(--chat-brand-accent-hover)]"
          onClick={() => onSave({ status, evalEligibility, exclusionReason, reviewerNote })}
          disabled={saving}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          {DATASET_REVIEW_COPY.apply}
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block text-xs font-medium text-[var(--chat-muted)]">
          {DATASET_REVIEW_COPY.status}
          <select
            className="mt-1 h-9 w-full rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-2 text-sm text-[var(--chat-text)]"
            value={status}
            onChange={(event) => setStatus(event.target.value as DatasetExampleReviewStatusDto)}
          >
            {REVIEW_STATUSES.map((item) => <option key={item} value={item}>{formatReviewStatusLabel(item)}</option>)}
          </select>
        </label>
        <label className="block text-xs font-medium text-[var(--chat-muted)]">
          {DATASET_REVIEW_COPY.eval}
          <select
            className="mt-1 h-9 w-full rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-2 text-sm text-[var(--chat-text)]"
            value={evalEligibility}
            onChange={(event) => setEvalEligibility(event.target.value as DatasetExampleReviewEvalEligibilityDto)}
          >
            {EVAL_ELIGIBILITIES.map((item) => <option key={item} value={item}>{formatEvalEligibilityLabel(item)}</option>)}
          </select>
        </label>
        <label className="block text-xs font-medium text-[var(--chat-muted)]">
          {DATASET_REVIEW_COPY.reason}
          <select
            className="mt-1 h-9 w-full rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] px-2 text-sm text-[var(--chat-text)]"
            value={exclusionReason}
            onChange={(event) => setExclusionReason(event.target.value as DatasetExampleReviewExclusionReasonDto | '')}
          >
            <option value="">{DATASET_REVIEW_COPY.noReason}</option>
            {EXCLUSION_REASONS.map((item) => <option key={item} value={item}>{formatExclusionReasonLabel(item)}</option>)}
          </select>
        </label>
      </div>
      <label className="mt-3 block text-xs font-medium text-[var(--chat-muted)]">
        {DATASET_REVIEW_COPY.reviewerNote}
        <textarea
          className="mt-1 min-h-[72px] w-full resize-y rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-bg)] p-3 text-sm text-[var(--chat-text)] outline-none focus:border-[color:var(--chat-border-strong)]"
          value={reviewerNote}
          onChange={(event) => setReviewerNote(event.target.value)}
        />
      </label>
      <div className="mt-2 text-xs text-[var(--chat-muted)]">
        {DATASET_REVIEW_COPY.lastReview}：{review?.reviewedAt ? `${formatDateTime(review.reviewedAt)} ${DATASET_REVIEW_COPY.by} ${review.reviewedByActorId ?? DATASET_REVIEW_COPY.unknown}` : DATASET_REVIEW_COPY.notReviewed}
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
  onSaveExpectedOutput,
  onSaveReview
}: {
  example: DatasetExampleDto | null;
  loading: boolean;
  error: string | null;
  savingExpectedOutput: boolean;
  savingReview: boolean;
  onSaveExpectedOutput: (draft: ExpectedOutputDraft) => void;
  onSaveReview: (draft: ReviewDraft) => void;
}) {
  if (loading) {
    return <ConsolePanelState title={DATASET_REVIEW_COPY.loadingExample} />;
  }
  if (error) {
    return <ConsolePanelState title={error} />;
  }
  if (!example) {
    return <ConsolePanelState title={DATASET_REVIEW_COPY.selectExample} />;
  }

  const sourceHref = buildSourceRunHref(example);

  return (
    <div className="h-full min-h-0 overflow-auto px-5 py-4">
      <div className="border-b border-[color:var(--chat-border)] pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-[var(--chat-text)]">{DATASET_REVIEW_COPY.exampleFallback}</h2>
            <p className="mt-1 truncate text-xs text-[var(--chat-muted)]">
              {formatCaptureKindLabel(example)} / {DATASET_REVIEW_COPY.expectedPrefix} {formatExpectedOutputStateLabel(example)} / {formatEffectiveEligibilityLabel(example)}
            </p>
          </div>
          {sourceHref ? (
            <Button
              asChild
              size="lg"
              className="bg-[var(--chat-brand-accent)] text-white hover:bg-[var(--chat-brand-accent-hover)]"
            >
              <a href={sourceHref}>
                <Link2 className="size-4" />
                {DATASET_REVIEW_COPY.sourceRun}
              </a>
            </Button>
          ) : (
            <div className="max-w-xs rounded-lg border border-[color:var(--chat-border)] px-3 py-1.5 text-xs leading-5 text-[var(--chat-muted)]">
              {DATASET_REVIEW_COPY.sourceRunUnavailable}
            </div>
          )}
        </div>
        <dl className="mt-4 grid gap-y-3 text-sm md:grid-cols-[minmax(260px,1fr)_minmax(260px,1fr)_minmax(220px,0.8fr)_minmax(200px,0.8fr)]">
          <div className="min-w-0 pr-4 md:border-r md:border-[color:var(--chat-border)]">
            <dt className="text-xs text-[var(--chat-muted)]">{DATASET_REVIEW_COPY.exampleUuid}</dt>
            <dd className="mt-1 break-all font-mono text-xs font-medium text-[var(--chat-text)]">{example.id}</dd>
          </div>
          <div className="min-w-0 px-0 md:border-r md:border-[color:var(--chat-border)] md:px-4">
            <dt className="text-xs text-[var(--chat-muted)]">{DATASET_REVIEW_COPY.datasetUuid}</dt>
            <dd className="mt-1 break-all font-mono text-xs font-medium text-[var(--chat-text)]">{example.datasetId}</dd>
          </div>
          <div className="min-w-0 px-0 md:border-r md:border-[color:var(--chat-border)] md:px-4">
            <dt className="text-xs text-[var(--chat-muted)]">{DATASET_REVIEW_COPY.sourceRun}</dt>
            <dd className="mt-1 break-all font-mono text-xs font-medium text-[var(--chat-text)]">{example.sourceRunId}</dd>
          </div>
          <div className="min-w-0 md:pl-4">
            <dt className="text-xs text-[var(--chat-muted)]">{DATASET_REVIEW_COPY.review}</dt>
            <dd className="mt-1 space-y-0.5 font-medium text-[var(--chat-text)]">
              <div>{formatReviewStatusLabel(example.review?.status ?? 'unreviewed')}</div>
              <div className="text-xs text-[var(--chat-muted)]">{formatEffectiveEligibilityReasonLabel(example.effectiveEligibility?.reason)}</div>
            </dd>
          </div>
        </dl>
      </div>

      <section className="border-t border-[color:var(--chat-border)] py-4">
        <h3 className="mb-3 text-sm font-semibold text-[var(--chat-text)]">{DATASET_REVIEW_COPY.outputComparison}</h3>
        <div className="grid gap-4 xl:grid-cols-2">
          <ExpectedOutputEditor example={example} saving={savingExpectedOutput} onSave={onSaveExpectedOutput} />
          <BaselineOutputPanel example={example} />
        </div>
      </section>
      <ReviewEditor example={example} saving={savingReview} onSave={onSaveReview} />

      {hasOmittedToolSnapshot(example) ? (
        <div className="border-t border-[color:var(--chat-border)] py-4">
          <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] px-3 py-2 text-xs text-[var(--chat-muted)]">
            {DATASET_REVIEW_COPY.toolSnapshotOmitted}
          </div>
        </div>
      ) : null}

      <JsonBlock title={DATASET_REVIEW_COPY.input} value={example.inputJson} />
      <JsonBlock title={DATASET_REVIEW_COPY.baselineOutput} value={example.baselineOutputJson} />
      <JsonBlock title={DATASET_REVIEW_COPY.context} value={example.contextSnapshotJson} />
      <JsonBlock title={DATASET_REVIEW_COPY.toolCalls} value={example.toolInvocationsSnapshotJson} />
      <JsonBlock title={DATASET_REVIEW_COPY.feedback} value={example.metadataJson} />
    </div>
  );
}

export function DatasetReviewConsole({ currentUser }: { currentUser: AuthUserDto }) {
  const state = useDatasetReviewConsole();

  useEffect(() => {
    if (state.mutationError) {
      toast.error(DATASET_REVIEW_COPY.saveFailed, {
        description: state.mutationError
      });
    }
  }, [state.mutationError]);

  return (
    <ObservabilityConsoleShell
      activeSection="datasets"
      currentUser={currentUser}
      onRefresh={state.refresh}
      sectionHrefs={{
        evals: state.selectedDatasetId ? `/observability/evals?datasetId=${encodeURIComponent(state.selectedDatasetId)}` : '/observability/evals'
      }}
    >
      <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[280px_360px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r border-[color:var(--chat-border)] bg-[var(--chat-surface)]">
          <div className="flex h-12 items-center justify-between border-b border-[color:var(--chat-border)] px-4">
            <h2 className="text-sm font-semibold">{DATASET_REVIEW_COPY.datasets}</h2>
            {state.datasetsLoading ? <Loader2 className="size-4 animate-spin text-[var(--chat-muted)]" /> : null}
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
            {state.datasetsError ? <ConsolePanelState title={state.datasetsError} /> : null}
            {!state.datasetsError && state.datasets.length === 0 && !state.datasetsLoading ? (
              <ConsolePanelState title={DATASET_REVIEW_COPY.noDatasets} />
            ) : null}
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

        <aside className="flex min-h-0 flex-col border-r border-[color:var(--chat-border)] bg-[var(--chat-bg)]">
          <div className="flex h-12 items-center justify-between border-b border-[color:var(--chat-border)] px-4">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">{state.selectedDataset?.name ?? DATASET_REVIEW_COPY.examples}</h2>
            </div>
            {state.examplesLoading ? <Loader2 className="size-4 animate-spin text-[var(--chat-muted)]" /> : null}
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
            {state.examplesError ? <ConsolePanelState title={state.examplesError} /> : null}
            {!state.examplesError && state.examples.length === 0 && !state.examplesLoading ? (
              <ConsolePanelState title={DATASET_REVIEW_COPY.noExamples} />
            ) : null}
            {state.examples.map((example, index) => (
              <ExampleRow
                key={example.id}
                example={example}
                index={index}
                selected={example.id === state.selectedExampleId}
                onSelect={state.selectExample}
              />
            ))}
          </div>
        </aside>

        <section className="h-full min-h-0 overflow-hidden bg-[var(--chat-surface)]">
          <ExampleDetailPanel
            example={state.selectedExample}
            loading={state.exampleDetailLoading}
            error={state.exampleDetailError}
            savingExpectedOutput={state.savingExpectedOutput}
            savingReview={state.savingReview}
            onSaveExpectedOutput={state.saveExpectedOutput}
            onSaveReview={state.saveReview}
          />
        </section>
      </div>
    </ObservabilityConsoleShell>
  );
}
