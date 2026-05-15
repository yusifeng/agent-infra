import type { TraceSpanDto, TraceSpanProjectionDiagnosticsDto, RunTraceResponseDto } from '@agent-infra/contracts';
import { buildTraceSpanViewModel, resolveSelectedTraceSpan } from '@agent-infra/durable-chat-client';
import { AlertTriangle, BotMessageSquare, CheckCircle2, CircleDot, Route, Wrench, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

import { formatDateTime, formatDurationMs } from '../service/format';

type TraceTabProps = {
  trace: RunTraceResponseDto | null;
  loading: boolean;
  error: string | null;
};

function spanIcon(span: TraceSpanDto) {
  if (span.kind === 'assistant_message') {
    return <BotMessageSquare className="size-4" />;
  }
  if (span.kind === 'tool_invocation') {
    return <Wrench className="size-4" />;
  }
  if (span.kind === 'runtime_error' || span.kind === 'unknown_event') {
    return <AlertTriangle className="size-4" />;
  }
  return <Route className="size-4" />;
}

function statusClass(status: TraceSpanDto['status']) {
  if (status === 'completed') {
    return 'bg-[var(--chat-status-success-bg)] text-[var(--chat-status-success-text)]';
  }
  if (status === 'failed' || status === 'cancelled') {
    return 'bg-[var(--chat-status-danger-bg)] text-[var(--chat-status-danger-text)]';
  }
  if (status === 'running' || status === 'queued') {
    return 'bg-[var(--chat-status-running-bg)] text-[var(--chat-status-running-text)]';
  }
  return 'bg-[var(--chat-status-idle-bg)] text-[var(--chat-status-idle-text)]';
}

function DiagnosticsPanel({ diagnostics }: { diagnostics: TraceSpanProjectionDiagnosticsDto }) {
  const clean = diagnostics.unknownEventCount === 0 && diagnostics.orphanEventCount === 0 && diagnostics.warnings.length === 0;

  return (
    <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-[var(--chat-text)]">
        {clean ? <CheckCircle2 className="size-4 text-[var(--chat-status-success-text)]" /> : <AlertTriangle className="size-4 text-[var(--chat-warning-text)]" />}
        Diagnostics
      </div>
      {clean ? (
        <div className="mt-2 text-sm text-[var(--chat-muted)]">No projection warnings</div>
      ) : (
        <div className="mt-3 flex flex-col gap-2 text-sm text-[var(--chat-muted)]">
          <div>unknownEventCount: {diagnostics.unknownEventCount}</div>
          <div>orphanEventCount: {diagnostics.orphanEventCount}</div>
          {diagnostics.warnings.map((warning, index) => (
            <div key={`${warning.code}:${index}`} className="rounded-md border border-[color:var(--chat-warning-border)] bg-[var(--chat-warning-bg)] px-2 py-1 text-[var(--chat-warning-text)]">
              {warning.code}: {warning.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SpanDetails({ span }: { span: TraceSpanDto | null }) {
  if (!span) {
    return <div className="rounded-lg border border-[color:var(--chat-border)] p-4 text-sm text-[var(--chat-muted)]">No span selected</div>;
  }

  return (
    <div className="rounded-lg border border-[color:var(--chat-border)] bg-[var(--chat-surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--chat-text)]">{span.name}</div>
          <div className="mt-1 truncate font-mono text-xs text-[var(--chat-muted)]">{span.id}</div>
        </div>
        <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', statusClass(span.status))}>{span.status}</span>
      </div>
      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <div>
          <dt className="text-xs text-[var(--chat-muted)]">kind</dt>
          <dd className="mt-1 text-[var(--chat-text)]">{span.kind}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--chat-muted)]">duration</dt>
          <dd className="mt-1 text-[var(--chat-text)]">{formatDurationMs(span.durationMs)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--chat-muted)]">startedAt</dt>
          <dd className="mt-1 text-[var(--chat-text)]">{formatDateTime(span.startedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--chat-muted)]">finishedAt</dt>
          <dd className="mt-1 text-[var(--chat-text)]">{formatDateTime(span.finishedAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--chat-muted)]">parentSpanId</dt>
          <dd className="mt-1 truncate font-mono text-xs text-[var(--chat-text)]">{span.parentSpanId ?? '-'}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--chat-muted)]">tool</dt>
          <dd className="mt-1 truncate text-[var(--chat-text)]">{span.tool?.toolName ?? '-'}</dd>
        </div>
      </dl>
      {span.error ? (
        <div className="mt-4 rounded-md bg-[var(--chat-error-bg)] px-3 py-2 text-sm text-[var(--chat-error-text)]">
          <XCircle className="mr-1 inline size-4" />
          {span.error.message}
        </div>
      ) : null}
      <div className="mt-4">
        <div className="text-xs font-medium text-[var(--chat-muted)]">sourceRefs</div>
        <pre className="mt-2 max-h-44 overflow-auto rounded-md bg-[var(--chat-code-bg)] p-3 text-xs text-[var(--chat-code-text)]">{JSON.stringify(span.sourceRefs, null, 2)}</pre>
      </div>
    </div>
  );
}

export function TraceTab({ trace, loading, error }: TraceTabProps) {
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const viewModel = useMemo(() => buildTraceSpanViewModel(trace?.projection), [trace?.projection]);
  const selectedSpan = resolveSelectedTraceSpan(viewModel, selectedSpanId);

  if (error) {
    return <div className="rounded-lg bg-[var(--chat-error-bg)] px-3 py-2 text-sm text-[var(--chat-error-text)]">{error}</div>;
  }

  if (loading) {
    return <div className="rounded-lg border border-[color:var(--chat-border)] px-4 py-8 text-center text-sm text-[var(--chat-muted)]">Loading trace</div>;
  }

  if (!trace?.projection || viewModel.rows.length === 0) {
    return <div className="rounded-lg border border-[color:var(--chat-border)] px-4 py-8 text-center text-sm text-[var(--chat-muted)]">No trace spans</div>;
  }

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(360px,1fr)_minmax(320px,420px)]">
      <div className="min-w-0 rounded-lg border border-[color:var(--chat-border)]">
        <div className="border-b border-[color:var(--chat-border)] bg-[var(--chat-surface-muted)] px-3 py-2 text-xs font-medium text-[var(--chat-muted)]">
          {viewModel.rows.length} spans · trace {trace.projection.traceId}
        </div>
        <div className="divide-y divide-[color:var(--chat-border)]">
          {viewModel.rows.map((row) => (
            <button
              key={row.span.id}
              type="button"
              onClick={() => setSelectedSpanId(row.span.id)}
              className={cn(
                'grid w-full grid-cols-[minmax(180px,1fr)_100px_88px] items-center gap-3 px-3 py-3 text-left text-sm hover:bg-[var(--chat-hover)]',
                selectedSpan?.id === row.span.id && 'bg-[var(--chat-brand-accent-soft)]'
              )}
            >
              <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: row.depth * 18 }}>
                <span className={cn('text-[var(--chat-icon-muted)]', row.parentMissing && 'text-[var(--chat-warning-text)]')}>{spanIcon(row.span)}</span>
                <span className="min-w-0 truncate text-[var(--chat-text)]">{row.span.name}</span>
              </div>
              <span className={cn('w-fit rounded-md px-2 py-0.5 text-xs font-medium', statusClass(row.span.status))}>{row.span.status}</span>
              <span className="text-right text-xs text-[var(--chat-muted)]">{formatDurationMs(row.span.durationMs)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <SpanDetails span={selectedSpan} />
        <DiagnosticsPanel diagnostics={trace.projection.diagnostics} />
      </div>
    </div>
  );
}
